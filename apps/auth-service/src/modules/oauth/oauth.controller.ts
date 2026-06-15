import { Controller, Get, Post, Query, Body, Res, HttpCode, HttpStatus, Version, BadRequestException } from '@nestjs/common';
import { OauthService } from './oauth.service';
import { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { ResponseMessage } from '@cube/common';

@Controller('auth/oauth')
export class OauthController {
  constructor(
    private readonly oauthService: OauthService,
    private readonly config: ConfigService,
  ) {}

  @Get('google')
  @Version('1')
  async redirectToGoogle(@Res() res: Response) {
    const url = this.oauthService.getGoogleAuthUrl();
    return res.redirect(url);
  }

  @Get('google/callback')
  @Version('1')
  async googleCallback(
    @Query('code') code: string,
    @Res() res: Response,
  ) {
    if (!code) {
      throw new BadRequestException('Authorization code is missing.');
    }

    const result = await this.oauthService.handleGoogleCallback(code);

    // Set Refresh Token in cookie
    res.cookie('refreshToken', result.refreshToken, {
      httpOnly: true,
      secure: false, // Set to true in production
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    const frontendUrl = this.config.get<string>('FRONTEND_URL') || 'http://localhost:3000';
    return res.redirect(
      `${frontendUrl}/oauth-callback?accessToken=${result.accessToken}&refreshToken=${result.refreshToken}`,
    );
  }

  @Post('google/callback')
  @Version('1')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Google OAuth login successful')
  async googleCallbackPost(
    @Body('code') code: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!code) {
      throw new BadRequestException('Authorization code is missing.');
    }

    const result = await this.oauthService.handleGoogleCallback(code);

    // Set Refresh Token in cookie
    res.cookie('refreshToken', result.refreshToken, {
      httpOnly: true,
      secure: false, // Set to true in production
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return result;
  }
}
