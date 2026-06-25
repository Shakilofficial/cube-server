import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  Version,
  UnauthorizedException,
} from "@nestjs/common";
import { Request, Response } from "express";
import { SessionService } from "./session.service";
import { LogoutDto } from "./dto/logout.dto";
import { ResponseMessage } from "@cube/common";

@Controller("auth")
export class SessionController {
  constructor(private readonly sessionService: SessionService) {}

  @Post("refresh")
  @Version("1")
  @HttpCode(HttpStatus.OK)
  @ResponseMessage("Token refreshed successfully")
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const cookies =
      req.headers.cookie?.split(";").reduce(
        (acc, cookie) => {
          const [key, value] = cookie.trim().split("=");
          if (key && value) {
            acc[key] = value;
          }
          return acc;
        },
        {} as Record<string, string>,
      ) ?? {};

    const refreshToken = cookies["refreshToken"];
    if (!refreshToken) {
      throw new UnauthorizedException("Refresh token is missing from cookies.");
    }

    const result = await this.sessionService.refresh(refreshToken);

    res.cookie("refreshToken", result.refreshToken, {
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      path: "/",
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    return {
      accessToken: result.accessToken,
      tokenType: result.tokenType,
      expiresIn: result.expiresIn,
    };
  }

  @Post("logout")
  @Version("1")
  @HttpCode(HttpStatus.OK)
  @ResponseMessage("Logged out successfully")
  async logout(
    @Body() dto: LogoutDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const cookies =
      req.headers.cookie?.split(";").reduce(
        (acc, cookie) => {
          const [key, value] = cookie.trim().split("=");
          if (key && value) {
            acc[key] = value;
          }
          return acc;
        },
        {} as Record<string, string>,
      ) ?? {};

    const refreshToken = cookies["refreshToken"] || dto.refreshToken;
    const accessToken = req.headers["authorization"];

    const result = await this.sessionService.logout(refreshToken, accessToken);

    res.clearCookie("refreshToken", { path: "/" });

    return result;
  }
}
