import { IsString, Length } from 'class-validator';

export class VerifyEmailDto {
  @IsString()
  userId!: string;

  @IsString()
  @Length(5, 5, { message: 'Code must be exactly 5 digits.' })
  code!: string;
}
