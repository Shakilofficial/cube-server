import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsNumber,
  IsOptional,
  IsInt,
  Min,
  IsArray,
  IsDateString,
  ValidateNested,
  IsPositive,
} from "class-validator";
import { Type } from "class-transformer";
import { OfferType, ApplicabilityScope } from "../enums/offer.enums";

export class FlashSaleStockDto {
  @IsInt()
  @IsPositive()
  totalStock: number;
}

export class CouponCodeDto {
  @IsString()
  @IsNotEmpty()
  code: string;
}

export class CreateOfferDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEnum(OfferType)
  type: OfferType;

  @IsNumber()
  @Min(0)
  value: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  maxDiscount?: number;

  @IsDateString()
  startAt: string;

  @IsDateString()
  endAt: string;

  @IsInt()
  @IsPositive()
  @IsOptional()
  usageLimit?: number;

  @IsInt()
  @IsPositive()
  @IsOptional()
  perUserLimit?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  minOrderAmount?: number;

  @IsEnum(ApplicabilityScope)
  @IsOptional()
  applicability?: ApplicabilityScope;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  applicableIds?: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => FlashSaleStockDto)
  flashSaleStock?: FlashSaleStockDto;

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => CouponCodeDto)
  couponCodes?: CouponCodeDto[];
}
