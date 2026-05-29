import { test, expect } from "@playwright/test";

// Unified observability (#95) — the Activity tab is now ONE feed merging the
// operational event store with the proof-of-action ledger; the separate Ledger
// tab is gone. Verifies the merge, the source filter, and the dedup, end-to-end.
test.describe("activity (unified observability)", () => {
  test("merges events + ledger into one feed, with filters; the Ledger tab is gone", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Atlas" })).toBeVisible();

    // The Ledger tab was merged away — no such tab on the default (chat) view.
    await expect(
      page.getByRole("button", { name: "ledger", exact: true }),
    ).toHaveCount(0);

    await page.getByRole("button", { name: "activity", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible();

    // Headline budget + filter bar render.
    await expect(page.getByText("LLM budget · 24h")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "all sources" }),
    ).toBeVisible();

    // Seeded rows: an ops event AND the on-chain settlement (with its tx chip).
    await expect(page.getByText("reply sent")).toBeVisible();
    await expect(page.getByText("sent 5 USDC")).toBeVisible();
    await expect(page.getByText("E2ESPEND")).toBeVisible(); // tx hash chip (sliced)

    // The per-turn ledger "message" cost entry was deduped into the chat_out
    // event — it must NOT appear as its own row.
    await expect(page.getByText("chat · hello")).toHaveCount(0);

    // The source filter narrows to settlement rows only.
    await page.getByRole("button", { name: "ledger", exact: true }).click();
    await expect(page.getByText("sent 5 USDC")).toBeVisible();
    await expect(page.getByText("reply sent")).toHaveCount(0);
  });
});
