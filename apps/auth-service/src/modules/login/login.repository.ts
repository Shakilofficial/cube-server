import { PrismaService } from '../../core/prisma/prisma.service';
import { Injectable } from '@nestjs/common';

interface LoginHistoryData {
  userId?: string;
  success: boolean;
  ipAddress: string;
  userAgent: string;
  reason?: string;
}

@Injectable()
export class LoginRepository {
  constructor(private readonly prisma: PrismaService) {}

  async log(data: LoginHistoryData): Promise<void> {
    if (!data.userId) return;
    await this.prisma.loginHistory.create({
      data: {
        userId: data.userId,
        success: data.success,
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
        reason: data.reason,
      },
    });
  }

  async findByUserId(userId: string, limit = 20) {
    return this.prisma.loginHistory.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}
