import {
  Injectable,
  ConflictException,
  BadRequestException,
  InternalServerErrorException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class UserAuthHelper {
  constructor(private readonly config: ConfigService) {}

  private getBaseUrl(): string {
    return (
      this.config.get<string>("AUTH_SERVICE_URL") || "http://localhost:3001"
    );
  }

  /**
   * Retrieves user details from auth-service.
   * Returns null if user is not found or retrieval fails.
   */
  async getUser(id: string, authHeader?: string): Promise<any> {
    try {
      const authServiceUrl = this.getBaseUrl();
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (authHeader) {
        headers.Authorization = authHeader;
      }
      const response = await fetch(`${authServiceUrl}/v1/auth/users/${id}`, {
        headers,
      });

      if (!response.ok) {
        return null;
      }

      const resJson = (await response.json()) as any;
      return resJson.data || resJson;
    } catch {
      return null;
    }
  }

  /**
   * Retrieves all users from auth-service.
   */
  async getUsers(authHeader?: string, limit = 2000): Promise<any[]> {
    const authServiceUrl = this.getBaseUrl();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (authHeader) {
      headers.Authorization = authHeader;
    }
    const response = await fetch(
      `${authServiceUrl}/v1/auth/users?limit=${limit}`,
      {
        headers,
      },
    );

    if (!response.ok) {
      throw new InternalServerErrorException(
        "Failed to fetch users from auth-service",
      );
    }

    const resJson = (await response.json()) as any;
    return resJson.data || [];
  }

  /**
   * Creates a user inside auth-service.
   */
  async createUser(dto: any, authHeader?: string): Promise<any> {
    const authServiceUrl = this.getBaseUrl();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (authHeader) {
      headers.Authorization = authHeader;
    }
    const response = await fetch(`${authServiceUrl}/v1/auth/users`, {
      method: "POST",
      headers,
      body: JSON.stringify(dto),
    });

    if (!response.ok) {
      const errData = (await response.json().catch(() => ({}))) as any;
      if (response.status === 409) {
        throw new ConflictException(
          errData.message || "User already exists in authentication database.",
        );
      }
      if (response.status === 400) {
        throw new BadRequestException(errData.message || "Invalid input.");
      }
      throw new InternalServerErrorException(
        errData.message || "Failed to create user credentials.",
      );
    }

    const createdAuthUser = (await response.json()) as any;
    return createdAuthUser.data || createdAuthUser;
  }
}
