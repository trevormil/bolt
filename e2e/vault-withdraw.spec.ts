import { test, expect } from "@playwright/test";
import { mockKeplr } from "./support/keplr.ts";

// Vault withdraw — the agent's in-cap path (#118). Mirror of vault-deposit, but
// drives the AGENT-signed withdraw end-to-end: the POST returns immediately
// with status "pending"; the SPA polls /api/personas/:id/tx/:txId until the
// TxManager reconciler flips it to "confirmed". The note line is the only
// surface that exposes the transition. The seam's txChain.signAndBroadcast +
// confirmTx (test-server.ts) return e2e0babe + code 0 so the loop terminates
// deterministically.
test.describe("vault withdraw (agent in-cap, pending → confirmed UI)", () => {
  test("create vault → click Withdraw → note moves from submitted to confirmed", async ({
    page,
  }) => {
    await mockKeplr(page);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Atlas" })).toBeVisible();

    await page.getByRole("button", { name: /Connect Keplr/ }).click();
    await expect(page.getByTitle("Disconnect Keplr")).toBeVisible();

    // Create a vault — symbol distinct from other specs' to keep the row
    // selectors unambiguous in a shared in-memory engine.
    await page.getByRole("button", { name: "vaults", exact: true }).click();
    await page.getByRole("button", { name: /New vault/ }).click();
    await page.getByPlaceholder("Groceries").fill("Withdraw e2e");
    await page.getByPlaceholder("vUSDC").fill("vWDRW");
    await page.getByRole("button", { name: /Add withdrawal rules/ }).click();
    await page.getByPlaceholder("25").fill("100");
    await page.getByRole("button", { name: "Create vault" }).click();

    const vaultRow = page.getByTestId("vault-row-vWDRW");
    await expect(vaultRow).toBeVisible();
    await vaultRow.getByPlaceholder("USDC", { exact: true }).fill("1");
    await vaultRow
      .getByRole("button", { name: "Withdraw", exact: true })
      .click();

    // The TxManager reconciler flips the in-memory tx to "confirmed" via the
    // seamed confirmTx; the SPA poll surfaces the final note. The agent-signed
    // path uses the a9e470b8 hash prefix (distinct from the LCD POST stub's
    // e2e0babe so vault-create and human-signed txs don't collide on the
    // ledger UNIQUE(tx_hash) index across specs in one suite).
    await expect(
      page.getByText(/Withdrawal confirmed.*a9e470b8/),
    ).toBeVisible();
  });
});
