import { Module } from '@nestjs/common';
import { ProductController } from './product.controller';
import { ProductService } from './product.service';
import { createRabbitMQClient } from '@cube/messaging';

@Module({
  imports: [createRabbitMQClient('PRODUCT_EVENTS_QUEUE')],
  controllers: [ProductController],
  providers: [ProductService],
  exports: [ProductService],
})
export class ProductModule {}
