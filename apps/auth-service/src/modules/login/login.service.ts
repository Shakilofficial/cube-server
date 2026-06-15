import { SmsPublisher } from '@cube/messaging';
import { InjectRedis } from '@nestjs-modules/ioredis';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { createHash, randomInt } from 'crypto';
import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../../core/prisma/prisma.service';
import { TokenService } from '../session/token.service';
import { LoginRepository } from './login.repository';

const LOCKOUT_ATTEMPTS = 10;
const WINDOW_SECONDS = 900; 
const LOCKOUT_DURATION = 1800; 

@Injectable()
export class LoginService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenService: TokenService,
    private readonly historyRepo: LoginRepository,
    private readonly smsPublisher: SmsPublisher,
    @InjectRedis() private readonly redis: Redis,
  ) {}

  async login(
    emailOrPhone: string,
    password: string,
    ip: string,
    userAgent: string,
  ) {
    const lockKey = `login:lock:${ip}`;
    const attemptKey = `login:attempts:${ip}`;

    // Check hard lockout
    const isLocked = await this.redis.get(lockKey);
    if (isLocked) {
      throw new ForbiddenException(
        'Too many failed attempts. Account temporarily locked. Try again in 30 minutes.',
      );
    }

    const attempts = await this.redis.incr(attemptKey);
    if (attempts === 1) {
      await this.redis.expire(attemptKey, WINDOW_SECONDS);
    }

    if (attempts > LOCKOUT_ATTEMPTS) {
      await this.redis.set(lockKey, '1', 'EX', LOCKOUT_DURATION);
      await this.redis.del(attemptKey);
      throw new ForbiddenException(
        'Too many failed attempts. Account temporarily locked for 30 minutes.',
      );
    }

    // Constant-time user lookup (always bcrypt compare to avoid timing attacks)
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [
          { email: emailOrPhone },
          { phone: emailOrPhone },
        ],
      },
    });

    const DUMMY_HASH =
      '$2b$12$InvalidHashForTimingProtectionXXXXXXXXXXXXXXXXXXXXXXX';
    const hashToCompare = user?.passwordHash ?? DUMMY_HASH;
    const isValid = await bcrypt.compare(password, hashToCompare);

    const success = isValid && user?.status === 'ACTIVE';

    await this.historyRepo.log({
      userId: user?.id,
      success,
      ipAddress: ip,
      userAgent,
      reason: !user
        ? 'user_not_found'
        : !isValid
          ? 'invalid_password'
          : user.status !== 'ACTIVE'
            ? `status_${user.status}`
            : undefined,
    });

    if (!user) {
      throw new UnauthorizedException('User not found.');
    }

    if (!isValid) {
      throw new UnauthorizedException('Incorrect password.');
    }

    if (user.status === 'LOCKED') {
      throw new ForbiddenException('Account locked. Please contact support.');
    }

    if (user.status === 'PENDING') {
      throw new ForbiddenException('Please verify your account before logging in.');
    }

    if (user.status === 'DELETED') {
      throw new ForbiddenException('Account not found.');
    }

    // Clear attempt counter on successful login
    await this.redis.del(attemptKey);

    // Bypass OTP and profile checks for non-customer roles (ADMIN, MANAGER, SUPPORT)
    if (user.role !== 'CUSTOMER') {
      const tokens = await this.issueTokenPair(user.id, user.email || '', user.status, user.role);
      return {
        message: 'Login successful',
        data: tokens,
      };
    }

    // 1. Check if both email and phone are provided
    if (!user.email || !user.phone) {
      const tempToken = this.tokenService.issueTempChallengeToken(user.id, 'profile_completion');
      return {
        message: `Profile completion required. Please provide your missing ${!user.email ? 'email' : 'phone'} to complete your profile.`,
        data: {
          requiresProfileCompletion: true,
          missingField: !user.email ? 'email' : 'phone',
          tempToken,
        },
      };
    }

    // 2. Generate and dispatch login OTP via SMS
    const otpCode = String(randomInt(100000, 999999));
    const otpHash = createHash('sha256').update(otpCode).digest('hex');

    const redisOtpKey = `login:otp:${user.id}`;
    await this.redis.set(redisOtpKey, otpHash, 'EX', 300); // 5 minutes TTL

    await this.smsPublisher.sendOtp(user.phone, 'Cube', otpCode);

    const tempToken = this.tokenService.issueTempChallengeToken(user.id, 'login_otp');

    return {
      message: 'Login OTP sent successfully. Please verify the OTP to complete login.',
      data: {
        requiresOtp: true,
        tempToken,
        ...(process.env.NODE_ENV !== 'production' && { _devCode: otpCode }),
      },
    };
  }

  async completeProfile(userId: string, value: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('User not found.');
    }

    if (!user.email) {
      if (!value.includes('@')) {
        throw new BadRequestException('Invalid email format.');
      }
      const existing = await this.prisma.user.findUnique({ where: { email: value } });
      if (existing) {
        throw new BadRequestException('This email is already in use by another account.');
      }
      await this.prisma.user.update({
        where: { id: userId },
        data: { email: value },
      });
    } else if (!user.phone) {
      const existing = await this.prisma.user.findUnique({ where: { phone: value } });
      if (existing) {
        throw new BadRequestException('This phone number is already in use by another account.');
      }
      await this.prisma.user.update({
        where: { id: userId },
        data: { phone: value },
      });
    } else {
      throw new BadRequestException('Profile is already complete.');
    }

    const updatedUser = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    
    // Generate and dispatch login OTP via SMS
    const otpCode = String(randomInt(100000, 999999));
    const otpHash = createHash('sha256').update(otpCode).digest('hex');

    const redisOtpKey = `login:otp:${userId}`;
    await this.redis.set(redisOtpKey, otpHash, 'EX', 300);

    await this.smsPublisher.sendOtp(updatedUser.phone!, 'Cube', otpCode);

    const tempToken = this.tokenService.issueTempChallengeToken(userId, 'login_otp');

    return {
      message: 'Profile details saved. A login verification code has been sent to your phone number.',
      data: {
        requiresOtp: true,
        tempToken,
        ...(process.env.NODE_ENV !== 'production' && { _devCode: otpCode }),
      },
    };
  }

  async verifyLoginOtp(userId: string, code: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('User not found.');
    }

    const redisOtpKey = `login:otp:${userId}`;
    const storedHash = await this.redis.get(redisOtpKey);
    if (!storedHash) {
      throw new UnauthorizedException('Login OTP has expired or is invalid. Please login again.');
    }

    const inputHash = createHash('sha256').update(code).digest('hex');
    if (inputHash !== storedHash) {
      throw new UnauthorizedException('Invalid login OTP.');
    }

    await this.redis.del(redisOtpKey);

    return this.issueTokenPair(user.id, user.email || '', user.status, user.role);
  }

  async issueTokenPair(userId: string, email: string, status: string, role: string) {
    const family = uuidv4();
    const { token: refreshToken, hash, expiresAt } =
      this.tokenService.issueRefreshToken(userId, family, role);

    await this.prisma.refreshToken.create({
      data: { userId, tokenHash: hash, family, expiresAt },
    });

    return {
      accessToken: this.tokenService.issueAccessToken({
        sub: userId,
        email,
        status,
        role,
      }),
      refreshToken,
      tokenType: 'JWT',
      expiresIn: 900, // 15 minutes in seconds
    };
  }

  async getLoginHistory(userId: string, limit = 20) {
    return this.historyRepo.findByUserId(userId, limit);
  }
}
