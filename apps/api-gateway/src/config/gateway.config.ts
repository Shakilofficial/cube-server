import { z } from "zod";
import { createConfigFactory } from "@cube/config";

export const GatewayConfigSchema = z.object({
  PORT: z.coerce.number().default(3000),
  ALLOWED_ORIGINS: z.string().default("*"),
  AUTH_SERVICE_URL: z.string().url().default("http://localhost:3001"),
  USER_SERVICE_URL: z.string().url().default("http://localhost:3002"),
  NOTIFICATION_SERVICE_URL: z.string().url().default("http://localhost:3003"),
  PRODUCT_SERVICE_URL: z.string().url().default("http://localhost:3004"),
  SEARCH_SERVICE_URL: z.string().url().default("http://localhost:3005"),
  INVENTORY_SERVICE_URL: z.string().url().default("http://localhost:3006"),
  OFFER_SERVICE_URL: z.string().url().default("http://localhost:3007"),
  JWT_ACCESS_SECRET: z
    .string()
    .min(32)
    .default("supersecretjwtaccesssecretkey123456"),
  REDIS_URL: z.string().default("redis://localhost:6379"),
});

export type GatewayConfig = z.infer<typeof GatewayConfigSchema>;
export const getGatewayConfig = createConfigFactory(GatewayConfigSchema);
