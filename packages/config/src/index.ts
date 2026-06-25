import { z } from "zod";

export function createConfigFactory<T extends z.ZodSchema>(schema: T) {
  return (): z.infer<T> => {
    const result = schema.safeParse(process.env);
    if (!result.success) {
      console.error("❌ Invalid environment variables:", result.error.format());
      process.exit(1);
    }
    return result.data;
  };
}
