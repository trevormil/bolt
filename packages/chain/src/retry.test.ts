import { describe, expect, test } from "bun:test";
import { withRetry } from "./client.ts";

describe("withRetry (#24 F-05)", () => {
  test("retries a flaky operation and returns the eventual success", async () => {
    let calls = 0;
    const out = await withRetry(
      async () => {
        calls++;
        if (calls < 3) throw new Error("transient");
        return "ok";
      },
      { tries: 5, baseMs: 1 },
    );
    expect(out).toBe("ok");
    expect(calls).toBe(3);
  });

  test("gives up after `tries` attempts and rethrows the last error", async () => {
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls++;
          throw new Error(`fail-${calls}`);
        },
        { tries: 3, baseMs: 1 },
      ),
    ).rejects.toThrow("fail-3");
    expect(calls).toBe(3);
  });

  test("returns immediately on first success (no retries)", async () => {
    let calls = 0;
    const out = await withRetry(async () => {
      calls++;
      return 42;
    });
    expect(out).toBe(42);
    expect(calls).toBe(1);
  });
});
