import { z } from "zod";
import { createConfigFactory } from "@cube/config";

export const AuthConfigSchema = z.object({
  PORT: z.coerce.number().default(3001),
  DATABASE_URL: z.string().url(),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  RABBITMQ_URL: z.string().default("amqp://localhost:5672"),
  BCRYPT_ROUNDS: z.coerce.number().default(12),
  GOOGLE_CLIENT_ID: z.string().default(""),
  GOOGLE_CLIENT_SECRET: z.string().default(""),
  GOOGLE_CALLBACK_URL: z.string().default(""),
  USER_SERVICE_URL: z.string().url().default("http://localhost:3002"),
});

export type AuthConfig = z.infer<typeof AuthConfigSchema>;
export const getAuthConfig = createConfigFactory(AuthConfigSchema);
