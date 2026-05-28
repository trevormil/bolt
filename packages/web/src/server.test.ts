import { beforeEach, describe, expect, test } from "bun:test";
import type { Meter } from "@vellum/llm";
import type { RunLoop } from "@vellum/orchestrator";
import type { TxChain } from "@vellum/tx";
import { env } from "@vellum/shared";
import { createEngine } from "@vellum/engine";
import { buildApp, creditedAmount, webServeOptions } from "./server.ts";
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

    // Escrow tracking (#45): the locked backing balance, read from chain.
    const escrow = (await (
      await app.request("/api/personas/atlas/vaults/777/escrow")
    ).json()) as { backingAddress: string; escrowedMicro: string };
    expect(escrow.backingAddress).toBe("bb1backing");
    expect(escrow.escrowedMicro).toBe("500"); // fake getBalances → 500 µUSDC
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
