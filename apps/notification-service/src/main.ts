import { NestFactory } from "@nestjs/core";
import { MicroserviceOptions, Transport } from "@nestjs/microservices";
import { Logger, logStartupBanner, checkTcpConnection } from "@cube/logger";
import { AppModule } from "./app.module";

async function bootstrap() {
  const rabbitmqUrl = process.env.RABBITMQ_URL || "amqp://localhost:5672";

  // Verify RabbitMQ is running before booting
  const rmqConnected = await checkTcpConnection(rabbitmqUrl, 5672);

  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  app.useLogger(app.get(Logger));

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.RMQ,
    options: {
      urls: [rabbitmqUrl],
      queue: "SMS_SERVICE",
      queueOptions: { durable: true },
      prefetchCount: 10,
    },
  });

  await app.startAllMicroservices();

  const port = process.env.PORT || 3003;
  await app.listen(port);

  logStartupBanner("Notification Service", {
    Type: "Hybrid Microservice (RabbitMQ + WebSockets)",
    "Queue Name": "SMS_SERVICE",
    "HTTP/WS Port": port,
    Environment: process.env.NODE_ENV || "development",
    RabbitMQ: rmqConnected,
  });
}
bootstrap();
