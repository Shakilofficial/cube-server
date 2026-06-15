import { IsString, Length } from 'class-validator';

export class VerifyLoginOtpDto {
  @IsString()
  @Length(1, 1000, { message: 'Temporary token is required.' })
  tempToken!: string;

  @IsString()
  @Length(6, 6, { message: 'OTP must be exactly 6 digits.' })
  code!: string;
}
