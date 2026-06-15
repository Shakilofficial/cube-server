import {
  Injectable,
  BadRequestException,
  NotFoundException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { SmsPublisher, EmailPublisher } from '@cube/messaging';
import { ConfigService } from '@nestjs/config';
import { createHash, randomInt } from 'crypto';
import { addMinutes, isAfter } from 'date-fns';

const MAX_ATTEMPTS = 5;
const MAX_RESEND = 3;

@Injectable()
export class VerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly smsPublisher: SmsPublisher,
    private readonly emailPublisher: EmailPublisher,
    private readonly config: ConfigService,
  ) {}

  async verifyEmail(userId: string, code: string): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found.');
    if (user.status === 'ACTIVE') {
      return { message: 'Email is already verified.' };
    }

    const record = await this.prisma.verificationCode.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    if (!record) throw new BadRequestException('No verification code found. Please request a new one.');
    if (record.attempts >= MAX_ATTEMPTS) {
      throw new HttpException('Too many failed attempts. Please request a new code.', HttpStatus.TOO_MANY_REQUESTS);
    }
    if (isAfter(new Date(), record.expiresAt)) {
      throw new BadRequestException('Verification code has expired. Please request a new one.');
    }

    const inputHash = createHash('sha256').update(code).digest('hex');

    if (inputHash !== record.code) {
      await this.prisma.verificationCode.update({
        where: { id: record.id },
        data: { attempts: { increment: 1 } },
      });
      throw new BadRequestException('Invalid verification code.');
    }

    // Activate user and clean up
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { status: 'ACTIVE' },
      }),
      this.prisma.verificationCode.deleteMany({ where: { userId } }),
    ]);

    if (user.email) {
      const name = user.email.split('@')[0];
      await this.emailPublisher.sendWelcomeEmail(user.email, name);
    }

    return { message: 'Account verified successfully. You can now log in.' };
  }

  async resendVerification(userId: string): Promise<{ message: string; _devCode?: string }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found.');
    if (user.status === 'ACTIVE') {
      return { message: 'Account is already verified.' };
    }

    const existing = await this.prisma.verificationCode.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    if (existing && existing.resendCount >= MAX_RESEND) {
      throw new HttpException('Maximum resend limit reached. Please contact support.', HttpStatus.TOO_MANY_REQUESTS);
    }

    const newCode = String(randomInt(10000, 99999));
    const codeHash = createHash('sha256').update(newCode).digest('hex');

    // Invalidate old codes and create new one
    await this.prisma.$transaction([
      this.prisma.verificationCode.deleteMany({ where: { userId } }),
      this.prisma.verificationCode.create({
        data: {
          userId,
          code: codeHash,
          expiresAt: addMinutes(new Date(), 15),
          resendCount: (existing?.resendCount ?? 0) + 1,
        },
      }),
    ]);

    if (user.phone) {
      await this.smsPublisher.sendOtp(user.phone, 'Cube', newCode);
      return {
        message: 'Verification code resent via SMS.',
        ...(process.env.NODE_ENV !== 'production' && { _devCode: newCode }),
      };
    } else if (user.email) {
      const name = user.email.split('@')[0];
      const verifyUrl = `${this.config.get<string>('FRONTEND_URL') || 'http://localhost:3000'}/verify-email?userId=${user.id}&code=${newCode}`;
      await this.emailPublisher.sendOtpEmail(user.email, name, newCode, verifyUrl);
      return {
        message: 'Verification code resent via email.',
        ...(process.env.NODE_ENV !== 'production' && { _devCode: newCode }),
      };
    } else {
      throw new BadRequestException('No verification channel configured.');
    }
  }

  async sendSmsOtp(phone: string): Promise<{ message: string; _devCode?: string }> {
    const code = String(randomInt(1000, 9999));
    await this.smsPublisher.sendOtp(phone, 'Cube', code);

    return {
      message: 'OTP sent successfully to your phone.',
      ...(process.env.NODE_ENV !== 'production' && { _devCode: code }),
    };
  }
}
