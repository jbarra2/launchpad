import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

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
    env: { NODE_ENV: "test" },
    fileParallelism: false,
    include: ["tests/**/*.test.ts"],
  },
});
