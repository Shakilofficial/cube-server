import { paginationHelper } from '@cube/common';
import { EmailPublisher, SmsPublisher } from '@cube/messaging';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { createHash, randomInt } from 'crypto';
import { addMinutes } from 'date-fns';
import { PrismaService } from '../../core/prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class RegistrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly emailPublisher: EmailPublisher,
    private readonly smsPublisher: SmsPublisher,
  ) {}

  async register(dto: RegisterDto) {
    if (dto.email) {
      const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
      if (existing) {
        throw new ConflictException('An account with this email already exists.');
      }
    }

    if (dto.phone) {
      const existing = await this.prisma.user.findUnique({ where: { phone: dto.phone } });
      if (existing) {
        throw new ConflictException('An account with this phone number already exists.');
      }
    }

    const rounds = Number(this.config.get('BCRYPT_ROUNDS')) || 12;
    const passwordHash = await bcrypt.hash(dto.password, rounds);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email || null,
        phone: dto.phone || null,
        passwordHash,
        status: 'PENDING',
        role: 'CUSTOMER',
      },
    });

    const code = String(randomInt(10000, 99999)); // 5-digit code
    const codeHash = createHash('sha256').update(code).digest('hex');

    await this.prisma.verificationCode.create({
      data: {
        userId: user.id,
        code: codeHash,
        expiresAt: addMinutes(new Date(), 15),
      },
    });

    if (dto.phone) {
      // Send OTP via SMS
      await this.smsPublisher.sendOtp(dto.phone, 'Cube', code);
      return {
        message: 'Registration successful. Please check your phone for a verification code.',
        userId: user.id,
        ...(process.env.NODE_ENV !== 'production' && { _devCode: code }),
      };
    } else {
      // Send OTP via Email
      const verifyUrl = `${this.config.get<string>('FRONTEND_URL') || 'http://localhost:3000'}/verify-email?userId=${user.id}&code=${code}`;
      await this.emailPublisher.sendOtpEmail(dto.email!, dto.name, code, verifyUrl);
      return {
        message: 'Registration successful. Please check your email for a verification code.',
        userId: user.id,
        ...(process.env.NODE_ENV !== 'production' && { _devCode: code }),
      };
    }
  }

  async createUser(dto: CreateUserDto) {
    if (dto.email) {
      const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
      if (existing) {
        throw new ConflictException('An account with this email already exists.');
      }
    }

    if (dto.phone) {
      const existing = await this.prisma.user.findUnique({ where: { phone: dto.phone } });
      if (existing) {
        throw new ConflictException('An account with this phone number already exists.');
      }
    }

    const rounds = Number(this.config.get('BCRYPT_ROUNDS')) || 12;
    const passwordHash = await bcrypt.hash(dto.password, rounds);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email || null,
        phone: dto.phone || null,
        passwordHash,
        status: 'ACTIVE',
        role: dto.role,
      },
    });

    if (user.email) {
      try {
        await this.emailPublisher.sendWelcomeEmail(user.email, dto.name || user.email.split('@')[0]);
      } catch (err: any) {
        console.error('Failed to send welcome email to admin-created user:', err.message || err);
      }
    }

    return {
      id: user.id,
      email: user.email,
      phone: user.phone,
      role: user.role,
    };
  }

  async getAllUsers(options: {
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: string;
    role?: string;
    status?: string;
    search?: string;
    ids?: string;
  }) {
    const { page, limit, skip, sortBy, sortOrder } =
      paginationHelper.calculatePagination(options);

    const where: any = {};

    if (options.role) {
      where.role = options.role;
    }

    if (options.status) {
      where.status = options.status;
    }

    if (options.ids) {
      const idList = options.ids
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean);
      if (idList.length > 0) {
        where.id = { in: idList };
      }
    }

    if (options.search) {
      where.OR = [
        { email: { contains: options.search, mode: 'insensitive' } },
        { phone: { contains: options.search, mode: 'insensitive' } },
      ];
    }

    const total = await this.prisma.user.count({ where });

    // Validate if field exists on model
    const allowedSortFields = ['createdAt', 'email', 'phone', 'role', 'status'];
    const finalSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'createdAt';

    const users = await this.prisma.user.findMany({
      where,
      skip,
      take: limit,
      orderBy: {
        [finalSortBy]: sortOrder,
      },
      select: {
        id: true,
        email: true,
        phone: true,
        role: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return {
      meta: {
        page,
        limit,
        total,
      },
      data: users,
    };
  }

  async getUserById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        phone: true,
        role: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found.`);
    }

    return user;
  }
}

