import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

// The same depth from src/config and from dist/config.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

// Sprint 3 adds the database and sign-in variables. Each one gets a plain message here, because a
// message from the schema never contains the value that was refused.
const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"], {
      error: "must be development, test, or production",
    })
    .default("development"),
  PORT: z.coerce
    .number({ error: "must be a port number" })
    .int({ error: "must be a whole number" })
    .min(1, { error: "must be between 1 and 65535" })
    .max(65535, { error: "must be between 1 and 65535" })
    .default(4100),
  TRUST_PROXY_HOPS: z.coerce
    .number({ error: "must be a number" })
    .int({ error: "must be a whole number" })
    .min(0, { error: "must be 0 or more" })
    .max(10, { error: "must be 10 or less" })
    .default(1),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Checks a set of variables. An empty value counts as unset, because `.env.example` leaves some
 * names empty. The error lists each name and what is wrong with it, and never the value.
 */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const present = Object.fromEntries(
    Object.entries(source).filter(([, value]) => value !== undefined && value !== ""),
  );
  const result = envSchema.safeParse(present);
  if (result.success) {
    return result.data;
  }
  const lines = result.error.issues.map((issue) => `- ${issue.path.join(".")}: ${issue.message}`);
  throw new Error(`Invalid environment settings (see .env.example):\n${lines.join("\n")}`);
}

export const envFile = path.join(repoRoot, ".env");

/**
 * Puts the variables from a .env file into the process. One that is already set wins over the
 * file. A missing file is fine, because a host sets the variables itself. Anything else is not.
 */
export function loadDotEnv(file: string): void {
  try {
    process.loadEnvFile(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
}

function loadEnv(): Env {
  // Tests never read .env, so a local run and a CI run see the same settings.
  if (process.env.NODE_ENV !== "test") {
    loadDotEnv(envFile);
  }
  try {
    return parseEnv(process.env);
  } catch (error) {
    if (process.env.NODE_ENV === "test") {
      throw error;
    }
    console.error((error as Error).message);
    process.exit(1);
  }
}

export const env = loadEnv();
