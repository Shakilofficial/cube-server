import { Module } from '@nestjs/common';
import { ReviewController } from './review.controller';
import { ReviewService } from './review.service';
import { ProductModule } from '../product/product.module';
import { createRabbitMQClient } from '@cube/messaging';

@Module({
  imports: [ProductModule, createRabbitMQClient('PRODUCT_EVENTS_QUEUE')],
  controllers: [ReviewController],
  providers: [ReviewService],
})
export class ReviewModule {}
