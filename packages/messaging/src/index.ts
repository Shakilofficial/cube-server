import { Global, Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigService } from '@nestjs/config';
import { SmsPublisher } from './sms-publisher.service';
import { EmailPublisher } from './email-publisher.service';
import { PushPublisher } from './push-publisher.service';

export const createRabbitMQClient = (queue: string) =>
  ClientsModule.registerAsync([{
    name: queue,
    useFactory: (config: ConfigService) => ({
      transport: Transport.RMQ,
      options: {
        urls: [config.get<string>('RABBITMQ_URL') || 'amqp://localhost:5672'],
        queue,
        queueOptions: { durable: true },
        prefetchCount: 10,
      },
    }),
    inject: [ConfigService],
  }]);

@Global()
@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: 'SMS_SERVICE',
        useFactory: (config: ConfigService) => ({
          transport: Transport.RMQ,
          options: {
            urls: [config.get<string>('RABBITMQ_URL') || 'amqp://localhost:5672'],
            queue: 'SMS_SERVICE',
            queueOptions: { durable: true },
            prefetchCount: 10,
          },
        }),
        inject: [ConfigService],
      },
    ]),
  ],
  providers: [SmsPublisher, EmailPublisher, PushPublisher],
  exports: [SmsPublisher, EmailPublisher, PushPublisher, ClientsModule],
})
export class MessagingModule {}
export { SmsPublisher } from './sms-publisher.service';
export { EmailPublisher } from './email-publisher.service';
export { PushPublisher } from './push-publisher.service';
