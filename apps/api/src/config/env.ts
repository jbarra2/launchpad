import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

// The same depth from src/config and from dist/config.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

const REQUIRED = "is required (see .env.example)";

// Each setting gets a plain message here, because a message written by hand never contains the
// value that was refused. The Claude key settings come with the saved-key work.
const envSchema = z
  .object({
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
    // How many proxies in front of the API add their own address to X-Forwarded-For. Next adds
    // none, so 0 is right on a laptop. Trusting a hop that does not exist lets a client choose the
    // address that the rate limits count.
    TRUST_PROXY_HOPS: z.coerce
      .number({ error: "must be a number" })
      .int({ error: "must be a whole number" })
      .min(0, { error: "must be 0 or more" })
      .max(10, { error: "must be 10 or less" })
      .default(0),
    DATABASE_URL: z
      .string({ error: REQUIRED })
      .regex(/^postgres(ql)?:\/\//, { error: "must be a Postgres connection string" }),
    BETTER_AUTH_SECRET: z
      .string({ error: REQUIRED })
      .min(32, { error: "must be at least 32 characters" }),
    // The web app's address. Links in emails and the browser's origin check both start from it.
    BETTER_AUTH_URL: z
      .url({
        protocol: /^https?$/,
        error: "must be the web app's address, such as http://localhost:3100",
      })
      .refine(
        (value) => {
          try {
            return new URL(value).pathname === "/";
          } catch {
            // An address that does not parse is already reported above, with the setting's name.
            return true;
          }
        },
        { error: "must be the web app's address with no path after it" },
      ),
    // Only the console exists for now. A real provider comes with hosting.
    MAIL_TRANSPORT: z.enum(["console"], { error: "must be console" }).default("console"),
  })
  .superRefine((value, ctx) => {
    if (value.NODE_ENV !== "production") {
      return;
    }
    if (!value.BETTER_AUTH_URL.startsWith("https://")) {
      ctx.addIssue({
        code: "custom",
        path: ["BETTER_AUTH_URL"],
        message: "must use https in production",
      });
    }
    // A link in an email is a way into an account, so it never goes to a log in production.
    if (value.MAIL_TRANSPORT === "console") {
      ctx.addIssue({
        code: "custom",
        path: ["MAIL_TRANSPORT"],
        message: "cannot be console in production, because the links would be printed in the log",
      });
    }
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
  const lines = result.success
    ? []
    : result.error.issues.map((issue) => `- ${issue.path.join(".")}: ${issue.message}`);
  // The default of 0 is right on a laptop and wrong behind a proxy, where it puts every person
  // in one rate limit. A host has to say what it has in front of the API.
  if (present.NODE_ENV === "production" && present.TRUST_PROXY_HOPS === undefined) {
    lines.push(
      "- TRUST_PROXY_HOPS: must be set in production (0 if nothing is in front of the API, 1 behind one proxy)",
    );
  }
  if (result.success && lines.length === 0) {
    return result.data;
  }
  throw new Error(`Invalid environment settings (see .env.example):\n${lines.join("\n")}`);
}

/**
 * NODE_ENV=test swaps in the in-memory mail outbox and skips .env, so it belongs to the test
 * runner alone. A host that sets it by mistake would have its links dropped without a word.
 */
export function checkTestEnvironment(nodeEnv: string, underTestRunner: boolean): void {
  if (nodeEnv === "test" && !underTestRunner) {
    throw new Error("NODE_ENV=test is only for the test runner. Use development or production.");
  }
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
  const underTestRunner = Boolean(process.env.VITEST);
  // Tests never read .env, so a local run and a CI run see the same settings.
  if (process.env.NODE_ENV !== "test") {
    loadDotEnv(envFile);
  }
  try {
    const parsed = parseEnv(process.env);
    checkTestEnvironment(parsed.NODE_ENV, underTestRunner);
    return parsed;
  } catch (error) {
    if (underTestRunner) {
      throw error;
    }
    console.error((error as Error).message);
    process.exit(1);
  }
}

export const env = loadEnv();
