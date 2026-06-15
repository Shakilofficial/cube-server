import { Module } from '@nestjs/common';
import { ProductIndexService } from './product.index';

@Module({
  providers: [ProductIndexService],
  exports: [ProductIndexService],
})
export class IndexingModule {}
