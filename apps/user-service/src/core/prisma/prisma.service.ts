import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { getPrismaClientClass } from '../../../prisma/generated/prisma/internal/class';

const PrismaClient = getPrismaClientClass();

@Injectable()
export class PrismaService
  extends (PrismaClient as any)
  implements OnModuleInit, OnModuleDestroy
{
  private pool: Pool;
  private readonly logger = new Logger('PrismaService');

  constructor() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL environment variable is not defined.');
    }
    const pool = new Pool({ connectionString });
    const adapter = new PrismaPg(pool);
    super({ adapter, log: ['info', 'warn', 'error'] });
    this.pool = pool;
  }

  async onModuleInit() {
    try {
      this.logger.log('Connecting to PostgreSQL database...');
      await (this as any).$connect();
      this.logger.log('PostgreSQL database connection established.');
    } catch (error) {
      this.logger.error('Failed to connect to PostgreSQL database.', error);
      throw error;
    }
  }

  async onModuleDestroy() {
    await (this as any).$disconnect();
    await this.pool.end();
  }
}
