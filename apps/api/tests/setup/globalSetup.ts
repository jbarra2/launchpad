import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { testDatabaseUrl } from "./test-env.js";

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// Brings the test database up to date once, before any test file runs.
export default function globalSetup(): void {
  try {
    execSync("npx prisma migrate deploy", {
      cwd: apiRoot,
      stdio: "inherit",
      env: { ...process.env, DATABASE_URL: testDatabaseUrl },
    });
  } catch {
    throw new Error(
      "The test database is not ready. Start Docker Desktop, run `npm run db:test:up`, and try again.",
    );
  }
}
