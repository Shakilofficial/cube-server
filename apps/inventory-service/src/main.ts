import { NestFactory } from "@nestjs/core";
import { MicroserviceOptions, Transport } from "@nestjs/microservices";
import { ValidationPipe, VersioningType } from "@nestjs/common";
import { Logger, logStartupBanner, checkTcpConnection } from "@cube/logger";
import { PrismaService } from "./core/prisma/prisma.service";
import { AppModule } from "./app.module";

async function bootstrap() {
  const rabbitmqUrl = process.env.RABBITMQ_URL || "amqp://localhost:5672";
  const rmqConnected = await checkTcpConnection(rabbitmqUrl, 5672);

  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.useLogger(app.get(Logger));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.enableVersioning({ type: VersioningType.URI });
  app.enableCors({ origin: process.env.ALLOWED_ORIGINS?.split(",") });

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.RMQ,
    options: {
      urls: [rabbitmqUrl],
      queue: "RESERVATION_EXPIRY_QUEUE",
      queueOptions: { durable: true },
      prefetchCount: 10,
    },
  });

  await app.startAllMicroservices();

  const port = process.env.PORT || 3006;
  await app.listen(port);

  const prisma = app.get(PrismaService);
  let postgresConnected = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    postgresConnected = true;
  } catch {
    postgresConnected = false;
  }

  logStartupBanner("Inventory Service", {
    Port: port,
    Environment: process.env.NODE_ENV || "development",
    PostgreSQL: postgresConnected,
    "RabbitMQ Consumer": "RESERVATION_EXPIRY_QUEUE",
    "RabbitMQ Connected": rmqConnected,
  });
}
bootstrap();
