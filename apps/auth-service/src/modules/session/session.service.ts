import { PrismaService } from "../../core/prisma/prisma.service";
import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { createHash } from "crypto";
import { BlacklistService } from "./blacklist.service";
import { TokenService, RefreshTokenPayload } from "./token.service";

@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenService: TokenService,
    private readonly blacklist: BlacklistService,
  ) {}

  async refresh(refreshTokenRaw: string) {
    let payload: RefreshTokenPayload;
    try {
      payload = this.tokenService.verifyRefreshToken(refreshTokenRaw);
    } catch {
      throw new UnauthorizedException("Invalid or expired refresh token.");
    }

    const tokenHash = createHash("sha256")
      .update(refreshTokenRaw)
      .digest("hex");

    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!stored) {
      // Token not found — detect reuse attack: revoke entire family
      await this.prisma.refreshToken.updateMany({
        where: { family: payload.family },
        data: { revokedAt: new Date() },
      });
      throw new ForbiddenException(
        "Refresh token reuse detected. All sessions revoked.",
      );
    }

    if (stored.revokedAt) {
      throw new UnauthorizedException("Refresh token has been revoked.");
    }

    if (stored.expiresAt < new Date()) {
      throw new UnauthorizedException("Refresh token has expired.");
    }

    // Revoke used token and issue new one (rotation)
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    const {
      token: newRefreshToken,
      hash: newHash,
      expiresAt,
    } = this.tokenService.issueRefreshToken(
      stored.userId,
      stored.family,
      stored.user.role,
    );

    await this.prisma.refreshToken.create({
      data: {
        userId: stored.userId,
        tokenHash: newHash,
        family: stored.family,
        expiresAt,
      },
    });

    const user = stored.user;
    return {
      accessToken: this.tokenService.issueAccessToken({
        sub: user.id,
        email: user.email || "",
        status: user.status,
        role: user.role,
      }),
      refreshToken: newRefreshToken,
      tokenType: "JWT",
      expiresIn: 900,
    };
  }

  async logout(refreshTokenRaw: string, accessToken?: string) {
    const tokenHash = createHash("sha256")
      .update(refreshTokenRaw)
      .digest("hex");

    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
    });

    if (stored) {
      // Revoke entire family on logout
      await this.prisma.refreshToken.updateMany({
        where: { family: stored.family },
        data: { revokedAt: new Date() },
      });
    }

    // Blacklist the access token if provided
    if (accessToken) {
      try {
        const payload = this.tokenService.verifyAccessToken(accessToken);
        const remainingTtl = Math.floor(
          (payload as any).exp - Date.now() / 1000,
        );
        if (remainingTtl > 0) {
          await this.blacklist.blacklist(payload.jti, remainingTtl);
        }
      } catch {
        // Token already expired, no need to blacklist
      }
    }

    return { message: "Logged out successfully." };
  }
}
