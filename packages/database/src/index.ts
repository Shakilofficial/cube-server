import { Module } from '@nestjs/common';

export { Module };

@Module({})
export class PrismaModule {}

export interface IPrismaService {
  $connect(): Promise<void>;
  $disconnect(): Promise<void>;
}
