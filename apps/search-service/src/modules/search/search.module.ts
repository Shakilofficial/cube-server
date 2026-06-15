import { Module } from '@nestjs/common';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { IndexingModule } from '../indexing/indexing.module';

@Module({
  imports: [IndexingModule],
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule {}
