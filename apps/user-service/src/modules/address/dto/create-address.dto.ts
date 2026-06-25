import {
  IsString,
  IsOptional,
  IsEnum,
  IsBoolean,
  MaxLength,
} from "class-validator";
import { AddressType } from "@cube/common";

export class CreateAddressDto {
  @IsEnum(AddressType)
  @IsOptional()
  type?: AddressType = AddressType.BOTH;

  @IsBoolean()
  @IsOptional()
  isDefault?: boolean = false;

  @IsString()
  @MaxLength(50)
  firstName!: string;

  @IsString()
  @MaxLength(50)
  lastName!: string;

  @IsString()
  @MaxLength(255)
  line1!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  line2?: string;

  @IsString()
  @MaxLength(100)
  city!: string;

  @IsString()
  @MaxLength(100)
  state!: string;

  @IsString()
  @MaxLength(20)
  postalCode!: string;

  @IsString()
  @MaxLength(2)
  country!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;
}
