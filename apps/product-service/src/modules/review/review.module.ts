import { Module } from "@nestjs/common";
import { ReviewController } from "./review.controller";
import { ReviewService } from "./review.service";
import { ProductModule } from "../product/product.module";
import { ReviewHelper } from "./helpers/review.helper";

@Module({
  imports: [ProductModule],
  controllers: [ReviewController],
  providers: [ReviewService, ReviewHelper],
})
export class ReviewModule {}
