import { test, expect } from "@playwright/test";
import { mockKeplr } from "./support/keplr.ts";

// In-app vault deposit (#117). Mirror of wallet.spec.ts — human signs a tx via
// the mocked Keplr → broadcast hits the same-origin LCD stub at /lcd/cosmos/tx
// → the vault row surfaces "Escrow funded (E2EHUMANT…)". This is the
// authenticated affordance (per-vault "Fund" button); the public /deposit/:id
// page is covered separately by #122.
test.describe("vault deposit (in-app)", () => {
  test("connect Keplr → create a vault → fund the escrow with a signed MsgSend", async ({
    page,
  }) => {
    await mockKeplr(page);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Atlas" })).toBeVisible();

    await page.getByRole("button", { name: /Connect Keplr/ }).click();
    await expect(page.getByTitle("Disconnect Keplr")).toBeVisible();

    // Create a fresh vault with a daily cap (mirrors vaults.spec.ts setup,
    // distinct symbol to avoid colliding with other specs in the run).
    await page.getByRole("button", { name: "vaults", exact: true }).click();
    await page.getByRole("button", { name: /New vault/ }).click();
    await page.getByPlaceholder("Groceries").fill("Deposit e2e");
    await page.getByPlaceholder("vUSDC").fill("vDEPO");
    await page.getByRole("button", { name: /Add withdrawal rules/ }).click();
    await page.getByPlaceholder("25").fill("75");
    await page.getByRole("button", { name: "Create vault" }).click();

    // Wait for the new vault row to appear in the list.
    await expect(page.getByText("vDEPO")).toBeVisible();

    // The per-vault detail row has its own amount input (placeholder "USDC")
    // and a "Fund" button.
    const amountInput = page
      .locator(":has-text('vDEPO')")
      .getByPlaceholder("USDC", { exact: true })
      .first();
    await amountInput.fill("2");
    await page.getByRole("button", { name: "Fund", exact: true }).click();

    // signAndBroadcast → LCD stub returns txhash "E2EHUMANTX"; the row's note
    // slices to "E2EHUMANT…" (10-char prefix + ellipsis).
    await expect(page.getByText(/Escrow funded.*E2EHUMANT/)).toBeVisible();
  });
});
