import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { LoggerModule } from "@cube/logger";
import { EmailModule } from "./modules/email/email.module";
import { SmsModule } from "./modules/sms/sms.module";
import { PushModule } from "./modules/push/push.module";
import { APP_FILTER, APP_INTERCEPTOR } from "@nestjs/core";
import { TransformInterceptor, HttpExceptionFilter } from "@cube/common";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggerModule,
    EmailModule,
    SmsModule,
    PushModule,
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
