import { IsInt, Min } from "class-validator";

export class FlashSaleActionDto {
  @IsInt()
  @Min(1)
  quantity: number;
}
