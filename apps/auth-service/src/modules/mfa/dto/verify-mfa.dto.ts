import { IsString } from 'class-validator';

export class VerifyMfaDto {
  @IsString()
  tempToken!: string;

  @IsString()
  code!: string;
}
