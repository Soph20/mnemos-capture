import { defineConfig } from "@playwright/test";

/**
 * Playwright runs the live-network integration tests for the capture
 * URL-fetch feature (`tests/e2e`). These exercise `fetchSourceContent`
 * against real URLs end-to-end — they do NOT use the `page`/`browser`
 * fixtures, so no `npx playwright install` (browser binaries) is needed.
 *
 * Unit tests for the pure helpers live next to the source and run under
 * vitest (`npm test`). vitest only globs `*.test.ts`, so it ignores these
 * `*.spec.ts` files; the two runners do not overlap.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.spec.ts",
  timeout: 30_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"]],
});
