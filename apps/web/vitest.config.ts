import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const webRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": webRoot,
      // Tests read the shared package from its source, so they never run against a stale build.
      "@launchpad/shared": path.join(webRoot, "../../packages/shared/src/index.ts"),
    },
  },
  test: {
    name: "web",
    environment: "jsdom",
    include: ["**/*.{test,spec}.{ts,tsx}"],
    exclude: ["node_modules/**", ".next/**"],
    setupFiles: ["./vitest.setup.ts"],
    env: {
      // Next fixes the real value into the build from next.config.ts. Tests use a made-up address.
      API_INTERNAL_URL: "http://api.test:4100",
      // A zone that is not UTC, the same on every machine, so a test of a viewer's own day can tell
      // it from the UTC one in CI too (CI runs in UTC). Evening there is already the next day in UTC.
      TZ: "America/Los_Angeles",
    },
  },
});
