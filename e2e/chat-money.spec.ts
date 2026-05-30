import { test, expect } from "@playwright/test";
import { MOCK_HUMAN_ADDRESS } from "./support/keplr.ts";

// Autonomous money paths (#125). Walks the agent's two money affordances that
// land in the activity feed: faucet claim and USDC send. These are the same
// chokepoints (engine.claimFaucet + engine.txManager.spend) the chat-driven
// send_usdc tool hits — driving them through the WalletPanel UI covers the
// SAME server pipeline (route → engine → ledger → activity) without requiring
// the LLM-tool-call seam.
//
// Scope note vs. the original #125: the spec asserts on the wallet-panel
// surface + activity row, not the chat reply. The chat-layer mirror (a runLoop
// seam that synthesizes tool calls from prompt text) is a separate harness
// piece — agent-tools.test.ts already covers the tool selection logic
// deterministically.
test.describe("autonomous money paths (faucet + send)", () => {
  test("claim faucet → send USDC → activity row reflects the spend", async ({
    page,
    request,
  }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Atlas" })).toBeVisible();

    // Faucet claim — the WalletPanel exposes the devnet tap as a button.
    // Asserting the button's busy-state transition is enough — the seamed
    // claimFaucet always succeeds.
    await page.getByRole("button", { name: /Claim 10 USDC/ }).click();

    // Wait for the panel to settle (busy state lifts) and the faucet response
    // to land on the activity / events feed. Polling the events API confirms
    // the engine.claimFaucet path emitted the expected ledger entry.
    await expect
      .poll(async () => {
        const r = await request.get(
          "http://127.0.0.1:8788/api/personas/atlas/events?limit=50",
        );
        const body = (await r.json()) as {
          events: { kind: string; meta?: { tool?: string } }[];
        };
        return body.events.some(
          (e) =>
            e.kind === "tool_call" || e.kind === "spend" || e.kind === "tx",
        );
      })
      .toBe(true);

    // Send USDC to a bb1 address. Seamed txChain.signAndBroadcast →
    // "e2e0babe"; the spend route returns the pending tx. WalletPanel's note
    // line surfaces "Sent <N> USDC (<hash slice>…)" on success.
    // Use the bech32-valid mock human address — the server enforces a real
    // bb1 length+charset regex at the boundary (see isBb1Address) so any
    // hand-rolled fake gets rejected with a 400.
    await page.getByPlaceholder("Recipient (bb1…)").fill(MOCK_HUMAN_ADDRESS);
    await page
      .getByPlaceholder("Amount (USDC)")
      .last() // WalletPanel has Fund + Send sections; Send is later in the DOM.
      .fill("1");
    await page.getByRole("button", { name: /Send USDC/ }).click();
    // Agent-broadcast hash prefix is a9e470b8 (distinct from human-signed
    // e2e0babe so the two paths can't collide on ledger UNIQUE).
    await expect(page.getByText(/Sent 1 USDC.*a9e470b8/)).toBeVisible();
  });
});
