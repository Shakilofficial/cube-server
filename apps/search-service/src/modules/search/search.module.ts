import { Module } from "@nestjs/common";
import { SearchController } from "./search.controller";
import { SearchService } from "./search.service";
import { IndexingModule } from "../indexing/indexing.module";
import { SearchFallbackHelper } from "./helpers/fallback.helper";

@Module({
  imports: [IndexingModule],
  controllers: [SearchController],
  providers: [SearchService, SearchFallbackHelper],
  exports: [SearchService, SearchFallbackHelper],
})
export class SearchModule {}
