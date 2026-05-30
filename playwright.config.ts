import { defineConfig, devices } from "@playwright/test";

// e2e config (#77). Runs the real SPA against the offline seamed test server
// (packages/web/src/test-server.ts) so the suite is deterministic + needs no
// LLM/chain/network. The webServer command builds the SPA then boots the test
// server; Playwright waits for it before running specs.
//
// Onboarding (#124) runs against a separate **no-wallet** test-server on
// port 8789 — that variant pre-seeds nothing so /api/setup-status returns
// hasWallet:false and the SPA renders SetupFlow. It's a distinct project so
// the same testDir scopes the right base URL per spec.
const PORT = Number(process.env.E2E_PORT ?? 8788);
const NO_WALLET_PORT = Number(process.env.E2E_NO_WALLET_PORT ?? 8789);

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
    trace: "on-first-retry",
    headless: true,
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        baseURL: `http://127.0.0.1:${PORT}`,
      },
      testIgnore: ["**/onboarding.spec.ts"],
    },
    {
      name: "onboarding",
      use: {
        ...devices["Desktop Chrome"],
        baseURL: `http://127.0.0.1:${NO_WALLET_PORT}`,
      },
      testMatch: ["**/onboarding.spec.ts"],
    },
  ],
  webServer: [
    {
      command: `bun run --filter @vellum/web build && E2E_PORT=${PORT} bun packages/web/src/test-server.ts`,
      url: `http://127.0.0.1:${PORT}/api/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: `E2E_NO_WALLET_PORT=${NO_WALLET_PORT} bun packages/web/src/test-server-no-wallet.ts`,
      url: `http://127.0.0.1:${NO_WALLET_PORT}/api/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
