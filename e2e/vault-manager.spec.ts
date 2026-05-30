import { test, expect } from "@playwright/test";
import { mockKeplr } from "./support/keplr.ts";

// Vault manager actions (#119). The connected Keplr address becomes the
// vault's manager (passed at create time). Two manager-only affordances
// are exercised here: "Withdraw all to me" (drain) and "Freeze agent access"
// (revoke). Both are human-signed — they go through signAndBroadcast against
// the same /lcd stubs as wallet.spec.ts, so the test-server seam doesn't need
// any new shape.
test.describe("vault manager (human-signed drain + revoke)", () => {
  test("drain — manager withdraws all escrow back to their own wallet", async ({
    page,
  }) => {
    await mockKeplr(page);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Atlas" })).toBeVisible();

    await page.getByRole("button", { name: /Connect Keplr/ }).click();
    await expect(page.getByTitle("Disconnect Keplr")).toBeVisible();

    await page.getByRole("button", { name: "vaults", exact: true }).click();
    await page.getByRole("button", { name: /New vault/ }).click();
    await page.getByPlaceholder("Groceries").fill("Drain e2e");
    await page.getByPlaceholder("vUSDC").fill("vDRAIN");
    await page.getByRole("button", { name: "Create vault" }).click();
    await expect(page.getByText("vDRAIN")).toBeVisible();

    const vaultRow = page.getByTestId("vault-row-vDRAIN");
    // Manager panel only renders when the connected Keplr address IS the
    // vault's manager (set at create from the same connected wallet).
    const drainBtn = vaultRow.getByRole("button", {
      name: "Withdraw all to me",
    });
    await expect(drainBtn).toBeVisible();
    await expect(drainBtn).toBeEnabled(); // seam's fetchTokenBalance > 0
    await drainBtn.click();

    // Wording locked by #82 — "Withdrew all to you" is the operator-friendly
    // phrasing that distinguishes drain (returns USDC) from revoke (claws
    // approval).
    await expect(
      page.getByText(/Withdrew all to you.*E2EHUMANT/),
    ).toBeVisible();
  });

  test("revoke — manager freezes agent access, escrowed USDC stays under them", async ({
    page,
  }) => {
    await mockKeplr(page);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Atlas" })).toBeVisible();

    await page.getByRole("button", { name: /Connect Keplr/ }).click();
    await expect(page.getByTitle("Disconnect Keplr")).toBeVisible();

    await page.getByRole("button", { name: "vaults", exact: true }).click();
    await page.getByRole("button", { name: /New vault/ }).click();
    await page.getByPlaceholder("Groceries").fill("Revoke e2e");
    await page.getByPlaceholder("vUSDC").fill("vREVK");
    await page.getByRole("button", { name: "Create vault" }).click();
    await expect(page.getByText("vREVK")).toBeVisible();

    const vaultRow = page.getByTestId("vault-row-vREVK");
    const revokeBtn = vaultRow.getByRole("button", {
      name: "Freeze agent access",
    });
    await expect(revokeBtn).toBeVisible();
    await expect(revokeBtn).toBeEnabled();
    await revokeBtn.click();

    await expect(page.getByText(/Froze agent access.*E2EHUMANT/)).toBeVisible();
  });
});
