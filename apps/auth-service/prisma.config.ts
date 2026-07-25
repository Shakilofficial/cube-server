import { defineConfig } from "prisma/config";
import * as dotenv from "dotenv";
import * as path from "path";
import 'dotenv/config';

dotenv.config({ path: path.join(__dirname, ".env") });

export default defineConfig({
  schema: "./prisma/schema.prisma",
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
