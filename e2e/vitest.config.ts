import { defineConfig } from "vitest/config";

// The end-to-end tests run the built apps, so they are not part of `npm test`. Run `npm run build`,
// then `npm run test:e2e`. They need the test database (`npm run db:test:up`) and free ports for
// the API and for the web app (3199).
export default defineConfig({
  test: {
    name: "e2e",
    environment: "node",
    include: ["e2e/**/*.e2e.ts"],
    testTimeout: 60_000,
    hookTimeout: 240_000,
    fileParallelism: false,
  },
});
