import { Module } from '@nestjs/common';
import { SessionController } from './session.controller';
import { SessionService } from './session.service';
import { TokenService } from './token.service';
import { BlacklistService } from './blacklist.service';

@Module({
  imports: [],
  controllers: [SessionController],
  providers: [SessionService, TokenService, BlacklistService],
  exports: [TokenService, BlacklistService, SessionService],
})
export class SessionModule {}
