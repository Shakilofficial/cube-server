import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { RedisModule } from "@nestjs-modules/ioredis";
import { JwtModule } from "@nestjs/jwt";
import { PrismaModule } from "./core/prisma/prisma.module";
import { LoggerModule } from "@cube/logger";
import { MessagingModule } from "@cube/messaging";
import { InventoryModule } from "./modules/inventory/inventory.module";
import { WorkerModule } from "./modules/worker/worker.module";
import { APP_FILTER, APP_INTERCEPTOR } from "@nestjs/core";
import { TransformInterceptor, HttpExceptionFilter } from "@cube/common";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    RedisModule.forRootAsync({
      useFactory: (configService: ConfigService) => ({
        config: {
          url:
            configService.get<string>("REDIS_URL") || "redis://localhost:6379",
        },
      }),
      inject: [ConfigService],
    }),
    JwtModule.register({ global: true }),
    PrismaModule,
    LoggerModule,
    MessagingModule,
    InventoryModule,
    WorkerModule,
  ],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: TransformInterceptor,
    },
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
  ],
})
export class AppModule {}
