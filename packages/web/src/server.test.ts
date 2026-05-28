import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Meter } from "@vellum/llm";
import type { RunLoop } from "@vellum/orchestrator";
import type { TxChain } from "@vellum/tx";
import { env } from "@vellum/shared";
import { generateWallet } from "@vellum/chain";
import { createEngine } from "@vellum/engine";
import {
  buildApp,
  creditedAmount,
  webServeOptions,
  parseGating,
} from "./server.ts";
import { PaymentRequests } from "./payment-requests.ts";

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

function makeEngine(over: Parameters<typeof createEngine>[0] = {}) {
  return createEngine({
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
      // Per-vault escrow = the agent's holding of the collection's tokens.
      fetchTokenBalance: async () => "3000000",
    },
    ...over,
  });
}

let engine: ReturnType<typeof createEngine>;
let app: ReturnType<typeof buildApp>;
beforeEach(() => {
  engine = makeEngine();
  app = buildApp(engine, new PaymentRequests(":memory:"));
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

    // Escrow tracking (#45): the agent's per-collection token holding, read from chain.
    const escrow = (await (
      await app.request("/api/personas/atlas/vaults/777/escrow")
    ).json()) as { backingAddress: string; escrowedMicro: string };
    expect(escrow.backingAddress).toBe("bb1backing");
    expect(escrow.escrowedMicro).toBe("3000000"); // fake fetchTokenBalance → 3 vUSDC
  });

  test("budget route reports the LLM-spend cap (no free-form cap)", async () => {
    await post("/api/personas", { name: "Atlas" });
    const b = (await (
      await app.request("/api/personas/atlas/budget")
    ).json()) as {
      llm: { capUsd: number; ok: boolean };
      freeform?: unknown;
    };
    expect(b.llm.capUsd).toBe(1);
    expect(b.llm.ok).toBe(true);
    expect(b.freeform).toBeUndefined(); // no discretionary USDC cap — vaults only
  });

  test("chat is refused once the LLM budget is exceeded (no model call)", async () => {
    await post("/api/personas", { name: "Atlas" });
    // Seed >$1 of spend in the rolling window.
    engine.ledger.recordAgentRun("atlas", "prior", [
      {
        model: "m",
        tier: "cheap",
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 1000,
        costUsd: 1.5,
        ms: 0,
      },
    ]);
    const res = await post("/api/chat", {
      conversationId: "c1",
      personaId: "atlas",
      message: "hi",
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      budgetExceeded?: boolean;
      costUsd: number;
    };
    expect(body.budgetExceeded).toBe(true);
    expect(body.costUsd).toBe(0); // the model was NOT called
  });

  test("faucet has no free-form cap — claims even at a high balance", async () => {
    const rich = buildApp(
      makeEngine({
        getBalances: async () => [
          { denom: env.VELLUM_DENOM, amount: "25000000" }, // $25, formerly the cap
        ],
      }),
    );
    await rich.request("/api/personas", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Rich" }),
    });
    const res = await rich.request("/api/personas/rich/faucet", {
      method: "POST",
    });
    expect(res.status).toBe(200);
    expect((await res.json()) as { txHash?: string }).toHaveProperty("txHash");
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

  test("config exposes public chain settings (no secrets)", async () => {
    const body = (await (await app.request("/api/config")).json()) as {
      chainId: string;
      lcd: string;
      denom: string;
    };
    expect(body.chainId).toBeTruthy();
    expect(body.lcd.startsWith("http")).toBe(true);
    expect(body.denom).toBe(env.VELLUM_DENOM);
  });
});

describe("security headers (#24 / T-11)", () => {
  test("every response carries clickjacking + nosniff hardening headers", async () => {
    const res = await app.request("/api/health");
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(res.headers.get("Content-Security-Policy")).toContain(
      "frame-ancestors 'none'",
    );
  });

  // Regression: with nosniff set, the static SPA handler MUST set an explicit
  // Content-Type or the browser refuses to execute module scripts (blank page).
  test("static SPA responses carry an explicit Content-Type (nosniff-safe)", async () => {
    const res = await app.request("/");
    // dist/index.html exists after `bun run build`; only assert when served.
    if (res.status === 200) {
      expect(res.headers.get("content-type") ?? "").toContain("text/html");
    }
  });
});

describe("cross-site + DNS-rebind guard (review fix)", () => {
  test("rejects a cross-origin browser request to a protected route", async () => {
    const res = await app.request("/api/personas", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://evil.example",
      },
      body: JSON.stringify({ name: "X" }),
    });
    expect(res.status).toBe(403);
  });

  test("allows a same-origin request (Origin matches Host)", async () => {
    const res = await app.request("/api/personas", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        host: "localhost",
        origin: "http://localhost",
      },
      body: JSON.stringify({ name: "Atlas" }),
    });
    expect(res.status).toBe(201);
  });

  test("rejects a foreign Host header (DNS rebinding) while bound loopback", async () => {
    const res = await app.request("http://attacker.com/api/personas", {
      method: "GET",
      headers: { host: "attacker.com" },
    });
    expect(res.status).toBe(403);
  });

  test("non-browser client (no Origin) passes", async () => {
    const res = await app.request("/api/personas");
    expect(res.status).toBe(200);
  });
});

describe("approved-models allowlist (#43 review fix)", () => {
  test("rejects a model not on the allowlist; accepts one that is", async () => {
    await post("/api/personas", { name: "Atlas" });
    const bad = await app.request("/api/personas/atlas/model", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "evil/backdoor-model" }),
    });
    expect(bad.status).toBe(400);
    expect((await bad.json()) as unknown).toHaveProperty("approved");

    const ok = await app.request("/api/personas/atlas/model", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "anthropic/claude-3.5-sonnet" }),
    });
    expect(ok.status).toBe(200);
  });

  test("/api/config exposes the approved model list", async () => {
    const cfg = (await (await app.request("/api/config")).json()) as {
      models: string[];
    };
    expect(Array.isArray(cfg.models)).toBe(true);
    expect(cfg.models).toContain("anthropic/claude-3.5-sonnet");
  });
});

describe("vault gating parse (#45 slice 2)", () => {
  test("accepts valid amount + time, rejects bad shapes", () => {
    expect(parseGating(undefined)).toBeUndefined();
    expect(parseGating({})).toBeUndefined();
    expect(parseGating({ amount: { limitUsd: 25, period: "weekly" } })).toEqual(
      { amount: { limitUsd: 25, period: "weekly" } },
    );
    expect(parseGating({ time: { unlockAt: 123 } })).toEqual({
      time: { unlockAt: 123 },
    });
    // Empty time / no-content policies are NOT real gating (review fix: an empty
    // {time:{}} must not suppress the legacy daily cap → undefined, not a policy).
    expect(parseGating({ time: {} })).toBeUndefined();
    expect(parseGating({ amount: undefined, time: {} })).toBeUndefined();
    // multisig (#45 slice 3)
    expect(
      parseGating({
        multisig: { signers: [{ address: "bb1a" }], threshold: 1 },
      }),
    ).toEqual({
      multisig: {
        signers: [{ address: "bb1a", weight: undefined }],
        threshold: 1,
      },
    });
    expect(parseGating({ multisig: { signers: [], threshold: 1 } })).toBe(
      "invalid",
    ); // empty signer set
    expect(
      parseGating({
        multisig: {
          signers: [{ address: "bb1a" }, { address: "bb1b" }],
          threshold: 3, // > total weight (2) → unreachable quorum (!44)
        },
      }),
    ).toBe("invalid");
    expect(
      parseGating({
        multisig: { signers: [{ address: "0xbad" }], threshold: 1 },
      }),
    ).toBe("invalid"); // non-bb1 signer
    // invalid: bad period, non-positive limit, negative unlock
    expect(parseGating({ amount: { limitUsd: 5, period: "yearly" } })).toBe(
      "invalid",
    );
    expect(parseGating({ amount: { limitUsd: 0, period: "daily" } })).toBe(
      "invalid",
    );
    expect(parseGating({ time: { unlockAt: -1 } })).toBe("invalid");
  });

  test("POST /vaults rejects an invalid gating policy (400)", async () => {
    await post("/api/personas", { name: "Atlas" });
    const res = await post("/api/personas/atlas/vaults", {
      name: "Rent",
      symbol: "vRENT",
      gating: { amount: { limitUsd: 5, period: "yearly" } },
    });
    expect(res.status).toBe(400);
  });
});

describe("scheduled tasks routes (#47 FE / #36)", () => {
  test("create (armed + read-only) → list → cancel", async () => {
    await post("/api/personas", { name: "Atlas" });
    const created = await post("/api/personas/atlas/tasks", {
      prompt: "summarize my vaults",
      everyMinutes: 30,
      armed: false,
    });
    expect(created.status).toBe(201);
    const task = (await created.json()) as { id: string; armed: boolean };
    expect(task.armed).toBe(false);

    const armed = await post("/api/personas/atlas/tasks", {
      prompt: "pay rent",
      everyMinutes: 1440,
      armed: true,
    });
    expect(((await armed.json()) as { armed: boolean }).armed).toBe(true);

    const list = (await (
      await app.request("/api/personas/atlas/tasks")
    ).json()) as { tasks: { id: string }[] };
    expect(list.tasks).toHaveLength(2);

    const del = await app.request(`/api/personas/atlas/tasks/${task.id}`, {
      method: "DELETE",
    });
    expect(del.status).toBe(200);
    const after = (await (
      await app.request("/api/personas/atlas/tasks")
    ).json()) as { tasks: unknown[] };
    expect(after.tasks).toHaveLength(1);
  });

  test("rejects missing prompt / non-positive interval", async () => {
    await post("/api/personas", { name: "Atlas" });
    expect(
      (await post("/api/personas/atlas/tasks", { everyMinutes: 30 })).status,
    ).toBe(400);
    expect(
      (
        await post("/api/personas/atlas/tasks", {
          prompt: "x",
          everyMinutes: 0,
        })
      ).status,
    ).toBe(400);
  });
});

describe("per-persona spend budgets (#44)", () => {
  test("GET /budget returns evaluation + limits; PUT sets per-persona limits", async () => {
    await post("/api/personas", { name: "Atlas" });
    const initial = (await (
      await app.request("/api/personas/atlas/budget")
    ).json()) as { evaluation: { ok: boolean }; limits: { source: string } };
    expect(initial.evaluation.ok).toBe(true);
    expect(initial.limits.source).toBe("default"); // env-default daily cap

    const set = await app.request("/api/personas/atlas/budget-limits", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dailyUsd: 2, weeklyUsd: 10 }),
    });
    expect(set.status).toBe(200);
    expect(await set.json()).toEqual({
      value: { dailyUsd: 2, weeklyUsd: 10 },
      source: "persona",
    });
  });

  test("PUT {} resets a persona to inherit", async () => {
    await post("/api/personas", { name: "Atlas" });
    await app.request("/api/personas/atlas/budget-limits", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dailyUsd: 2 }),
    });
    const reset = await app.request("/api/personas/atlas/budget-limits", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(((await reset.json()) as { source: string }).source).toBe("default");
  });

  test("rejects malformed limits", async () => {
    await post("/api/personas", { name: "Atlas" });
    const bad = await app.request("/api/personas/atlas/budget-limits", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dailyUsd: -1 }),
    });
    expect(bad.status).toBe(400);
    const stray = await app.request("/api/personas/atlas/budget-limits", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ stray: 1 }),
    });
    expect(stray.status).toBe(400);
  });
});

describe("per-persona model select (#43)", () => {
  test("GET → default null, PUT string → persona override, PUT null → reset", async () => {
    await post("/api/personas", { name: "Atlas" });

    const def = await (await app.request("/api/personas/atlas/model")).json();
    expect(def).toEqual({ value: null, source: "default" });

    const set = await app.request("/api/personas/atlas/model", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "anthropic/claude-3.5-sonnet" }),
    });
    expect(set.status).toBe(200);
    expect(await set.json()).toEqual({
      value: "anthropic/claude-3.5-sonnet",
      source: "persona",
    });

    const cleared = await app.request("/api/personas/atlas/model", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: null }),
    });
    expect(await cleared.json()).toEqual({ value: null, source: "default" });
  });

  test("rejects an empty model string", async () => {
    await post("/api/personas", { name: "Atlas" });
    const res = await app.request("/api/personas/atlas/model", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "  " }),
    });
    expect(res.status).toBe(400);
  });

  test("unknown persona → 404", async () => {
    expect((await app.request("/api/personas/ghost/model")).status).toBe(404);
  });
});

describe("payment requests (0014)", () => {
  test("create → get → list a request for a persona", async () => {
    await post("/api/personas", { name: "Atlas" });
    const created = await post("/api/personas/atlas/payment-requests", {
      amountUsdc: 12.5,
      memo: "lunch",
    });
    expect(created.status).toBe(201);
    const req = (await created.json()) as {
      id: string;
      amount: string;
      toAddress: string;
      memo: string;
    };
    expect(req.amount).toBe("12500000"); // µUSDC
    expect(req.toAddress.startsWith("bb1")).toBe(true);
    expect(req.memo).toBe("lunch");

    // Public fetch by id (no persona context) → request + persona name.
    const got = (await (
      await app.request(`/api/payment-requests/${req.id}`)
    ).json()) as { request: { id: string }; personaName: string };
    expect(got.request.id).toBe(req.id);
    expect(got.personaName).toBe("Atlas");

    const list = (await (
      await app.request("/api/personas/atlas/payment-requests")
    ).json()) as { requests: { id: string }[] };
    expect(list.requests.map((r) => r.id)).toContain(req.id);
  });

  test("validates amount + persona; confirm requires a txHash", async () => {
    await post("/api/personas", { name: "Atlas" });
    expect(
      (await post("/api/personas/atlas/payment-requests", { amountUsdc: 0 }))
        .status,
    ).toBe(400);
    expect(
      (await post("/api/personas/ghost/payment-requests", { amountUsdc: 5 }))
        .status,
    ).toBe(404);
    expect((await app.request("/api/payment-requests/nope")).status).toBe(404);

    const req = (await (
      await post("/api/personas/atlas/payment-requests", { amountUsdc: 5 })
    ).json()) as { id: string };
    // Confirm without a txHash is rejected before any chain call.
    expect(
      (await post(`/api/payment-requests/${req.id}/confirm`, {})).status,
    ).toBe(400);
  });

  test("creditedAmount sums only matching receiver + denom", () => {
    const DENOM = "ibc/USDC";
    const events = [
      {
        type: "coin_received",
        attributes: [
          { key: "receiver", value: "bb1persona" },
          { key: "amount", value: `5000000${DENOM}` },
        ],
      },
      {
        type: "coin_received",
        attributes: [
          { key: "receiver", value: "bb1someoneelse" },
          { key: "amount", value: `9000000${DENOM}` },
        ],
      },
      {
        type: "coin_received",
        attributes: [
          { key: "receiver", value: "bb1persona" },
          { key: "amount", value: `1000000${DENOM},42ubadge` },
        ],
      },
    ];
    // Only the two credits to bb1persona in the right denom count (5 + 1 USDC).
    expect(creditedAmount(events, "bb1persona", DENOM)).toBe(6_000_000n);
    expect(creditedAmount(events, "bb1persona", "ubadge")).toBe(42n);
    expect(creditedAmount(events, "bb1nobody", DENOM)).toBe(0n);
  });

  test("dismiss deletes a pending request (no funding recorded)", async () => {
    await post("/api/personas", { name: "Atlas" });
    const req = (await (
      await post("/api/personas/atlas/payment-requests", { amountUsdc: 3 })
    ).json()) as { id: string };

    const before = (await (
      await app.request("/api/personas/atlas/payment-requests")
    ).json()) as { requests: { id: string }[] };
    expect(before.requests.map((r) => r.id)).toContain(req.id);

    const del = await app.request(`/api/payment-requests/${req.id}`, {
      method: "DELETE",
    });
    expect(del.status).toBe(200);

    const after = (await (
      await app.request("/api/personas/atlas/payment-requests")
    ).json()) as { requests: { id: string }[] };
    expect(after.requests).toHaveLength(0);
    // Dismissal is not a funding event — the ledger stays clean.
    const led = (await (
      await app.request("/api/personas/atlas/ledger")
    ).json()) as { entries: { kind: string }[] };
    expect(led.entries.some((e) => e.kind === "funding")).toBe(false);
  });
});

describe("API auth", () => {
  const withAuth = (auth: { token?: string; host?: string }) =>
    buildApp(makeEngine(), new PaymentRequests(":memory:"), auth);

  test("public routes need no token (even when one is set)", async () => {
    const a = withAuth({ token: "secret", host: "127.0.0.1" });
    expect((await a.request("/api/health")).status).toBe(200);
    expect((await a.request("/api/config")).status).toBe(200);
    // share-link pay endpoints reach their handler (404 = not auth-blocked)
    expect((await a.request("/api/payment-requests/nope")).status).toBe(404);
  });

  test("protected routes require the bearer token when set", async () => {
    const a = withAuth({ token: "secret", host: "127.0.0.1" });
    expect((await a.request("/api/personas")).status).toBe(401);
    const ok = await a.request("/api/personas", {
      headers: { authorization: "Bearer secret" },
    });
    expect(ok.status).toBe(200);
    const bad = await a.request("/api/personas", {
      headers: { authorization: "Bearer wrong" },
    });
    expect(bad.status).toBe(401);
  });

  test("no token + non-loopback bind → protected routes fail closed (401)", async () => {
    const a = withAuth({ token: undefined, host: "0.0.0.0" });
    expect((await a.request("/api/personas")).status).toBe(401);
    expect((await a.request("/api/health")).status).toBe(200); // public still open
  });

  test("no token + loopback → open for local dev", async () => {
    const a = withAuth({ token: undefined, host: "127.0.0.1" });
    expect((await a.request("/api/personas")).status).toBe(200);
  });

  test("/api/auth reports requirement + status", async () => {
    const open = withAuth({ token: undefined, host: "127.0.0.1" });
    expect(await (await open.request("/api/auth")).json()).toMatchObject({
      authRequired: false,
      authed: true,
    });
    const prot = withAuth({ token: "secret", host: "0.0.0.0" });
    expect(await (await prot.request("/api/auth")).json()).toMatchObject({
      authRequired: true,
      authed: false,
    });
  });

  test("login sets a session cookie that authorizes the browser SPA", async () => {
    const a = withAuth({ token: "secret", host: "0.0.0.0" });
    const login = await a.request("/api/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: "secret" }),
    });
    expect(login.status).toBe(200);
    const setCookie = login.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("vellum_session");
    expect(setCookie.toLowerCase()).toContain("httponly");
    // The cookie alone (no bearer header) authorizes a protected route.
    const ok = await a.request("/api/personas", {
      headers: { cookie: setCookie.split(";")[0]! },
    });
    expect(ok.status).toBe(200);
  });

  test("login rejects a wrong token", async () => {
    const a = withAuth({ token: "secret", host: "0.0.0.0" });
    const r = await a.request("/api/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: "nope" }),
    });
    expect(r.status).toBe(401);
  });
});

describe("MCP server config API (#46)", () => {
  const putMcp = (id: string, body: unknown) =>
    app.request(`/api/personas/${id}/mcp-servers`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  test("defaults to an empty list inherited from default", async () => {
    await post("/api/personas", { name: "Atlas" });
    const res = await app.request("/api/personas/atlas/mcp-servers");
    expect(res.status).toBe(200);
    expect((await res.json()) as unknown).toEqual({
      value: [],
      source: "default",
    });
  });

  test("accepts a valid server list and reads it back", async () => {
    await post("/api/personas", { name: "Atlas" });
    const ok = await putMcp("atlas", {
      servers: [{ name: "fs", command: "npx", args: ["-y", "server-fs"] }],
    });
    expect(ok.status).toBe(200);
    const got = (await ok.json()) as {
      value: { name: string }[];
      source: string;
    };
    expect(got.value.map((s) => s.name)).toEqual(["fs"]);
    expect(got.source).toBe("persona");
  });

  test("rejects duplicate server names and malformed entries", async () => {
    await post("/api/personas", { name: "Atlas" });
    const dup = await putMcp("atlas", {
      servers: [
        { name: "fs", command: "a" },
        { name: "fs", command: "b" },
      ],
    });
    expect(dup.status).toBe(400);
    const bad = await putMcp("atlas", {
      servers: [{ name: "", command: "x" }],
    });
    expect(bad.status).toBe(400);
    // Provider-unsafe server names (spaces/slashes) are rejected — they'd become
    // invalid model tool names `mcp_<name>_<tool>` (!47/!50).
    const unsafe = await putMcp("atlas", {
      servers: [{ name: "local fs", command: "x" }],
    });
    expect(unsafe.status).toBe(400);
    const slash = await putMcp("atlas", {
      servers: [{ name: "github/fs", command: "x" }],
    });
    expect(slash.status).toBe(400);
  });

  test("null clears the override (inherit)", async () => {
    await post("/api/personas", { name: "Atlas" });
    await putMcp("atlas", { servers: [{ name: "fs", command: "x" }] });
    const cleared = await putMcp("atlas", { servers: null });
    expect(cleared.status).toBe(200);
    expect((await cleared.json()) as unknown).toEqual({
      value: [],
      source: "default",
    });
  });

  test("404 for an unknown persona", async () => {
    expect((await app.request("/api/personas/ghost/mcp-servers")).status).toBe(
      404,
    );
  });
});

describe("setup status (#19)", () => {
  test("reports persona count + config booleans, no secret values", async () => {
    const res = await app.request("/api/setup-status");
    expect(res.status).toBe(200);
    const s = (await res.json()) as Record<string, unknown>;
    expect(s).toHaveProperty("hasLlmKey");
    expect(s).toHaveProperty("hasWallet");
    expect(s).toHaveProperty("personaCount");
    // Never leak secrets OR local path material (!48 review) — booleans/counts only.
    expect(s).not.toHaveProperty("dataDir");
    expect(JSON.stringify(s)).not.toContain("mnemonic");
    expect(JSON.stringify(s)).not.toContain("/");
    expect(s.personaCount).toBe(0);
    await post("/api/personas", { name: "Atlas" });
    const after = (await (await app.request("/api/setup-status")).json()) as {
      personaCount: number;
    };
    expect(after.personaCount).toBe(1);
  });

  test("setup-status is reachable without auth (drives pre-login onboarding)", async () => {
    const a = buildApp(makeEngine(), new PaymentRequests(":memory:"), {
      token: "secret",
      host: "0.0.0.0",
    });
    expect((await a.request("/api/setup-status")).status).toBe(200);
  });
});

describe("first-run web setup (/api/setup)", () => {
  // The first-run gate reads the global env.AGENT_SIGNER_MNEMONIC singleton — the
  // same field setRuntimeEnv mutates. Snapshot + clear it so these tests are
  // deterministic regardless of the ambient .env, and restore after each.
  const savedMnemonic = env.AGENT_SIGNER_MNEMONIC;
  afterEach(() => {
    env.AGENT_SIGNER_MNEMONIC = savedMnemonic;
  });

  // Build an app whose setup side-effects are captured, not real: .env writes go
  // to a throwaway temp file and the runtime mutation is recorded (not applied to
  // the global singleton), so the test never touches the repo .env or leaks state
  // into other tests.
  // Default to loopback with NO token (the first-run dev path). /api/setup is NOT
  // a public route — it goes through the auth middleware's Host/Origin guard — so
  // the tests must look like a same-origin loopback request to reach the route.
  function setupApp(
    auth: { token?: string; host?: string } = { host: "127.0.0.1" },
  ) {
    const envFilePath = join(
      tmpdir(),
      `vellum-setup-${Math.random().toString(36).slice(2)}.env`,
    );
    const applied: Partial<typeof env>[] = [];
    const app = buildApp(makeEngine(), new PaymentRequests(":memory:"), auth, {
      envFilePath,
      applyRuntime: (p) => applied.push(p),
    });
    return { app, envFilePath, applied };
  }

  const postSetup = (
    app: ReturnType<typeof buildApp>,
    body: unknown,
    headers: Record<string, string> = {},
  ) =>
    app.request("/api/setup", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    });

  test("stays behind the cross-site guard (CSRF/DNS-rebinding) — !51 HIGH", async () => {
    // A page the user visits must not be able to plant a mnemonic on a fresh
    // install. /api/setup is not public, so a cross-origin POST is rejected
    // before the route runs.
    env.AGENT_SIGNER_MNEMONIC = undefined;
    const { app, applied } = setupApp();
    const res = await postSetup(app, {}, { origin: "http://evil.example" });
    expect(res.status).toBe(403);
    expect(applied).toHaveLength(0);
  });

  test("refuses when the daemon is exposed beyond loopback", async () => {
    // Even an authenticated client on an exposed bind can't persist secrets here
    // — the route is loopback-only (defense-in-depth behind the auth middleware).
    env.AGENT_SIGNER_MNEMONIC = undefined;
    const { app, applied } = setupApp({ token: "secret", host: "0.0.0.0" });
    const res = await postSetup(app, {}, { authorization: "Bearer secret" });
    expect(res.status).toBe(403);
    expect(applied).toHaveLength(0); // never accept secrets over a network boundary
  });

  test("refuses once a wallet already exists (first-run only)", async () => {
    env.AGENT_SIGNER_MNEMONIC = "already configured";
    const { app, applied } = setupApp();
    expect((await postSetup(app, {})).status).toBe(409);
    expect(applied).toHaveLength(0); // no runtime mutation on a refused call
  });

  test("generate flow creates a 24-word wallet + persists it, never echoing the phrase", async () => {
    env.AGENT_SIGNER_MNEMONIC = undefined;
    const { app, envFilePath, applied } = setupApp();
    const res = await postSetup(app, { openRouterKey: "sk-or-test" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.ok).toBe(true);
    // The agent's phrase is NEVER returned to the browser (#57 reveals it from
    // Settings) — the response carries no mnemonic field.
    expect(JSON.stringify(body)).not.toContain("mnemonic");

    // It WAS generated + adopted at runtime (so the live daemon works without
    // restart) — a real 24-word phrase, observable only server-side.
    const adopted = applied[0]?.AGENT_SIGNER_MNEMONIC ?? "";
    expect(adopted.trim().split(/\s+/)).toHaveLength(24);
    expect(applied[0]?.OPENROUTER_API_KEY).toBe("sk-or-test");

    // Persisted to the (temp) .env for the next boot.
    const written = readFileSync(envFilePath, "utf8");
    expect(written).toContain("AGENT_SIGNER_MNEMONIC=");
    expect(written).toContain("OPENROUTER_API_KEY=sk-or-test");
    rmSync(envFilePath, { force: true });
  });

  test("import flow accepts a valid phrase + never echoes it back", async () => {
    env.AGENT_SIGNER_MNEMONIC = undefined;
    const { mnemonic } = await generateWallet(); // a real, valid 24-word phrase
    const { app, envFilePath, applied } = setupApp();
    const res = await postSetup(app, { mnemonic });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(JSON.stringify(body)).not.toContain("mnemonic"); // never returned
    expect(applied[0]?.AGENT_SIGNER_MNEMONIC).toBe(mnemonic);
    rmSync(envFilePath, { force: true });
  });

  test("rejects an invalid mnemonic", async () => {
    env.AGENT_SIGNER_MNEMONIC = undefined;
    const { app, applied } = setupApp();
    const res = await postSetup(app, {
      mnemonic: "totally not a real bip39 phrase",
    });
    expect(res.status).toBe(400);
    expect(applied).toHaveLength(0);
  });
});

describe("agent seed export (/api/agent/mnemonic)", () => {
  const savedMnemonic = env.AGENT_SIGNER_MNEMONIC;
  afterEach(() => {
    env.AGENT_SIGNER_MNEMONIC = savedMnemonic;
  });

  const app = (
    auth: { token?: string; host?: string } = { host: "127.0.0.1" },
  ) => buildApp(makeEngine(), new PaymentRequests(":memory:"), auth);

  const get = (
    a: ReturnType<typeof buildApp>,
    headers: Record<string, string> = {},
  ) => a.request("/api/agent/mnemonic", { headers });

  test("reveals the configured master phrase on loopback", async () => {
    env.AGENT_SIGNER_MNEMONIC = "alpha bravo charlie delta echo foxtrot";
    const res = await get(app());
    expect(res.status).toBe(200);
    expect((await res.json()) as { mnemonic: string }).toEqual({
      mnemonic: "alpha bravo charlie delta echo foxtrot",
    });
  });

  test("404 when no agent wallet is configured", async () => {
    env.AGENT_SIGNER_MNEMONIC = undefined;
    expect((await get(app())).status).toBe(404);
  });

  test("stays behind the cross-site guard — never readable cross-origin", async () => {
    env.AGENT_SIGNER_MNEMONIC = "alpha bravo charlie";
    const res = await get(app(), { origin: "http://evil.example" });
    expect(res.status).toBe(403);
  });

  test("loopback-only: refused on an exposed bind even when authed", async () => {
    env.AGENT_SIGNER_MNEMONIC = "alpha bravo charlie";
    const res = await get(app({ token: "secret", host: "0.0.0.0" }), {
      authorization: "Bearer secret",
    });
    expect(res.status).toBe(403);
  });
});
