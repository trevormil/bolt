import { test, expect } from "@playwright/test";
import { mockKeplr } from "./support/keplr.ts";

// Human Keplr send (#98). Exercises the FULL sign+broadcast tier: connect Keplr
// (mocked) → build a bank-send msg → sign via the mocked offline signer → POST
// the broadcast to the cosmos LCD (served same-origin by the test-server at
// /lcd/*) → confirm. The panel surfaces the receipt with the stubbed tx hash.
test.describe("wallet (human Keplr send)", () => {
  test("connect → fund the agent from my Keplr wallet → signed receipt", async ({
    page,
  }) => {
    await mockKeplr(page);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Atlas" })).toBeVisible();

    await page.getByRole("button", { name: /Connect Keplr/ }).click();
    await expect(page.getByTitle("Disconnect Keplr")).toBeVisible();

    await page.getByPlaceholder("Amount (USDC)").first().fill("2");
    await page.getByRole("button", { name: "From my wallet" }).click();

    // The stubbed broadcast returns txhash e2e0babeX → the panel renders the
    // receipt with the (sliced) hash.
    await expect(page.getByText(/Sent 2 USDC.*e2e0babe/)).toBeVisible();
  });
});
