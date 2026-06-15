import { Module } from '@nestjs/common';
import { LoginController } from './login.controller';
import { LoginService } from './login.service';
import { LoginRepository } from './login.repository';
import { SessionModule } from '../session/session.module';

@Module({
  imports: [SessionModule],
  controllers: [LoginController],
  providers: [LoginService, LoginRepository],
  exports: [LoginService],
})
export class LoginModule {}
