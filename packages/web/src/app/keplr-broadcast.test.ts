import { describe, expect, test } from "bun:test";
import {
  assertRegistered,
  confirmTx,
  fetchAccount,
  parseBroadcastResponse,
} from "./keplr.ts";

// Unit coverage for the five error throws in the human-signed broadcast path
// (#106 §1). Each throw is surfaced verbatim to the UI (PayPage, DepositPage,
// Vaults manager-actions, VotePage), so a refactor that changes the message
// shape silently changes the UX. The full `signAndBroadcast` flow can only
// run with a real Keplr extension (e2e Keplr-mock covers that); these tests
// drive the testable seams with synthetic LCD responses.

const LCD = "https://lcd.example";

function fakeFetch(handler: (url: string) => Response): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    return handler(url);
  }) as typeof fetch;
}

describe("keplr broadcast — error branches (#106 §1)", () => {
  test("fetchAccount: 200 with account → parsed AccountInfo", async () => {
    const f = fakeFetch(
      () =>
        new Response(
          JSON.stringify({ account: { account_number: "42", sequence: "7" } }),
        ),
    );
    const a = await fetchAccount(LCD, "bb1xyz", f);
    expect(a).toEqual({ accountNumber: 42, sequence: 7 });
  });

  test("fetchAccount: missing account_number → null (treated as unregistered)", async () => {
    const f = fakeFetch(() => new Response(JSON.stringify({})));
    expect(await fetchAccount(LCD, "bb1xyz", f)).toBeNull();
  });

  test("throw #1 — unregistered wallet: assertRegistered(null) throws the UI message", () => {
    expect(() => assertRegistered("bb1deadbeefdeadbeef", null)).toThrow(
      /unregistered on-chain/,
    );
    expect(() => assertRegistered("bb1deadbeefdeadbeef", null)).toThrow(
      /fund it/,
    );
  });

  test("assertRegistered passes through when the account is present", () => {
    expect(() =>
      assertRegistered("bb1xyz", { accountNumber: 1, sequence: 2 }),
    ).not.toThrow();
  });

  test("throw #2 — broadcast no hash: parseBroadcastResponse throws when txhash missing", () => {
    expect(() =>
      parseBroadcastResponse({
        tx_response: { code: 0, raw_log: "" },
      }),
    ).toThrow(/broadcast returned no hash/);
    // Missing tx_response entirely is also a no-hash response.
    expect(() => parseBroadcastResponse({})).toThrow(
      /broadcast returned no hash/,
    );
  });

  test("throw #3 — broadcast rejected (code N): parseBroadcastResponse throws with the code + raw_log", () => {
    expect(() =>
      parseBroadcastResponse({
        tx_response: {
          code: 7,
          txhash: "TX1",
          raw_log: "amount exceeds per-day limit",
        },
      }),
    ).toThrow(/broadcast rejected \(code 7\): amount exceeds per-day limit/);
  });

  test("parseBroadcastResponse returns the hash on a clean response (code 0 / missing)", () => {
    expect(
      parseBroadcastResponse({
        tx_response: { code: 0, txhash: "TXOK", raw_log: "" },
      }),
    ).toBe("TXOK");
    expect(
      parseBroadcastResponse({
        tx_response: { txhash: "TXNOCODE" },
      }),
    ).toBe("TXNOCODE");
  });

  test("throw #4 — tx reverted on chain: confirmTx throws when tx_response code != 0", async () => {
    const f = fakeFetch(
      () =>
        new Response(
          JSON.stringify({
            tx_response: { code: 11, raw_log: "vault gating refused" },
          }),
        ),
    );
    await expect(
      confirmTx(LCD, "ABCDEF1234", { fetchImpl: f, pollMs: 1, timeoutMs: 200 }),
    ).rejects.toThrow(/tx reverted on chain: vault gating refused/);
  });

  test("throw #5 — tx not committed within Ns: confirmTx times out when the LCD never sees it", async () => {
    // Always-404 simulates the "tx not yet indexed" state — the loop polls and
    // ultimately exceeds the timeout.
    const f = fakeFetch(
      () => new Response(JSON.stringify({}), { status: 404 }),
    );
    await expect(
      confirmTx(LCD, "ABCDEF1234", { fetchImpl: f, pollMs: 5, timeoutMs: 50 }),
    ).rejects.toThrow(/ABCDEF1234… not committed within 0\.05s/);
  });

  test("confirmTx returns cleanly on a successful tx (code 0)", async () => {
    const f = fakeFetch(
      () =>
        new Response(JSON.stringify({ tx_response: { code: 0, raw_log: "" } })),
    );
    await expect(
      confirmTx(LCD, "ABCDEF1234", { fetchImpl: f, pollMs: 1, timeoutMs: 200 }),
    ).resolves.toBeUndefined();
  });

  test("confirmTx tolerates a transient fetch throw (network blip) and converges on success", async () => {
    let calls = 0;
    const f = fakeFetch(() => {
      calls++;
      if (calls === 1) throw new Error("network down");
      return new Response(
        JSON.stringify({ tx_response: { code: 0, raw_log: "" } }),
      );
    });
    await expect(
      confirmTx(LCD, "ABCDEF1234", { fetchImpl: f, pollMs: 1, timeoutMs: 200 }),
    ).resolves.toBeUndefined();
    expect(calls).toBeGreaterThanOrEqual(2);
  });
});
