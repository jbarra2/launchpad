import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { testDatabaseUrl } from "./tests/setup/test-env.js";

export default defineConfig({
  resolve: {
    // Tests read the shared package from its source, so they never run against a stale build.
    alias: {
      "@launchpad/shared": fileURLToPath(
        new URL("../../packages/shared/src/index.ts", import.meta.url),
      ),
    },
  },
  test: {
    name: "api",
    environment: "node",
    // Whatever the shell says, so that no test reads the developer's .env.
    env: {
      NODE_ENV: "test",
      DATABASE_URL: testDatabaseUrl,
      // Made up for these tests. Real secrets live in .env and in the host's settings.
      BETTER_AUTH_SECRET: "test-only-secret-for-vitest-runs-0123456789", // public-check: allow secret
      BETTER_AUTH_URL: "http://localhost:3100",
      // One proxy in front, as on a host. Next adds no hop, so a laptop uses 0, and the tests that
      // forge X-Forwarded-For need the real topology.
      TRUST_PROXY_HOPS: "1",
      MAIL_TRANSPORT: "console",
    },
    globalSetup: "./tests/setup/globalSetup.ts",
    setupFiles: ["./tests/setup/reset.ts"],
    fileParallelism: false,
    maxWorkers: 1,
    include: ["tests/**/*.test.ts"],
  },
});
