import { Injectable, OnApplicationBootstrap } from "@nestjs/common";
import { InjectRedis } from "@nestjs-modules/ioredis";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "./prisma/prisma.service";
import { logStartupBanner, checkTcpConnection } from "@cube/logger";
import Redis from "ioredis";

@Injectable()
export class ConnectionCheckService implements OnApplicationBootstrap {
  constructor(
    @InjectRedis() private readonly redis: Redis,
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async onApplicationBootstrap() {
    let postgresConnected = false;
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      postgresConnected = true;
    } catch {
      postgresConnected = false;
    }

    let redisConnected = false;
    try {
      const ping = await this.redis.ping();
      redisConnected = ping === "PONG";
    } catch {
      redisConnected = false;
    }

    const rabbitmqUrl =
      this.configService.get<string>("RABBITMQ_URL") || "amqp://localhost:5672";
    const rabbitmqConnected = await checkTcpConnection(rabbitmqUrl, 5672);

    const port = this.configService.get<number>("PORT") || 3001;
    logStartupBanner("Auth Service", {
      Port: port,
      Environment: process.env.NODE_ENV || "development",
      PostgreSQL: postgresConnected,
      "Redis Cache": redisConnected,
      "RabbitMQ Queue": rabbitmqConnected,
    });
  }
}
