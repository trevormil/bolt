import { afterEach, describe, expect, test } from "bun:test";
import type { ChatMessage } from "./router.ts";

// Ensure a key exists before @vellum/shared parses env, so the suite runs
// offline (no real secret needed); fetch is stubbed below.
process.env.OPENROUTER_API_KEY ||= "test-offline-key";
const { complete, routeTier, verifyOpenRouterKey } = await import(
  "./router.ts"
);

// `verifyOpenRouterKey` takes an injectable fetch, so no global stub needed.
const fakeFetch = (ok: boolean, opts: { throws?: boolean } = {}) =>
  (async () => {
    if (opts.throws) throw new Error("network down");
    return new Response(ok ? "{}" : "", { status: ok ? 200 : 401 });
  }) as unknown as typeof fetch;

describe("verifyOpenRouterKey (#60)", () => {
  test("true on 200, false on 401 / empty / network error", async () => {
    expect(await verifyOpenRouterKey("sk-or-good", fakeFetch(true))).toBe(true);
    expect(await verifyOpenRouterKey("sk-or-bad", fakeFetch(false))).toBe(
      false,
    );
    expect(await verifyOpenRouterKey("   ", fakeFetch(true))).toBe(false);
    expect(
      await verifyOpenRouterKey("sk-or-x", fakeFetch(true, { throws: true })),
    ).toBe(false);
  });
});

const msg = (content: string): ChatMessage => ({ role: "user", content });
const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("routeTier", () => {
  test("defaults to cheap for short input", () => {
    expect(routeTier([msg("hi")])).toBe("cheap");
  });
  test("explicit tier overrides", () => {
    expect(routeTier([msg("hi")], { tier: "frontier" })).toBe("frontier");
  });
  test("complexity:high escalates", () => {
    expect(routeTier([msg("hi")], { complexity: "high" })).toBe("frontier");
  });
  test("long context escalates to frontier", () => {
    expect(routeTier([msg("x".repeat(7000))])).toBe("frontier");
  });
});

describe("complete", () => {
  test("calls OpenRouter and returns text + a metering record", async () => {
    let sentBody: { model?: string } = {};
    globalThis.fetch = (async (_url: string, init?: { body?: string }) => {
      sentBody = JSON.parse(init?.body ?? "{}");
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: "hello world" } }],
          usage: {
            prompt_tokens: 7,
            completion_tokens: 3,
            total_tokens: 10,
            cost: 0.00042,
          },
        }),
        { status: 200 },
      );
    }) as typeof fetch;

    const { text, meter } = await complete([msg("hi")], {
      tier: "cheap",
      model: "test/model",
    });
    expect(text).toBe("hello world");
    expect(sentBody.model).toBe("test/model");
    expect(meter).toMatchObject({
      tier: "cheap",
      model: "test/model",
      totalTokens: 10,
      costUsd: 0.00042,
    });
    expect(meter.costUsd).toBeGreaterThan(0);
    expect(meter.ms).toBeGreaterThanOrEqual(0);
  });
});
