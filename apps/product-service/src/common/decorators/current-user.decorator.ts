import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import { JwtUser } from "@cube/common";

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtUser => {
    const request = ctx.switchToHttp().getRequest();
    return request["user"] as JwtUser;
  },
);
