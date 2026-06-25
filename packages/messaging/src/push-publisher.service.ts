import { Inject, Injectable } from "@nestjs/common";
import { ClientProxy } from "@nestjs/microservices";

@Injectable()
export class PushPublisher {
  constructor(@Inject("SMS_SERVICE") private readonly client: ClientProxy) {}

  async sendPush(
    userId: string,
    title: string,
    message: string,
    data?: any,
  ): Promise<void> {
    this.client.emit("send_push", { userId, title, message, data });
  }

  async broadcastPush(
    title: string,
    message: string,
    data?: any,
  ): Promise<void> {
    this.client.emit("broadcast_push", { title, message, data });
  }
}
