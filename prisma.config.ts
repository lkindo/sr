import { config } from "dotenv";
import { defineConfig, env } from "prisma/config";

// Force override environment variables from .env file
config({ override: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  engine: "classic",
  datasource: {
    url: env("DATABASE_URL"),
  },
});
