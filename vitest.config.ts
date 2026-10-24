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
    ],
  },
});
