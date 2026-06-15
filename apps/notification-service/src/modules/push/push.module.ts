import { Module } from '@nestjs/common';
import { PushController } from './push.controller';
import { PushGateway } from './push.gateway';

@Module({
  controllers: [PushController],
  providers: [PushGateway],
})
export class PushModule {}
