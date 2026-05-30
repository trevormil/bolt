import { test, expect } from "@playwright/test";
import { mockKeplr } from "./support/keplr.ts";

// Public deposit-request page /deposit/:id (#122). Mirror of #121 for the
// vault-funding flow. A persona owner raises a deposit request linked to one
// of their vaults; anyone with the link signs a vaultDepositMsg from their own
// Keplr to fund the vault's escrow. There is no server-side confirm — the page
// just renders "Deposited" once the broadcast resolves (the funder's tx is
// the on-chain proof; the owner dismisses the request when satisfied).
test.describe("deposit request — public /deposit/:id page", () => {
  test("create vault → API-create a deposit request → /deposit/{id} → Fund → Deposited", async ({
    page,
    request,
  }) => {
    await mockKeplr(page);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Atlas" })).toBeVisible();

    // Need a vault to deposit INTO — create one through the UI (the same path
    // every other vault spec uses).
    await page.getByRole("button", { name: /Connect Keplr/ }).click();
    await expect(page.getByTitle("Disconnect Keplr")).toBeVisible();
    await page.getByRole("button", { name: "vaults", exact: true }).click();
    await page.getByRole("button", { name: /New vault/ }).click();
    await page.getByPlaceholder("Groceries").fill("Deposit-Req e2e");
    await page.getByPlaceholder("vUSDC").fill("vDREQ");
    await page.getByRole("button", { name: "Create vault" }).click();
    await expect(page.getByText("vDREQ")).toBeVisible();

    // Find the new vault's collectionId from its row text ("collection 7XX").
    const vaultRow = page.getByTestId("vault-row-vDREQ");
    const rowText = await vaultRow.textContent();
    const m = rowText?.match(/collection (\d+)/);
    expect(m).not.toBeNull();
    const collectionId = m![1]!;

    // API-mint a deposit request targeting that vault.
    const created = await request.post(
      "http://127.0.0.1:8788/api/personas/atlas/deposit-requests",
      { data: { collectionId, amountUsdc: 3, memo: "fund the vault" } },
    );
    expect(created.ok()).toBe(true);
    const body = (await created.json()) as { id: string };
    const reqId = body.id;
    expect(reqId).toBeTruthy();

    // Walk the public funding page.
    await page.goto(`/deposit/${reqId}`);
    await expect(page.getByText(/Bolt deposit request/)).toBeVisible();
    await page.getByRole("button", { name: /Connect Keplr/ }).click();
    const fundBtn = page.getByRole("button", { name: /^Fund 3\.00 USDC$/ });
    await expect(fundBtn).toBeVisible();
    await fundBtn.click();

    // signAndBroadcast → /lcd stub → setDone(true).
    await expect(page.getByText("Deposited", { exact: true })).toBeVisible();
    await expect(
      page.getByText(/3\.00 USDC funded into the vDREQ vault/),
    ).toBeVisible();
  });
});
