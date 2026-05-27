import { beforeEach, describe, expect, test } from "bun:test";
import type { Meter } from "@vellum/llm";
import type { RunLoop } from "@vellum/orchestrator";
import { createEngine } from "./engine.ts";
import { buildApp } from "./server.ts";

const METER: Meter = {
  model: "test",
  tier: "cheap",
  promptTokens: 10,
  completionTokens: 20,
  totalTokens: 30,
  costUsd: 0.0002,
  ms: 5,
};

// Echoes the persona it was routed to + a fixed cost — no live LLM.
const fakeRunLoop: RunLoop = async ({ persona }) => ({
  text: `hi from ${persona.name}`,
  meters: [METER],
});

let app: ReturnType<typeof buildApp>;
beforeEach(() => {
  const engine = createEngine({
    dbPath: ":memory:",
    embedder: null, // BM25-only; no embedding API in tests
    runLoop: fakeRunLoop,
    getBalances: async () => [{ denom: "ubadge", amount: "500" }],
  });
  app = buildApp(engine);
});

const post = (path: string, body: unknown) =>
  app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("web API", () => {
  test("health", async () => {
    expect(await (await app.request("/api/health")).json()).toEqual({
      ok: true,
    });
  });

  test("create persona provisions a bb1 wallet", async () => {
    const res = await post("/api/personas", { name: "Atlas", role: "finance" });
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      persona: { id: string };
      address: string;
    };
    expect(body.persona.id).toBe("atlas");
    expect(body.address.startsWith("bb1")).toBe(true);
  });

  test("create persona validates name + rejects duplicates", async () => {
    expect((await post("/api/personas", {})).status).toBe(400);
    await post("/api/personas", { name: "Atlas" });
    expect((await post("/api/personas", { name: "Atlas" })).status).toBe(409);
  });

  test("list personas includes wallet address", async () => {
    await post("/api/personas", { name: "Atlas" });
    const body = (await (await app.request("/api/personas")).json()) as {
      personas: { id: string; address: string }[];
    };
    expect(body.personas).toHaveLength(1);
    expect(body.personas[0]!.address.startsWith("bb1")).toBe(true);
  });

  test("wallet route returns address + balance", async () => {
    await post("/api/personas", { name: "Atlas" });
    const body = (await (
      await app.request("/api/personas/atlas/wallet")
    ).json()) as {
      address: string;
      balance: { denom: string; amount: string }[];
    };
    expect(body.address.startsWith("bb1")).toBe(true);
    expect(body.balance[0]).toEqual({ denom: "ubadge", amount: "500" });
  });

  test("chat routes to the persona, replies, and writes a ledger entry", async () => {
    await post("/api/personas", { name: "Atlas" });
    const res = await post("/api/chat", {
      conversationId: "c1",
      personaId: "atlas",
      message: "what's my balance?",
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      reply: string;
      costUsd: number;
      tokens: number;
    };
    expect(body.reply).toBe("hi from Atlas");
    expect(body.costUsd).toBeCloseTo(0.0002, 9);
    expect(body.tokens).toBe(30);

    const led = (await (
      await app.request("/api/personas/atlas/ledger")
    ).json()) as {
      entries: { kind: string; costUsd: number }[];
      summary: { totalCostUsd: number; byKind: Record<string, number> };
    };
    expect(led.entries.some((e) => e.kind === "message")).toBe(true);
    expect(led.summary.totalCostUsd).toBeCloseTo(0.0002, 9);
  });

  test("chat validates input + unknown persona", async () => {
    expect((await post("/api/chat", { conversationId: "c1" })).status).toBe(
      400,
    );
    expect(
      (
        await post("/api/chat", {
          conversationId: "c1",
          personaId: "ghost",
          message: "hi",
        })
      ).status,
    ).toBe(404);
  });
});
