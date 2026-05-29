import { defineConfig, devices } from "@playwright/test";

// e2e config (#77). Runs the real SPA against the offline seamed test server
// (packages/web/src/test-server.ts) so the suite is deterministic + needs no
// LLM/chain/network. The webServer command builds the SPA then boots the test
// server; Playwright waits for it before running specs.
const PORT = Number(process.env.E2E_PORT ?? 8788);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false, // one shared server + in-memory state — keep specs serial
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "line" : "list",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "on-first-retry",
    headless: true,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `bun run --filter @vellum/web build && E2E_PORT=${PORT} bun packages/web/src/test-server.ts`,
    url: `http://127.0.0.1:${PORT}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
