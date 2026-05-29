import { test, expect } from "@playwright/test";

// Settings surface — the OpenRouter + Telegram panels render, and the Telegram
// copy makes clear the bot token is the only required field (#74 / MR-7).
test.describe("settings", () => {
  test("shows the OpenRouter + Telegram panels with bot-token-only copy", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Atlas" })).toBeVisible();

    // Switch to the Settings tab.
    await page.getByRole("button", { name: "settings", exact: true }).click();

    await expect(
      page.getByRole("heading", { name: "OpenRouter API key" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Telegram remote control" }),
    ).toBeVisible();
    // MR-7: the copy makes the bot-token-only contract explicit.
    await expect(
      page.getByText(/bot token is the only thing you need/i),
    ).toBeVisible();
  });
});
