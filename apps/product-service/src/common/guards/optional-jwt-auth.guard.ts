import { CanActivate, ExecutionContext, Injectable, Inject } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Request } from "express";

@Injectable()
export class OptionalJwtAuthGuard implements CanActivate {
  constructor(@Inject(JwtService) private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractTokenFromHeader(request);
    if (token) {
      try {
        const secret = process.env.JWT_ACCESS_SECRET?.replace(/^"|"$/g, "");
        const payload = await this.jwtService.verifyAsync(token, { secret });
        (request as any)["user"] = payload;
      } catch (err) {
        // Do not throw for optional auth, just continue as unauthenticated
      }
    }
    return true;
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    return request.headers.authorization;
  }
}
