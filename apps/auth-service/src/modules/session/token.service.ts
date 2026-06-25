import { Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { createHash, randomBytes } from "crypto";
import { addDays } from "date-fns";

export interface AccessTokenPayload {
  sub: string;
  email: string;
  status: string;
  role: string;
  jti: string; // For blacklisting
}

export interface RefreshTokenPayload {
  sub: string;
  family: string;
  role: string;
  jti: string;
}

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  issueAccessToken(payload: Omit<AccessTokenPayload, "jti">): string {
    return this.jwt.sign(
      { ...payload, jti: randomBytes(16).toString("hex") },
      {
        secret: this.config.get<string>("JWT_ACCESS_SECRET"),
        expiresIn: "15m",
      },
    );
  }

  issueRefreshToken(
    userId: string,
    family: string,
    role: string,
  ): {
    token: string;
    hash: string;
    expiresAt: Date;
  } {
    const jti = randomBytes(32).toString("hex");
    const token = this.jwt.sign(
      { sub: userId, family, role, jti },
      {
        secret: this.config.get<string>("JWT_REFRESH_SECRET"),
        expiresIn: "7d",
      },
    );
    return {
      token,
      hash: createHash("sha256").update(token).digest("hex"),
      expiresAt: addDays(new Date(), 7),
    };
  }

  issueTempMfaToken(userId: string): string {
    return this.jwt.sign(
      { sub: userId, type: "mfa_challenge" },
      {
        secret: this.config.get<string>("JWT_ACCESS_SECRET"),
        expiresIn: "2m",
      },
    );
  }

  issueTempChallengeToken(
    userId: string,
    type: "profile_completion" | "login_otp",
  ): string {
    return this.jwt.sign(
      { sub: userId, type },
      {
        secret: this.config.get<string>("JWT_ACCESS_SECRET"),
        expiresIn: "10m",
      },
    );
  }

  verifyTempChallengeToken(token: string): { sub: string; type: string } {
    return this.jwt.verify(token, {
      secret: this.config.get<string>("JWT_ACCESS_SECRET"),
    });
  }

  verifyAccessToken(token: string): AccessTokenPayload {
    return this.jwt.verify(token, {
      secret: this.config.get<string>("JWT_ACCESS_SECRET"),
    });
  }

  verifyRefreshToken(token: string): RefreshTokenPayload {
    return this.jwt.verify(token, {
      secret: this.config.get<string>("JWT_REFRESH_SECRET"),
    });
  }
}
