import { z } from "zod";
import { createConfigFactory } from "@cube/config";

export const UserConfigSchema = z.object({
  PORT: z.coerce.number().default(3002),
  DATABASE_URL: z.string().url(),
  JWT_ACCESS_SECRET: z.string().min(32),
  AUTH_SERVICE_URL: z.string().url().default("http://localhost:3001"),
});

export type UserConfig = z.infer<typeof UserConfigSchema>;
export const getUserConfig = createConfigFactory(UserConfigSchema);
