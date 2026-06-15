import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from '@cube/logger';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { TransformInterceptor, HttpExceptionFilter } from '@cube/common';
import { IndexingModule } from './modules/indexing/indexing.module';
import { SearchModule } from './modules/search/search.module';
import { ConsumersModule } from './modules/consumers/consumers.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggerModule,
    IndexingModule,
    SearchModule,
    ConsumersModule,
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
