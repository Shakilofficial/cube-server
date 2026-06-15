import { Global, Module, OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { SeedService } from './seed.service';

@Global()
@Module({
  providers: [PrismaService, SeedService],
  exports: [PrismaService],
})
export class AuthPrismaModule implements OnApplicationBootstrap {
  constructor(private readonly seedService: SeedService) {}

  async onApplicationBootstrap() {
    await this.seedService.seed();
  }
}
