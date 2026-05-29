import { test, expect } from "@playwright/test";
import { mockKeplr } from "./support/keplr.ts";

// Vault create + gating (#90 e2e backfill). Vault create is gated on a connected
// Keplr wallet (the human becomes the manager), so it needs the Keplr mock. The
// create itself is server-side (seamed → collection 777); the wallet only
// supplies the manager address. Vaults runs after the other specs alphabetically,
// so the persona has no pre-existing vault.
test.describe("vaults", () => {
  test("connect Keplr → create a vault with a daily cap → it lands with the gating badge", async ({
    page,
  }) => {
    await mockKeplr(page);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Atlas" })).toBeVisible();

    // Connect the (mocked) Keplr wallet — it becomes the vault manager.
    await page.getByRole("button", { name: /Connect Keplr/ }).click();
    await expect(page.getByTitle("Disconnect Keplr")).toBeVisible();

    await page.getByRole("button", { name: "vaults", exact: true }).click();
    await page.getByRole("button", { name: /New vault/ }).click();
    await page.getByPlaceholder("Groceries").fill("Rent e2e");
    await page.getByPlaceholder("vUSDC").fill("vRENT");
    await page.getByRole("button", { name: /Add withdrawal rules/ }).click();
    await page.getByPlaceholder("25").fill("50");

    await page.getByRole("button", { name: "Create vault" }).click();

    // The seamed chain confirms the create; the vault appears with its cap badge.
    await expect(page.getByText("vRENT")).toBeVisible();
    await expect(page.getByText(/50 USDC/)).toBeVisible();
  });
});
