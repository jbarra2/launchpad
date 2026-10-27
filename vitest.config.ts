import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    fileParallelism: false,
    projects: [
      "packages/shared",
      "apps/api",
      "apps/web",
      {
        test: {
          name: "scripts",
          environment: "node",
          include: ["scripts/**/*.test.ts"],
        },
      },
      // The end-to-end harness's own checks. The end-to-end tests themselves run from
      // e2e/vitest.config.ts, against the built apps.
      {
        test: {
          name: "e2e-harness",
          environment: "node",
          include: ["e2e/**/*.test.ts"],
        },
      },
    ],
  },
});
