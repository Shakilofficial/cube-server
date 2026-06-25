import {
  Injectable,
  BadRequestException,
  InternalServerErrorException,
} from "@nestjs/common";
import { PrismaService } from "../../core/prisma/prisma.service";
import { ConfigService } from "@nestjs/config";
import { LoginService } from "../login/login.service";

@Injectable()
export class OauthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly loginService: LoginService,
  ) {}

  getGoogleAuthUrl(): string {
    const clientId = this.config.get<string>("GOOGLE_CLIENT_ID");
    const callbackUrl = this.config.get<string>("GOOGLE_CALLBACK_URL");
    if (!clientId || !callbackUrl) {
      throw new BadRequestException("Google OAuth configurations are missing.");
    }
    return `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(
      callbackUrl,
    )}&response_type=code&scope=openid%20profile%20email&prompt=select_account`;
  }

  async handleGoogleCallback(code: string) {
    const clientId = this.config.get<string>("GOOGLE_CLIENT_ID");
    const clientSecret = this.config.get<string>("GOOGLE_CLIENT_SECRET");
    const callbackUrl = this.config.get<string>("GOOGLE_CALLBACK_URL");

    if (!clientId || !clientSecret || !callbackUrl) {
      throw new BadRequestException("Google OAuth configurations are missing.");
    }

    // 1. Exchange authorization code for access token
    let tokenData: any;
    try {
      const response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: callbackUrl,
          grant_type: "authorization_code",
        }),
      });

      if (!response.ok) {
        const err = (await response.json().catch(() => ({}))) as any;
        console.error("Google token exchange error:", err);
        throw new BadRequestException(
          err.error_description || "Failed to exchange authorization code.",
        );
      }
      tokenData = await response.json();
    } catch (err: any) {
      if (err instanceof BadRequestException) throw err;
      throw new InternalServerErrorException(
        "Error communicating with Google token service.",
      );
    }

    const accessToken = tokenData.access_token;
    if (!accessToken) {
      throw new BadRequestException("Access token not returned from Google.");
    }

    // 2. Fetch user profile from Google
    let profile: any;
    try {
      const response = await fetch(
        `https://www.googleapis.com/oauth2/v3/userinfo?access_token=${accessToken}`,
      );

      if (!response.ok) {
        throw new BadRequestException(
          "Failed to retrieve Google user profile.",
        );
      }
      profile = await response.json();
    } catch (err: any) {
      if (err instanceof BadRequestException) throw err;
      throw new InternalServerErrorException(
        "Error fetching Google user profile.",
      );
    }

    const { sub: providerId, email, name, picture } = profile;
    if (!providerId || !email) {
      throw new BadRequestException("Google did not return sub/email fields.");
    }

    // 3. Find or create user
    // First check if OauthAccount already exists
    let oauthAccount = await this.prisma.oauthAccount.findUnique({
      where: {
        provider_providerId: {
          provider: "google",
          providerId,
        },
      },
      include: { user: true },
    });

    let user = oauthAccount?.user;

    if (!user) {
      // If oauthAccount doesn't exist, check if User already exists with the same email
      user = await this.prisma.user.findUnique({
        where: { email },
      });

      if (user) {
        // Link Google account to existing user
        await this.prisma.oauthAccount.create({
          data: {
            userId: user.id,
            provider: "google",
            providerId,
          },
        });
      } else {
        // Sign up case: create new active user with CUSTOMER role and link Google account
        user = await this.prisma.user.create({
          data: {
            email,
            status: "ACTIVE",
            role: "CUSTOMER",
            oauthAccounts: {
              create: {
                provider: "google",
                providerId,
              },
            },
          },
        });
      }
    }

    if (user.status === "LOCKED") {
      throw new BadRequestException("Account locked. Please contact support.");
    }
    if (user.status === "DELETED") {
      throw new BadRequestException("Account not found.");
    }

    // Sync profile details (name, picture) with user-service
    try {
      const userServiceUrl =
        this.config.get<string>("USER_SERVICE_URL") || "http://localhost:3002";
      await fetch(`${userServiceUrl}/v1/users/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: user.id,
          email: user.email,
          name: name || user.email?.split("@")[0] || "User",
          avatarUrl: picture || null,
        }),
      });
    } catch (err) {
      console.error("Failed to sync profile with user-service:", err);
    }

    // 4. Issue and return token pair
    return this.loginService.issueTokenPair(
      user.id,
      user.email || "",
      user.status,
      user.role,
    );
  }
}
