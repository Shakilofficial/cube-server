import { Module } from '@nestjs/common';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';
import { PrismaModule } from '../../core/prisma/prisma.module';
import { SearchModule } from '../../core/search/search.module';

@Module({
  imports: [PrismaModule, SearchModule],
  controllers: [ProfileController],
  providers: [ProfileService],
  exports: [ProfileService],
})
export class ProfileModule {}
