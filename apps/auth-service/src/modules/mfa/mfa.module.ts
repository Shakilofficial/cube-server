import { Module } from '@nestjs/common';
import { MfaController } from './mfa.controller';
import { MfaService } from './mfa.service';
import { LoginModule } from '../login/login.module';

@Module({
  imports: [LoginModule],
  controllers: [MfaController],
  providers: [MfaService],
})
export class MfaModule {}
