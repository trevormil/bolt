import { test, expect } from "@playwright/test";

// Golden-path chat (#53 SPA) + the MR-5 polish: assistant replies render as
// markdown (#69) and cost/token stats are NOT shown in the direct chat.
// Each test starts a fresh session so the shared in-memory server can't bleed
// state between tests, and assertions are scoped to the chat log (not the rail).
test.describe("chat", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Atlas" })).toBeVisible();
    await page.getByTestId("new-chat").click();
  });

  test("renders a markdown reply (links parsed, not raw)", async ({ page }) => {
    const log = page.getByTestId("chat-log");
    const input = page.getByPlaceholder("Message Atlas…");
    await input.fill("hello there");
    await input.press("Enter");

    await expect(log.getByText("hello there")).toBeVisible();
    const link = log.getByRole("link", { name: "link" });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", "https://example.com");
    // The raw markdown token must NOT appear verbatim (it was parsed).
    await expect(log.getByText("[link](https://example.com)")).toHaveCount(0);
  });

  test("does not surface cost / token stats in the direct chat (#69)", async ({
    page,
  }) => {
    const log = page.getByTestId("chat-log");
    const input = page.getByPlaceholder("Message Atlas…");
    await input.fill("what's my balance?");
    await input.press("Enter");
    await expect(log.getByRole("link", { name: "link" })).toBeVisible();

    // The seamed reply costs $0.0001 / 10 tokens — neither may appear in the log.
    await expect(log.getByText("0.0001")).toHaveCount(0);
    await expect(log.getByText(/\btok\b/i)).toHaveCount(0);
  });
});
