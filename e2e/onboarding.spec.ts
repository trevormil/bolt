import { test, expect } from "@playwright/test";

// First-run onboarding wizard (#124). Runs against the no-wallet test-server
// variant (port 8789) where /api/setup-status returns hasWallet:false, so the
// SPA renders SetupFlow on load. Walks the wizard end-to-end:
//
//   Step 1 (secrets) → fill OpenRouter key → leave Telegram blank → Continue
//   Step 2 (persona) → fill name → Enter Bolt
//   → app reloads into the dashboard with the new persona visible.
//
// Asserts on the visible affordances at each step + on /api/setup-status
// returning hasWallet:true after the wallet generation. verifyKey is seamed
// to always-pass so the test runs offline; the wallet is actually generated
// server-side (real @vellum/chain.generateWallet) and persists into the
// in-memory secret backend for the rest of the spec run.
test.describe("onboarding wizard (first-run SetupFlow)", () => {
  test("walk OpenRouter key → persona name → enter dashboard", async ({
    page,
    request,
  }) => {
    // Confirm the no-wallet server really is no-wallet.
    const pre = await request.get("http://127.0.0.1:8789/api/setup-status");
    const preBody = (await pre.json()) as {
      hasLlmKey: boolean;
      hasWallet: boolean;
      personaCount: number;
    };
    expect(preBody.hasWallet).toBe(false);
    expect(preBody.hasLlmKey).toBe(false);
    expect(preBody.personaCount).toBe(0);

    // Step 1: secrets.
    await page.goto("/");
    await expect(page.getByText(/Set up Bolt/)).toBeVisible();
    await expect(page.getByText(/step 1 · key \+ wallet/)).toBeVisible();

    // Fill the OpenRouter key — leave Telegram blank (optional).
    await page.getByPlaceholder("sk-or-…").fill("sk-or-e2e-onboard-test");
    await page.getByRole("button", { name: /Continue/ }).click();

    // Step 2: persona. The header transitions.
    await expect(page.getByText(/step 2 · your first persona/)).toBeVisible();
    await page.getByPlaceholder("Atlas").fill("Aurora");
    await page.getByRole("button", { name: /Enter Bolt/ }).click();

    // After PersonaForm calls onCreated, App's needsSetup flow flips and the
    // SPA renders the dashboard. The new persona's heading is visible.
    await expect(page.getByRole("heading", { name: "Aurora" })).toBeVisible();

    // /api/setup-status now reflects the wired-up state.
    const post = await request.get("http://127.0.0.1:8789/api/setup-status");
    const postBody = (await post.json()) as {
      hasLlmKey: boolean;
      hasWallet: boolean;
      personaCount: number;
    };
    expect(postBody.hasWallet).toBe(true);
    expect(postBody.hasLlmKey).toBe(true);
    expect(postBody.personaCount).toBeGreaterThanOrEqual(1);
  });
});
