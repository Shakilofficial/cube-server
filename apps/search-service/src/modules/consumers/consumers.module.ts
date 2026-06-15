import { Module } from '@nestjs/common';
import { ProductEventsConsumer } from './product-events.consumer';
import { IndexingModule } from '../indexing/indexing.module';

@Module({
  imports: [IndexingModule],
  controllers: [ProductEventsConsumer],
})
export class ConsumersModule {}
