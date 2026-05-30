import { afterEach, describe, expect, test } from "bun:test";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("confirmTx timeout bounding", () => {
  test("rejects within the budget even if the LCD connection stalls", async () => {
    // A fetch that never responds but honors the abort signal — i.e. a hung
    // connection. confirmTx must still reject within ~timeoutMs (finding 3).
    globalThis.fetch = ((_url: string, opts?: { signal?: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        opts?.signal?.addEventListener("abort", () =>
          reject(new DOMException("aborted", "AbortError")),
        );
      })) as typeof fetch;

    const { confirmTx } = await import("./client.ts");
    const start = Date.now();
    // 64-char hex — confirmTx's hash validator (added #101) rejects non-hex
    // strings BEFORE the LCD call, so this timeout-bounding test must use a
    // structurally-valid hash to actually reach the fetch path.
    const HASH = "deadbeef".repeat(8);
    await expect(confirmTx(HASH, 300)).rejects.toThrow(/not committed/);
    // Should be bounded, not hang indefinitely.
    expect(Date.now() - start).toBeLessThan(4000);
  });
});
