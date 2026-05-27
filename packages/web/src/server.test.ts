import { beforeEach, describe, expect, test } from "bun:test";
import type { Meter } from "@vellum/llm";
import type { RunLoop } from "@vellum/orchestrator";
import type { TxChain } from "@vellum/tx";
import { env } from "@vellum/shared";
import { createEngine } from "./engine.ts";
import { buildApp, webServeOptions } from "./server.ts";

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

// Fully offline tx chain: funded in USDC, deterministic hash, confirms.
const fakeTxChain: TxChain = {
  getBalances: async () => [{ denom: env.VELLUM_DENOM, amount: "10000000" }],
  signAndBroadcast: async () => "SPENDHASH",
  confirmTx: async () => ({ height: 5, code: 0 }),
};

const HUMAN = "bb1human0000000000000000000000000000000000";
// A fake create-vault tx whose events parse to a VaultRef.
const fakeCreateTxEvents = {
  events: [
    {
      type: "message",
      attributes: [
        { key: "collectionId", value: "777" },
        {
          key: "msg",
          value: JSON.stringify({
            collectionApprovals: [
              {
                approvalId: "vault-deposit",
                fromListId: "bb1backing",
                toListId: "!bb1backing",
              },
              { approvalId: "vault-withdraw-xyz", toListId: "bb1backing" },
            ],
          }),
        },
      ],
    },
  ],
};

let app: ReturnType<typeof buildApp>;
beforeEach(() => {
  const engine = createEngine({
    dbPath: ":memory:",
    embedder: null, // BM25-only; no embedding API in tests
    runLoop: fakeRunLoop,
    getBalances: async () => [{ denom: env.VELLUM_DENOM, amount: "500" }],
    txChain: fakeTxChain,
    claimFaucet: async () => ({
      txHash: "FAUCET1",
      amount: "10000000",
      denom: env.VELLUM_DENOM,
    }),
    vault: {
      defaultManager: HUMAN,
      createVault: async () => ({ txHash: "VAULTCREATE1" }),
      confirmTx: async () => ({ height: 9, code: 0 }),
      fetchTx: async () => fakeCreateTxEvents,
    },
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

  test("wallet route returns address + USDC balance (base units)", async () => {
    await post("/api/personas", { name: "Atlas" });
    const body = (await (
      await app.request("/api/personas/atlas/wallet")
    ).json()) as { address: string; usdc: string };
    expect(body.address.startsWith("bb1")).toBe(true);
    expect(body.usdc).toBe("500");
  });

  test("faucet route funds the persona's wallet", async () => {
    await post("/api/personas", { name: "Atlas" });
    const res = await post("/api/personas/atlas/faucet", {});
    const body = (await res.json()) as { txHash: string; amount: string };
    expect(body.txHash).toBe("FAUCET1");
    expect(body.amount).toBe("10000000");
  });

  test("spend route returns a PENDING tx; ledger fills from confirmed state", async () => {
    await post("/api/personas", { name: "Atlas" });
    const res = await post("/api/personas/atlas/spend", {
      to: "bb1dest",
      amount: "1000000",
    });
    expect(res.status).toBe(200);
    const pending = (await res.json()) as { hash: string; status: string };
    expect(pending.status).toBe("pending");
    expect(pending.hash).toBe("SPENDHASH");

    // Confirmation is async → the ledger spend entry appears shortly after.
    await new Promise((r) => setTimeout(r, 50));
    const led = (await (
      await app.request("/api/personas/atlas/ledger")
    ).json()) as {
      entries: { kind: string; txHash: string | null }[];
    };
    expect(
      led.entries.some((e) => e.kind === "spend" && e.txHash === "SPENDHASH"),
    ).toBe(true);
  });

  test("vault lifecycle: create (agent) → list → withdraw (governed)", async () => {
    await post("/api/personas", { name: "Atlas" });
    const created = await post("/api/personas/atlas/vaults", {
      name: "Groceries",
      symbol: "vUSDC",
      dailyWithdrawLimit: 5,
    });
    expect(created.status).toBe(201);
    const vault = (await created.json()) as {
      collectionId: string;
      backingAddress: string;
    };
    expect(vault.collectionId).toBe("777");
    expect(vault.backingAddress).toBe("bb1backing");

    const list = (await (
      await app.request("/api/personas/atlas/vaults")
    ).json()) as {
      vaults: { collectionId: string }[];
    };
    expect(list.vaults.map((v) => v.collectionId)).toEqual(["777"]);

    const wd = await post("/api/personas/atlas/vaults/777/withdraw", {
      amount: "1000000",
    });
    expect(wd.status).toBe(200);
    const pending = (await wd.json()) as { kind: string; status: string };
    expect(pending.kind).toBe("vault_op");
    expect(pending.status).toBe("pending");
  });

  test("vault create validates name + symbol", async () => {
    await post("/api/personas", { name: "Atlas" });
    expect(
      (await post("/api/personas/atlas/vaults", { name: "x" })).status,
    ).toBe(400);
  });

  test("spend route validates to-address + amount", async () => {
    await post("/api/personas", { name: "Atlas" });
    expect(
      (await post("/api/personas/atlas/spend", { to: "bb1d", amount: "x" }))
        .status,
    ).toBe(400);
    expect(
      (await post("/api/personas/atlas/spend", { to: "nothex", amount: "100" }))
        .status,
    ).toBe(400);
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

  test("rejects slug-unsafe explicit ids; a valid slug id works end to end", async () => {
    expect(
      (await post("/api/personas", { id: "foo bar", name: "Foo" })).status,
    ).toBe(400);
    expect(
      (await post("/api/personas", { id: "Foo_Bar", name: "Foo" })).status,
    ).toBe(400);

    expect(
      (await post("/api/personas", { id: "atlas-2", name: "Atlas Two" }))
        .status,
    ).toBe(201);
    expect((await app.request("/api/personas/atlas-2/wallet")).status).toBe(
      200,
    );
    expect((await app.request("/api/personas/atlas-2/ledger")).status).toBe(
      200,
    );
    const chat = await post("/api/chat", {
      conversationId: "c1",
      personaId: "atlas-2",
      message: "hi",
    });
    expect(chat.status).toBe(200);
  });

  test("server binds loopback by default", () => {
    expect(webServeOptions(app).hostname).toBe("127.0.0.1");
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
