import { test, expect } from "@playwright/test";
import { mockKeplr } from "./support/keplr.ts";

// Public payment-request page /pay/:id (#121). The payer (a third party) opens
// the share link, connects their Keplr, and signs a MsgSend to the persona.
// After broadcast the page confirms the payment via the server-side
// verifyCredit + ledger record. The test-server's LCD GET stub fabricates a
// coin_received event addressed to Atlas's signer so verifyCredit returns
// true — see test-server.ts for the harness wiring.
test.describe("payment request — public /pay/:id page", () => {
  test("API-create a request → /pay/{id} → connect Keplr → Pay → Paid", async ({
    page,
    request,
  }) => {
    await mockKeplr(page);

    // Mint a payment request via the API (mirrors the WalletPanel "Request"
    // button without driving the form). Goes through the engine's
    // PaymentRequests store, same as the SPA path.
    const created = await request.post(
      "http://127.0.0.1:8788/api/personas/atlas/payment-requests",
      { data: { amountUsdc: 5 } },
    );
    expect(created.ok()).toBe(true);
    // POST returns the request shape directly (not wrapped in { request }).
    const body = (await created.json()) as { id: string };
    const reqId = body.id;
    expect(reqId).toBeTruthy();

    // Open the public pay page. WalletProvider wraps the route; mockKeplr's
    // addInitScript persists, so window.keplr is present after navigation.
    await page.goto(`/pay/${reqId}`);
    await expect(page.getByText(/Bolt payment request/)).toBeVisible();

    await page.getByRole("button", { name: /Connect Keplr/ }).click();
    const payBtn = page.getByRole("button", { name: /^Pay 5\.00 USDC$/ });
    await expect(payBtn).toBeVisible();
    await payBtn.click();

    // signAndBroadcast → /lcd POST stub → txhash E2EHUMANTX →
    // confirmPaymentRequest → setDone(true) → "Paid" confirmation card.
    await expect(page.getByText("Paid", { exact: true })).toBeVisible();
    await expect(page.getByText(/5\.00 USDC sent to Atlas/)).toBeVisible();

    // The request was consumed — a subsequent GET 404s.
    const after = await request.get(
      `http://127.0.0.1:8788/api/payment-requests/${reqId}`,
    );
    expect(after.status()).toBe(404);
  });
});
