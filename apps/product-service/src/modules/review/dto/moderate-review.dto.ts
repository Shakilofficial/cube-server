import { IsEnum } from "class-validator";
import { ReviewStatus } from "../../../../prisma/generated/prisma/enums";

export class ModerateReviewDto {
  @IsEnum(ReviewStatus)
  status: ReviewStatus;
}
