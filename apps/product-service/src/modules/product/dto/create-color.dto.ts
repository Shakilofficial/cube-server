import { Type } from "class-transformer";
import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Min,
  MinLength,
  MaxLength,
} from "class-validator";

export class CreateProductColorDto {
  @IsOptional()
  @IsUUID()
  id?: string;

  // Lets a variant in the same request reference a color being created
  // alongside it (before the color has a real database id).
  @IsOptional()
  @IsString()
  tempKey?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsString()
  @Matches(/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/, {
    message: "hexCode must be a valid hex color, e.g. #4A5568",
  })
  hexCode?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsArray()
  @IsUUID("4", { each: true })
  imageIds?: string[];
}
