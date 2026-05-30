import { test, expect } from "@playwright/test";

// Settings WRITE flows (#123). The existing settings.spec.ts asserts section
// headings render but doesn't drive the actual mutations. This spec walks each
// of the three first-class WRITE actions:
//   1. Rotate the OpenRouter key.
//   2. Set the Telegram bot token.
//   3. Reveal the agent's seed phrase.
//
// The test-server stubs verifyKey + verifyTelegram (always-pass) and points
// envFilePath at a tmpdir so the developer's real .env is untouched. The seed
// phrase is shown blurred behind a "Click to reveal" overlay; the spec asserts
// the overlay is dismissed but never logs the actual phrase.
test.describe("settings WRITE flows", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Atlas" })).toBeVisible();
    await page.getByRole("button", { name: "settings", exact: true }).click();
  });

  test("rotate the OpenRouter API key — Replace flips to Saved", async ({
    page,
  }) => {
    const section = page.getByTestId("settings-llm-key");
    await expect(section).toBeVisible();
    await section.getByPlaceholder("sk-or-…").fill("sk-or-e2e-rotated-key");
    await section.getByRole("button", { name: /^(Replace|Save)$/ }).click();

    // verifyKey seamed to always-true → server persists + applies. The button
    // text transitions Replace → Verifying… → Saved (visible ~1500ms).
    await expect(section.getByRole("button", { name: "Saved" })).toBeVisible();
  });

  test("set the Telegram bot token — connected status surfaces", async ({
    page,
  }) => {
    const section = page.getByTestId("settings-telegram");
    await expect(section).toBeVisible();
    // The token input is the section's first password field.
    await section
      .locator('input[type="password"]')
      .first()
      .fill("9999999999:ABCDEF-test-e2e-token");
    // The save button label depends on whether Telegram is already configured
    // ("Connect" when unset / null state, "Replace" when set). Accept either —
    // locally a dev .env often has TELEGRAM_BOT_TOKEN; CI runners don't.
    await section.getByRole("button", { name: /^(Connect|Replace)$/ }).click();

    // verifyTelegram is seamed to ok:true / username e2e_bot → "connected as
    // @e2e_bot" appears in the section's status line.
    await expect(section.getByText(/connected as @e2e_bot/)).toBeVisible();
  });

  test("reveal the seed phrase — overlay dismissed after click", async ({
    page,
  }) => {
    const section = page.getByTestId("settings-recovery");
    await expect(section).toBeVisible();
    await section.getByRole("button", { name: /Export seed phrase/ }).click();

    // Phrase grid renders behind a "Click to reveal" overlay.
    const overlay = section.getByRole("button", { name: "Click to reveal" });
    await expect(overlay).toBeVisible();
    await overlay.click();

    // Overlay dismissed → the words are now selectable. We DO NOT read the
    // phrase value — the success signal is the overlay disappearing AND the
    // Copy button (disabled until revealed) being enabled.
    await expect(overlay).toBeHidden();
    await expect(section.getByRole("button", { name: /Copy/ })).toBeEnabled();
  });
});
