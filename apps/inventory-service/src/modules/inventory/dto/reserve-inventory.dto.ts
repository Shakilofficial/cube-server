import { IsString, IsNotEmpty, IsInt, Min } from "class-validator";

export class ReserveInventoryDto {
  @IsString()
  @IsNotEmpty()
  productId: string;

  @IsInt()
  @Min(1)
  quantity: number;

  @IsString()
  @IsNotEmpty()
  referenceId: string;

  @IsString()
  @IsNotEmpty()
  referenceType: string;
}
