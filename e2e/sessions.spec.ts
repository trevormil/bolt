import { test, expect } from "@playwright/test";

// Multiple chat sessions per persona (#72) — create / auto-title / switch /
// rename / delete. Scoped to the session rail + chat log testids; uses unique
// titles so it tolerates whatever other sessions the shared server holds.
test.describe("chat sessions", () => {
  test("create, auto-title, switch, rename, and delete sessions", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Atlas" })).toBeVisible();
    const rail = page.getByTestId("session-rail");
    const log = page.getByTestId("chat-log");
    const input = page.getByPlaceholder("Message Atlas…");

    // New session → first message auto-titles it in the rail.
    await page.getByTestId("new-chat").click();
    await input.fill("Plan my taxes e2e");
    await input.press("Enter");
    await expect(log.getByRole("link", { name: "link" }).first()).toBeVisible();
    await expect(
      rail.getByRole("button", { name: "Plan my taxes e2e", exact: true }),
    ).toBeVisible();

    // A second session starts empty (its own thread).
    await page.getByTestId("new-chat").click();
    await expect(
      log.getByText(
        "Talk to Atlas. It reasons only over its own walled memory.",
      ),
    ).toBeVisible();
    await input.fill("Book a flight e2e");
    await input.press("Enter");
    await expect(
      rail.getByRole("button", { name: "Book a flight e2e", exact: true }),
    ).toBeVisible();

    // Switch back to the first → its persisted history is restored.
    await rail
      .getByRole("button", { name: "Plan my taxes e2e", exact: true })
      .click();
    await expect(log.getByText("Plan my taxes e2e")).toBeVisible();

    // Rename via double-click → inline edit.
    await rail
      .getByRole("button", { name: "Plan my taxes e2e", exact: true })
      .dblclick();
    const editor = rail.locator("input").first();
    await editor.fill("Q2 taxes e2e");
    await editor.press("Enter");
    await expect(
      rail.getByRole("button", { name: "Q2 taxes e2e", exact: true }),
    ).toBeVisible();

    // Delete it (accept the confirm dialog); the rail entry disappears.
    page.on("dialog", (d) => d.accept());
    const item = rail.locator("div.group").filter({ hasText: "Q2 taxes e2e" });
    await item.hover();
    await item.getByTitle("Delete chat").click();
    await expect(
      rail.getByRole("button", { name: "Q2 taxes e2e", exact: true }),
    ).toHaveCount(0);
  });
});
