import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "prisma/config";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// The Prisma commands read the root .env on their own. Importing the app's settings would demand
// every secret just to generate the client. A missing file is fine, because CI sets the variable.
try {
  process.loadEnvFile(path.join(repoRoot, ".env"));
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
    throw error;
  }
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
