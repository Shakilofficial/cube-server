import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { RedisModule } from "@nestjs-modules/ioredis";
import { JwtModule } from "@nestjs/jwt";
import { AuthPrismaModule } from "./core/prisma/prisma.module";
import { LoggerModule } from "@cube/logger";
import { MessagingModule } from "@cube/messaging";
import { RegistrationModule } from "./modules/registration/registration.module";
import { VerificationModule } from "./modules/verification/verification.module";
import { LoginModule } from "./modules/login/login.module";
import { SessionModule } from "./modules/session/session.module";
import { PasswordModule } from "./modules/password/password.module";
import { MfaModule } from "./modules/mfa/mfa.module";
import { OauthModule } from "./modules/oauth/oauth.module";
import { ConnectionCheckService } from "./core/connection-check.service";
import { APP_FILTER, APP_INTERCEPTOR } from "@nestjs/core";
import { TransformInterceptor, HttpExceptionFilter } from "@cube/common";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    RedisModule.forRootAsync({
      useFactory: (configService: ConfigService) => ({
        config: {
          url:
            configService.get<string>("REDIS_URL") || "redis://localhost:6379",
        },
      }),
      inject: [ConfigService],
    }),
    JwtModule.register({
      global: true,
    }),
    AuthPrismaModule,
    LoggerModule,
    MessagingModule,
    RegistrationModule,
    VerificationModule,
    LoginModule,
    SessionModule,
    PasswordModule,
    MfaModule,
    OauthModule,
  ],
  providers: [
    ConnectionCheckService,
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
