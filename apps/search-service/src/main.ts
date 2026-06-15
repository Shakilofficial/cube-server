import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { Logger, logStartupBanner, checkTcpConnection } from '@cube/logger';
import { AppModule } from './app.module';

async function bootstrap() {
  const rabbitmqUrl = process.env.RABBITMQ_URL || 'amqp://localhost:5672';
  const rmqConnected = await checkTcpConnection(rabbitmqUrl, 5672);

  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.useLogger(app.get(Logger));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.enableVersioning({ type: VersioningType.URI });
  app.enableCors({ origin: process.env.ALLOWED_ORIGINS?.split(',') });

  // Connect as RabbitMQ consumer for product events
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.RMQ,
    options: {
      urls: [rabbitmqUrl],
      queue: 'PRODUCT_EVENTS_QUEUE',
      queueOptions: { durable: true },
      prefetchCount: 10,
    },
  });

  await app.startAllMicroservices();

  const port = process.env.PORT || 3005;
  await app.listen(port);

  logStartupBanner('Search Service', {
    'Type': 'Hybrid (HTTP + RabbitMQ Consumer)',
    'HTTP Port': port,
    'Queue': 'PRODUCT_EVENTS_QUEUE',
    'Environment': process.env.NODE_ENV || 'development',
    'RabbitMQ': rmqConnected,
    'Elasticsearch': process.env.ELASTICSEARCH_NODE || 'http://localhost:9200',
  });
}
bootstrap();
