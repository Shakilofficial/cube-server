import { Injectable } from "@nestjs/common";
import { InjectRedis } from "@nestjs-modules/ioredis";
import Redis from "ioredis";

@Injectable()
export class BlacklistService {
  constructor(@InjectRedis() private readonly redis: Redis) {}

  async blacklist(jti: string, expiresInSeconds: number): Promise<void> {
    await this.redis.set(`blacklist:${jti}`, "1", "EX", expiresInSeconds);
  }

  async isBlacklisted(jti: string): Promise<boolean> {
    const result = await this.redis.get(`blacklist:${jti}`);
    return result === "1";
  }
}
