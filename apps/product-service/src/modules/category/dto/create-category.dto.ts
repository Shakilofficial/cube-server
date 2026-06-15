import {
  IsString,
  IsOptional,
  MinLength,
  MaxLength,
  IsUUID,
} from 'class-validator';

export class CreateCategoryDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsUUID()
  parentId?: string;
}
