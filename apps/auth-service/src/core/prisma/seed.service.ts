import { Injectable, Logger } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from './prisma.service';

interface SeedUser {
  email: string;
  phone: string;
  role: string;
  password: string;
}

const SEED_USERS: SeedUser[] = [
  { email: 'admin@cube.com', phone: '+10000000001', role: 'ADMIN', password: 'Password123!' },
  { email: 'manager@cube.com', phone: '+10000000002', role: 'MANAGER', password: 'Password123!' },
  { email: 'support@cube.com', phone: '+10000000003', role: 'SUPPORT', password: 'Password123!' },
];

@Injectable()
export class SeedService {
  private readonly logger = new Logger('SeedService');

  constructor(private readonly prisma: PrismaService) {}

  async seed(): Promise<void> {
    for (const item of SEED_USERS) {
      const existing = await (this.prisma as any).user.findFirst({
        where: {
          OR: [{ email: item.email }, { phone: item.phone }],
        },
      });

      if (!existing) {
        const passwordHash = await bcrypt.hash(item.password, 12);
        await (this.prisma as any).user.create({
          data: {
            email: item.email,
            phone: item.phone,
            passwordHash,
            role: item.role,
            status: 'ACTIVE',
          },
        });
        this.logger.log(`Seeded user: ${item.email} with role ${item.role}`);
      }
    }
  }
}
