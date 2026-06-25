import { IsEnum, IsInt, IsOptional, IsPositive } from "class-validator";
import { OfferStatus, OfferType } from "../enums/offer.enums";

export class QueryOfferDto {
  @IsInt()
  @IsPositive()
  @IsOptional()
  page?: number;

  @IsInt()
  @IsPositive()
  @IsOptional()
  limit?: number;

  @IsEnum(OfferStatus)
  @IsOptional()
  status?: OfferStatus;

  @IsEnum(OfferType)
  @IsOptional()
  type?: OfferType;
}
