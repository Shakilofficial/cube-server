import { Controller } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { PushGateway } from './push.gateway';

interface PushPayload {
  userId: string;
  title: string;
  message: string;
  data?: any;
}

@Controller()
export class PushController {
  constructor(private readonly pushGateway: PushGateway) {}

  @EventPattern('send_push')
  async handleSendPush(@Payload() data: PushPayload) {
    this.pushGateway.sendPushToUser(data.userId, 'notification', {
      title: data.title,
      message: data.message,
      data: data.data,
      timestamp: new Date().toISOString(),
    });
  }

  @EventPattern('broadcast_push')
  async handleBroadcastPush(@Payload() data: Omit<PushPayload, 'userId'>) {
    this.pushGateway.broadcastPush('notification', {
      title: data.title,
      message: data.message,
      data: data.data,
      timestamp: new Date().toISOString(),
    });
  }
}
