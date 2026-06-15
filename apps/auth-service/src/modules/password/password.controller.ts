import { Body, Controller, HttpCode, HttpStatus, Post, Version, UseGuards, Req } from '@nestjs/common';
import { PasswordService } from './password.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { JwtAuthGuard, ResponseMessage } from '@cube/common';

@Controller('auth/password')
export class PasswordController {
  constructor(private readonly passwordService: PasswordService) {}

  @Post('forgot')
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Password reset email sent successfully')
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.passwordService.forgotPassword(dto.email);
  }

  @Post('reset')
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Password reset successfully')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.passwordService.resetPassword(dto.token, dto.newPassword);
  }

  @Post('change')
  @Version('1')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Password changed successfully')
  changePassword(@Body() dto: ChangePasswordDto, @Req() req: any) {
    const userId = req.user.sub;
    return this.passwordService.changePassword(userId, dto.currentPassword, dto.newPassword);
  }
}
