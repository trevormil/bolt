import { describe, expect, test } from "bun:test";
import { verifyTelegramToken } from "./telegram-verify.ts";

// Build a fake fetch returning a getMe-shaped response.
const fakeFetch = (status: number, body: unknown): typeof fetch =>
  (async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    })) as unknown as typeof fetch;

describe("verifyTelegramToken (#63)", () => {
  test("valid token → ok + the bot @username from getMe", async () => {
    const r = await verifyTelegramToken(
      "123:ABC",
      fakeFetch(200, { ok: true, result: { username: "my_bot" } }),
    );
    expect(r).toEqual({ ok: true, username: "my_bot" });
  });

  test("empty/whitespace token → not ok, and never hits the network", async () => {
    let called = false;
    const f = (async () => {
      called = true;
      return new Response("{}");
    }) as unknown as typeof fetch;
    expect(await verifyTelegramToken("   ", f)).toEqual({ ok: false });
    expect(called).toBe(false);
  });

  test("HTTP 401 (bad token) → not ok", async () => {
    expect(
      await verifyTelegramToken("bad", fakeFetch(401, { ok: false })),
    ).toEqual({ ok: false });
  });

  test("200 but getMe ok:false → not ok", async () => {
    expect(
      await verifyTelegramToken("x", fakeFetch(200, { ok: false })),
    ).toEqual({ ok: false });
  });

  test("network throw / timeout → not ok (can't confirm, don't accept)", async () => {
    const f = (async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    expect(await verifyTelegramToken("x", f)).toEqual({ ok: false });
  });
});
