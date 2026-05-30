import { test, expect } from "@playwright/test";
import { mockKeplr, MOCK_HUMAN_ADDRESS } from "./support/keplr.ts";

// Multisig vote sign-off page (#120). The /vote/:collectionId page is the
// unauthenticated entry point a signer opens via the share link. Walks:
// create a 1-of-1 multisig vault (the mocked Keplr address is the sole
// signer) → grab the share-sign-off-link href → navigate there → connect
// the signer wallet → cast the vote → assert the "Signed" confirmation
// surfaces. Folds in #106 §3 (signoff route) — the GET it runs and the
// POST cast both transit this spec end-to-end.
test.describe("multisig vote sign-off (/vote/:collectionId)", () => {
  test("create multisig vault → navigate to /vote → connect signer → cast vote → Signed", async ({
    page,
  }) => {
    await mockKeplr(page);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Atlas" })).toBeVisible();

    await page.getByRole("button", { name: /Connect Keplr/ }).click();
    await expect(page.getByTitle("Disconnect Keplr")).toBeVisible();

    // Create a 1-of-1 multisig vault — minimum that exercises the gating +
    // sign-off path. The sole signer is the mocked Keplr address.
    await page.getByRole("button", { name: "vaults", exact: true }).click();
    await page.getByRole("button", { name: /New vault/ }).click();
    await page.getByPlaceholder("Groceries").fill("Vote e2e");
    await page.getByPlaceholder("vUSDC").fill("vVOTE");
    await page.getByRole("button", { name: /Add withdrawal rules/ }).click();
    await page
      .getByPlaceholder("bb1…", { exact: true })
      .fill(MOCK_HUMAN_ADDRESS);
    // Threshold placeholder updates based on signer count — once one signer is
    // entered the text becomes "Approvals required (1–1)".
    await page.getByPlaceholder(/Approvals required/).fill("1");
    await page.getByRole("button", { name: "Create vault" }).click();
    await expect(page.getByText("vVOTE")).toBeVisible();

    const vaultRow = page.getByTestId("vault-row-vVOTE");
    // The "share sign-off link" anchor only renders for multisig vaults — the
    // simplest way to grab the collectionId without parsing list text.
    const signoffLink = vaultRow.getByRole("link", {
      name: /share sign-off link/,
    });
    const href = await signoffLink.getAttribute("href");
    expect(href).toMatch(/^\/vote\/\d+$/);

    // Navigate to the public sign-off page. mockKeplr's addInitScript persists
    // across navigations, so window.keplr is still wired.
    await page.goto(href!);
    await expect(
      page.getByRole("button", { name: /Connect Keplr/ }),
    ).toBeVisible();
    await page.getByRole("button", { name: /Connect Keplr/ }).click();

    // Once connected and recognized as a signer, the "Approve unlock" button
    // appears in place of the connect / not-on-list affordance.
    const approveBtn = page.getByRole("button", { name: "Approve unlock" });
    await expect(approveBtn).toBeVisible();
    await approveBtn.click();

    // signAndBroadcast → /lcd stub returns txhash e2e0babeX → setDone(true)
    // → "Signed" confirmation card renders.
    await expect(page.getByText("Signed", { exact: true })).toBeVisible();
    await expect(page.getByText(/Your vote was cast for vVOTE/)).toBeVisible();
  });
});
