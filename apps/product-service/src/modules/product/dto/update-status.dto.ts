import { IsEnum, IsString } from 'class-validator';

export class UpdateStatusDto {
  @IsString()
  @IsEnum(['DRAFT', 'ACTIVE', 'DISCONTINUED'])
  status: string;
}
