import { IsEnum, IsNumber, IsOptional, IsUUID, Min } from "class-validator";
import { Type } from "class-transformer";
import { ReviewStatus } from "../../../../prisma/generated/prisma/enums";

export class QueryReviewDto {
  @IsOptional()
  @IsUUID()
  productId?: string;

  @IsOptional()
  @IsEnum(ReviewStatus)
  status?: ReviewStatus;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number = 20;
}
