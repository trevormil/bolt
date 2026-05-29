import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LlmAuthError, type Meter } from "@vellum/llm";
import type { RunLoop } from "@vellum/orchestrator";
import type { TxChain } from "@vellum/tx";
import { env } from "@vellum/shared";
import { createEngine, PaymentRequests, DepositRequests } from "@vellum/engine";
import {
  buildApp,
  creditedAmount,
  webServeOptions,
  parseGating,
} from "./server.ts";

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
  app = buildApp(
    engine,
    new PaymentRequests(":memory:"),
    new DepositRequests(":memory:"),
  );
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

  test("SPA cache policy: shell no-cache, hashed assets immutable (#54)", async () => {
    // Hermetic: serve a throwaway dist fixture so the assertion never depends on
    // whatever build a checkout happens to have (a clean checkout has none).
    const dist = mkdtempSync(join(tmpdir(), "vellum-dist-"));
    mkdirSync(join(dist, "assets"));
    writeFileSync(
      join(dist, "index.html"),
      "<!doctype html><div id=root></div>",
    );
    writeFileSync(join(dist, "assets", "app-abc123.js"), "export const x=1;");
    const a = buildApp(
      makeEngine(),
      new PaymentRequests(":memory:"),
      new DepositRequests(":memory:"),
      undefined,
      {
        distDir: dist + "/",
      },
    );
    try {
      // The shell must always revalidate, or a browser keeps loading an old
      // hashed bundle after a rebuild (the "still seeing old UI" bug).
      const shell = await a.request("/");
      expect(shell.status).toBe(200);
      expect(shell.headers.get("cache-control")).toBe("no-cache");
      // Hashed assets are immutable — safe to cache forever.
      const asset = await a.request("/assets/app-abc123.js");
      expect(asset.status).toBe(200);
      expect(asset.headers.get("cache-control")).toContain("immutable");
      // SPA routing: an unknown path falls back to the (no-cache) shell.
      const spa = await a.request("/some/client/route");
      expect(spa.headers.get("cache-control")).toBe("no-cache");
    } finally {
      rmSync(dist, { recursive: true, force: true });
    }
  });

  test("missing build → clear 404, still no-cache (#54)", async () => {
    const empty = mkdtempSync(join(tmpdir(), "vellum-empty-"));
    const a = buildApp(
      makeEngine(),
      new PaymentRequests(":memory:"),
      new DepositRequests(":memory:"),
      undefined,
      {
        distDir: empty + "/",
      },
    );
    const res = await a.request("/");
    expect(res.status).toBe(404);
    expect(res.headers.get("cache-control")).toBe("no-cache");
    rmSync(empty, { recursive: true, force: true });
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

  test("a persona created with no instructions gets the default PERSONA.md (#91)", async () => {
    const res = await post("/api/personas", { name: "Atlas" });
    const soul = (
      (await res.json()) as { persona: { soul: { instructions?: string } } }
    ).persona.soul;
    // Go all-in on PERSONA.md: blank → a real default doc, not a role/voice fallback.
    expect(soul.instructions).toBeTruthy();
    expect(soul.instructions).toContain("How to act");
  });

  test("persona PERSONA.md instructions: set on create + edit via PATCH (#87)", async () => {
    const created = await post("/api/personas", {
      name: "Atlas",
      instructions: "# Atlas\nReply only in haiku.",
    });
    expect(created.status).toBe(201);
    expect(
      (
        (await created.json()) as {
          persona: { soul: { instructions?: string } };
        }
      ).persona.soul.instructions,
    ).toBe("# Atlas\nReply only in haiku.");

    // PATCH updates the doc.
    const patched = await app.request("/api/personas/atlas", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ instructions: "# Atlas\nBe terse." }),
    });
    expect(patched.status).toBe(200);
    expect(
      (
        (await patched.json()) as {
          persona: { soul: { instructions?: string } };
        }
      ).persona.soul.instructions,
    ).toBe("# Atlas\nBe terse.");

    // PATCH on an unknown persona → 404.
    const missing = await app.request("/api/personas/ghost", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ instructions: "x" }),
    });
    expect(missing.status).toBe(404);
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
      to: "bb1" + "q".repeat(39),
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

  test("tx-status route reports a submitted tx + 404s for unknown/cross-persona (#81)", async () => {
    await post("/api/personas", { name: "Atlas" });
    await post("/api/personas/atlas/vaults", {
      name: "Groceries",
      symbol: "vUSDC",
      dailyWithdrawLimit: 5,
    });
    const wd = await post("/api/personas/atlas/vaults/777/withdraw", {
      amount: "1000000",
    });
    const tx = (await wd.json()) as { id: string };

    const ok = await app.request(`/api/personas/atlas/tx/${tx.id}`);
    expect(ok.status).toBe(200);
    const body = (await ok.json()) as { id: string; status: string };
    expect(body.id).toBe(tx.id);
    expect(["pending", "confirmed"]).toContain(body.status);

    // Unknown tx id → 404.
    expect(
      (await app.request("/api/personas/atlas/tx/does-not-exist")).status,
    ).toBe(404);

    // Cross-persona: another persona can't read atlas's tx (no status leak).
    await post("/api/personas", { name: "Nyx" });
    expect((await app.request(`/api/personas/nyx/tx/${tx.id}`)).status).toBe(
      404,
    );
  });

  test("vault create uses the supplied managerAddress (the connected wallet) (#75)", async () => {
    await post("/api/personas", { name: "Atlas" });
    const manager = "bb1" + "m".repeat(39);
    const res = await post("/api/personas/atlas/vaults", {
      name: "Rent",
      symbol: "vRENT",
      managerAddress: manager,
    });
    expect(res.status).toBe(201);
    expect((await res.json()) as { managerAddress: string }).toMatchObject({
      managerAddress: manager,
    });
  });

  test("vault create with no manager configured → clean 400, not a 500 (#75)", async () => {
    // No connected wallet (no managerAddress) AND no VELLUM_PRINCIPAL_ADDRESS
    // default → the engine throws; the route must surface a 400, not an
    // unhandled 500.
    const noMgr = buildApp(
      makeEngine({
        vault: {
          defaultManager: undefined,
          createVault: async () => ({ txHash: "VAULTCREATE1" }),
          confirmTx: async () => ({ height: 9, code: 0 }),
          fetchTx: async () => fakeCreateTxEvents,
          fetchTokenBalance: async () => "0",
        },
      }),
      new PaymentRequests(":memory:"),
      new DepositRequests(":memory:"),
    );
    await noMgr.request("/api/personas", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Atlas" }),
    });
    const res = await noMgr.request("/api/personas/atlas/vaults", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Rent", symbol: "vRENT" }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()) as { error: string }).toMatchObject({
      error: expect.stringContaining("manager"),
    });
  });

  test("vault create rejects a malformed managerAddress (#75)", async () => {
    await post("/api/personas", { name: "Atlas" });
    const res = await post("/api/personas/atlas/vaults", {
      name: "Rent",
      symbol: "vRENT",
      managerAddress: "bb1short",
    });
    expect(res.status).toBe(400);
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
    // amount "0" is rejected even with a well-formed recipient (#65 — the route
    // now requires a strictly-positive integer, matching the TxManager chokepoint).
    expect(
      (
        await post("/api/personas/atlas/spend", {
          to: "bb1" + "q".repeat(39),
          amount: "0",
        })
      ).status,
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

  // Chat sessions (#72) + connected-wallet context (#73).
  test("conversation CRUD round-trips per persona", async () => {
    await post("/api/personas", { name: "Atlas" });
    // None to start.
    const empty = (await (
      await app.request("/api/personas/atlas/conversations")
    ).json()) as { conversations: unknown[] };
    expect(empty.conversations).toHaveLength(0);
    // Create.
    const created = (await post("/api/personas/atlas/conversations", {
      title: "Taxes",
    })) as Response;
    expect(created.status).toBe(201);
    const conv = (await created.json()) as { id: string; title: string };
    expect(conv.title).toBe("Taxes");
    // List shows it.
    const list = (await (
      await app.request("/api/personas/atlas/conversations")
    ).json()) as { conversations: { id: string }[] };
    expect(list.conversations.map((c) => c.id)).toEqual([conv.id]);
    // Rename.
    const renamed = await app.request(
      `/api/personas/atlas/conversations/${conv.id}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "Q2 taxes" }),
      },
    );
    expect(((await renamed.json()) as { title: string }).title).toBe(
      "Q2 taxes",
    );
    // Delete.
    const del = await app.request(
      `/api/personas/atlas/conversations/${conv.id}`,
      { method: "DELETE" },
    );
    expect(del.status).toBe(200);
    const after = (await (
      await app.request("/api/personas/atlas/conversations")
    ).json()) as { conversations: unknown[] };
    expect(after.conversations).toHaveLength(0);
  });

  test("chat persists the transcript to the session (survives reload)", async () => {
    await post("/api/personas", { name: "Atlas" });
    const conv = (await (
      await post("/api/personas/atlas/conversations", {})
    ).json()) as { id: string };
    const res = await post("/api/chat", {
      conversationId: conv.id,
      personaId: "atlas",
      message: "what's my balance?",
    });
    expect(res.status).toBe(200);
    const msgs = (await (
      await app.request(`/api/personas/atlas/conversations/${conv.id}/messages`)
    ).json()) as { messages: { role: string; text: string }[] };
    expect(msgs.messages.map((m) => m.role)).toEqual(["user", "agent"]);
    expect(msgs.messages[0]!.text).toBe("what's my balance?");
    expect(msgs.messages[1]!.text.length).toBeGreaterThan(0);
  });

  test("chat rejects a malformed connected wallet address (#73)", async () => {
    await post("/api/personas", { name: "Atlas" });
    const res = await post("/api/chat", {
      conversationId: "c-bad-addr",
      personaId: "atlas",
      message: "hi",
      humanAddress: "0xdeadbeef", // not a bb1 address
    });
    expect(res.status).toBe(400);
  });

  test("chat accepts a valid connected wallet address (#73)", async () => {
    await post("/api/personas", { name: "Atlas" });
    const res = await post("/api/chat", {
      conversationId: "c-good-addr",
      personaId: "atlas",
      message: "send to my wallet",
      humanAddress: "bb1" + "q".repeat(39),
    });
    expect(res.status).toBe(200);
  });

  test("chat refuses a conversation id owned by another persona (wall)", async () => {
    await post("/api/personas", { name: "Atlas" });
    await post("/api/personas", { name: "Nova" });
    const conv = (await (
      await post("/api/personas/atlas/conversations", {})
    ).json()) as { id: string };
    // Nova tries to post into Atlas's conversation → refused.
    const res = await post("/api/chat", {
      conversationId: conv.id,
      personaId: "nova",
      message: "leak atlas",
    });
    expect(res.status).toBe(400);
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
    // Structurally-valid bb1 signers — parseGating now does the full bb1 check.
    const VS1 = `bb1${"a".repeat(39)}`;
    const VS2 = `bb1${"b".repeat(39)}`;
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
        multisig: { signers: [{ address: VS1 }], threshold: 1 },
      }),
    ).toEqual({
      multisig: {
        signers: [{ address: VS1, weight: undefined }],
        threshold: 1,
      },
    });
    expect(parseGating({ multisig: { signers: [], threshold: 1 } })).toBe(
      "invalid",
    ); // empty signer set
    expect(
      parseGating({
        multisig: {
          signers: [{ address: VS1 }, { address: VS2 }],
          threshold: 3, // > total weight (2) → unreachable quorum (!44)
        },
      }),
    ).toBe("invalid");
    expect(
      parseGating({
        multisig: { signers: [{ address: "0xbad" }], threshold: 1 },
      }),
    ).toBe("invalid"); // non-bb1 signer
    expect(
      parseGating({
        multisig: { signers: [{ address: "bb1tooshort" }], threshold: 1 },
      }),
    ).toBe("invalid"); // bb1-prefixed but structurally invalid (#62 review)
    // invalid: bad period, non-positive limit, negative unlock
    expect(parseGating({ amount: { limitUsd: 5, period: "yearly" } })).toBe(
      "invalid",
    );
    expect(parseGating({ amount: { limitUsd: 0, period: "daily" } })).toBe(
      "invalid",
    );
    expect(parseGating({ time: { unlockAt: -1 } })).toBe("invalid");

    // Active window (#55): start / end, each optional.
    expect(parseGating({ time: { expiresAt: 500 } })).toEqual({
      time: { expiresAt: 500 },
    });
    expect(parseGating({ time: { unlockAt: 100, expiresAt: 500 } })).toEqual({
      time: { unlockAt: 100, expiresAt: 500 },
    });
    expect(parseGating({ time: { expiresAt: -1 } })).toBe("invalid");
    // A window that ends at/before it starts can never be withdrawn from.
    expect(parseGating({ time: { unlockAt: 500, expiresAt: 500 } })).toBe(
      "invalid",
    );
    expect(parseGating({ time: { unlockAt: 500, expiresAt: 100 } })).toBe(
      "invalid",
    );
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
    // positive but rounds to 0 µUSDC → rejected (#63 review)
    expect(
      (
        await post("/api/personas/atlas/payment-requests", {
          amountUsdc: 0.0000001,
        })
      ).status,
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

describe("vault deposit requests (#62)", () => {
  // Create a persona + a vault (collectionId "777" per the fake create tx) so the
  // deposit-request route — which targets an existing vault — has something to
  // reference.
  async function setupVault() {
    await post("/api/personas", { name: "Atlas" });
    const created = await post("/api/personas/atlas/vaults", {
      name: "Groceries",
      symbol: "vUSDC",
    });
    expect(created.status).toBe(201);
  }

  test("create → public get → list a deposit request for a vault", async () => {
    await setupVault();
    const created = await post("/api/personas/atlas/deposit-requests", {
      collectionId: "777",
      amountUsdc: 12.5,
      memo: "top up groceries",
    });
    expect(created.status).toBe(201);
    const req = (await created.json()) as {
      id: string;
      amount: string;
      collectionId: string;
      vaultSymbol: string;
      backingAddress: string;
      agentAddress: string;
      memo: string;
    };
    expect(req.amount).toBe("12500000"); // µUSDC
    expect(req.collectionId).toBe("777");
    expect(req.vaultSymbol).toBe("vUSDC");
    expect(req.backingAddress).toBe("bb1backing");
    expect(req.agentAddress.startsWith("bb1")).toBe(true);
    expect(req.memo).toBe("top up groceries");

    // Public fetch by id (no persona context) → request + persona name.
    const got = (await (
      await app.request(`/api/deposit-requests/${req.id}`)
    ).json()) as { request: { id: string }; personaName: string };
    expect(got.request.id).toBe(req.id);
    expect(got.personaName).toBe("Atlas");

    const list = (await (
      await app.request("/api/personas/atlas/deposit-requests")
    ).json()) as { requests: { id: string }[] };
    expect(list.requests.map((r) => r.id)).toContain(req.id);
  });

  test("validates amount, persona, and that the vault exists for the persona", async () => {
    await setupVault();
    // amount must be > 0
    expect(
      (
        await post("/api/personas/atlas/deposit-requests", {
          collectionId: "777",
          amountUsdc: 0,
        })
      ).status,
    ).toBe(400);
    // positive but rounds to 0 µUSDC → rejected (#63 review)
    expect(
      (
        await post("/api/personas/atlas/deposit-requests", {
          collectionId: "777",
          amountUsdc: 0.0000001,
        })
      ).status,
    ).toBe(400);
    // collectionId is required
    expect(
      (await post("/api/personas/atlas/deposit-requests", { amountUsdc: 5 }))
        .status,
    ).toBe(400);
    // unknown persona
    expect(
      (
        await post("/api/personas/ghost/deposit-requests", {
          collectionId: "777",
          amountUsdc: 5,
        })
      ).status,
    ).toBe(404);
    // unknown vault for this persona
    expect(
      (
        await post("/api/personas/atlas/deposit-requests", {
          collectionId: "999",
          amountUsdc: 5,
        })
      ).status,
    ).toBe(404);
    // unknown request id → 404
    expect((await app.request("/api/deposit-requests/nope")).status).toBe(404);
  });

  test("there is NO public confirm route — a deposit has nothing to verify (#62)", async () => {
    await setupVault();
    const req = (await (
      await post("/api/personas/atlas/deposit-requests", {
        collectionId: "777",
        amountUsdc: 4,
      })
    ).json()) as { id: string };

    // An unauthenticated delete-by-id would be a griefing vector (unlike the
    // payment-request confirm, which verifies an on-chain credit). The route is
    // removed → a POST to it is a normal API 404; the request stays pending.
    expect(
      (await post(`/api/deposit-requests/${req.id}/confirm`, {})).status,
    ).toBe(404);
    expect((await app.request(`/api/deposit-requests/${req.id}`)).status).toBe(
      200,
    );
    // Deposits write no ledger entry (the escrow is on-chain truth).
    const led = (await (
      await app.request("/api/personas/atlas/ledger")
    ).json()) as { entries: { kind: string }[] };
    expect(led.entries.some((e) => e.kind === "funding")).toBe(false);
  });

  test("dismiss deletes a pending deposit request", async () => {
    await setupVault();
    const req = (await (
      await post("/api/personas/atlas/deposit-requests", {
        collectionId: "777",
        amountUsdc: 3,
      })
    ).json()) as { id: string };

    const del = await app.request(`/api/deposit-requests/${req.id}`, {
      method: "DELETE",
    });
    expect(del.status).toBe(200);

    const after = (await (
      await app.request("/api/personas/atlas/deposit-requests")
    ).json()) as { requests: { id: string }[] };
    expect(after.requests).toHaveLength(0);
  });
});

describe("API auth", () => {
  const withAuth = (auth: { token?: string; host?: string }) =>
    buildApp(
      makeEngine(),
      new PaymentRequests(":memory:"),
      new DepositRequests(":memory:"),
      auth,
    );

  test("public routes need no token (even when one is set)", async () => {
    const a = withAuth({ token: "secret", host: "127.0.0.1" });
    expect((await a.request("/api/health")).status).toBe(200);
    expect((await a.request("/api/config")).status).toBe(200);
    // share-link pay endpoints reach their handler (404 = not auth-blocked)
    expect((await a.request("/api/payment-requests/nope")).status).toBe(404);
    // share-link deposit endpoints are likewise public (#62)
    expect((await a.request("/api/deposit-requests/nope")).status).toBe(404);
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
    const a = buildApp(
      makeEngine(),
      new PaymentRequests(":memory:"),
      new DepositRequests(":memory:"),
      {
        token: "secret",
        host: "0.0.0.0",
      },
    );
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
    // Injected OpenRouter health-check (#60) — defaults to "valid" so the happy
    // path needs no network; override with `async () => false` to test rejection.
    verifyKey: (key: string) => Promise<boolean> = async () => true,
    // Injected Telegram getMe health-check (#63) — defaults to "valid"; override
    // to test a bad-token rejection.
    verifyTelegram: (
      token: string,
    ) => Promise<{ ok: boolean; username?: string }> = async () => ({
      ok: true,
      username: "test_bot",
    }),
  ) {
    const envFilePath = join(
      tmpdir(),
      `vellum-setup-${Math.random().toString(36).slice(2)}.env`,
    );
    const applied: Partial<typeof env>[] = [];
    const app = buildApp(
      makeEngine(),
      new PaymentRequests(":memory:"),
      new DepositRequests(":memory:"),
      auth,
      {
        envFilePath,
        applyRuntime: (p) => applied.push(p),
        verifyKey,
        verifyTelegram,
      },
    );
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

  test("optionally enables Telegram: persists + adopts the token only when provided (#49)", async () => {
    env.AGENT_SIGNER_MNEMONIC = undefined;
    const { app, envFilePath, applied } = setupApp();
    const res = await postSetup(app, {
      openRouterKey: "sk-or-test",
      telegramBotToken: "123456:ABC-token",
      telegramPrincipalChatId: "42",
    });
    expect(res.status).toBe(200);
    expect((await res.json()) as { telegramEnabled?: boolean }).toMatchObject({
      telegramEnabled: true,
    });
    // Adopted into runtime env so the next daemon start attaches the bot, and
    // persisted for that boot. The chat id is coerced to a number (env schema).
    expect(applied[0]?.TELEGRAM_BOT_TOKEN).toBe("123456:ABC-token");
    expect(applied[0]?.TELEGRAM_PRINCIPAL_CHAT_ID).toBe(42);
    const written = readFileSync(envFilePath, "utf8");
    expect(written).toContain("TELEGRAM_BOT_TOKEN=123456:ABC-token");
    expect(written).toContain("TELEGRAM_PRINCIPAL_CHAT_ID=42");
    rmSync(envFilePath, { force: true });
  });

  test("rejects an invalid (non-integer) Telegram chat id with no side effects (#65 review)", async () => {
    env.AGENT_SIGNER_MNEMONIC = undefined;
    const { app, envFilePath, applied } = setupApp();
    const res = await postSetup(app, {
      openRouterKey: "sk-or-test",
      telegramBotToken: "123456:ABC-token",
      telegramPrincipalChatId: "not-a-number",
    });
    expect(res.status).toBe(400);
    // A typo must never persist (next-boot zod coercion → NaN → startup fail),
    // and must not generate a wallet or mutate runtime env.
    expect(applied).toHaveLength(0);
    expect(() => readFileSync(envFilePath, "utf8")).toThrow(); // .env never written
  });

  test("Telegram stays optional: no token → nothing written, telegramEnabled false (#49)", async () => {
    env.AGENT_SIGNER_MNEMONIC = undefined;
    const { app, envFilePath, applied } = setupApp();
    const res = await postSetup(app, { openRouterKey: "sk-or-test" });
    expect(res.status).toBe(200);
    expect((await res.json()) as { telegramEnabled?: boolean }).toMatchObject({
      telegramEnabled: false,
    });
    expect(applied[0]?.TELEGRAM_BOT_TOKEN).toBeUndefined();
    expect(readFileSync(envFilePath, "utf8")).not.toContain(
      "TELEGRAM_BOT_TOKEN",
    );
    rmSync(envFilePath, { force: true });
  });

  test("setup returns the bot @username on a getMe-valid token (#63)", async () => {
    env.AGENT_SIGNER_MNEMONIC = undefined;
    const { app, envFilePath } = setupApp();
    const res = await postSetup(app, {
      openRouterKey: "sk-or-test",
      telegramBotToken: "123456:ABC",
    });
    expect(res.status).toBe(200);
    expect((await res.json()) as Record<string, unknown>).toMatchObject({
      telegramEnabled: true,
      telegramUsername: "test_bot",
    });
    rmSync(envFilePath, { force: true });
  });

  test("setup rejects an invalid Telegram bot token with no side effects (#63)", async () => {
    env.AGENT_SIGNER_MNEMONIC = undefined;
    const { app, envFilePath, applied } = setupApp(
      { host: "127.0.0.1" },
      async () => true,
      async () => ({ ok: false }), // getMe rejects the token
    );
    const res = await postSetup(app, {
      openRouterKey: "sk-or-test",
      telegramBotToken: "bad-token",
    });
    expect(res.status).toBe(400);
    expect(applied).toHaveLength(0); // no wallet generated, nothing persisted
    expect(() => readFileSync(envFilePath, "utf8")).toThrow();
  });

  test("ignores any mnemonic in the body — wallets are always generated (#59)", async () => {
    // No import: even if a caller sends a phrase, setup generates a fresh one.
    env.AGENT_SIGNER_MNEMONIC = undefined;
    const { app, applied } = setupApp();
    const res = await postSetup(app, {
      openRouterKey: "sk-or-test",
      mnemonic: "attacker supplied phrase that must be ignored",
    });
    expect(res.status).toBe(200);
    const adopted = applied[0]?.AGENT_SIGNER_MNEMONIC ?? "";
    expect(adopted.trim().split(/\s+/)).toHaveLength(24); // freshly generated
    expect(adopted).not.toContain("attacker");
  });

  test("requires an OpenRouter key (#60)", async () => {
    env.AGENT_SIGNER_MNEMONIC = undefined;
    const { app, applied } = setupApp();
    const res = await postSetup(app, {}); // no key
    expect(res.status).toBe(400);
    expect(applied).toHaveLength(0); // no wallet generated, nothing persisted
  });

  test("rejects an invalid OpenRouter key — nothing persisted (#60)", async () => {
    env.AGENT_SIGNER_MNEMONIC = undefined;
    const { app, applied } = setupApp(
      { host: "127.0.0.1" },
      async () => false, // health check fails
    );
    const res = await postSetup(app, { openRouterKey: "sk-or-bad" });
    expect(res.status).toBe(400);
    // The route validates the key BEFORE generating the wallet / writing .env,
    // so an empty `applied` proves nothing was persisted.
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
  ) =>
    buildApp(
      makeEngine(),
      new PaymentRequests(":memory:"),
      new DepositRequests(":memory:"),
      auth,
    );

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

describe("change OpenRouter key (/api/settings/openrouter-key, #60)", () => {
  function keyApp(
    auth: { token?: string; host?: string } = { host: "127.0.0.1" },
    verifyKey: (key: string) => Promise<boolean> = async () => true,
  ) {
    const applied: Partial<typeof env>[] = [];
    const envFilePath = join(
      tmpdir(),
      `vellum-key-${Math.random().toString(36).slice(2)}.env`,
    );
    const app = buildApp(
      makeEngine(),
      new PaymentRequests(":memory:"),
      new DepositRequests(":memory:"),
      auth,
      {
        envFilePath,
        applyRuntime: (p) => applied.push(p),
        verifyKey,
      },
    );
    return { app, applied, envFilePath };
  }
  const post = (
    a: ReturnType<typeof buildApp>,
    body: unknown,
    headers: Record<string, string> = {},
  ) =>
    a.request("/api/settings/openrouter-key", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    });

  test("validates + persists a new key on loopback", async () => {
    const { app, applied, envFilePath } = keyApp();
    const res = await post(app, { key: "sk-or-new" });
    expect(res.status).toBe(200);
    expect(applied[0]?.OPENROUTER_API_KEY).toBe("sk-or-new");
    expect(readFileSync(envFilePath, "utf8")).toContain(
      "OPENROUTER_API_KEY=sk-or-new",
    );
    rmSync(envFilePath, { force: true });
  });

  test("rejects an invalid key (400, nothing persisted)", async () => {
    const { app, applied } = keyApp({ host: "127.0.0.1" }, async () => false);
    expect((await post(app, { key: "sk-or-bad" })).status).toBe(400);
    expect(applied).toHaveLength(0);
  });

  test("rejects an empty key", async () => {
    const { app } = keyApp();
    expect((await post(app, {})).status).toBe(400);
  });

  test("cross-origin rejected (not public)", async () => {
    const { app, applied } = keyApp();
    const res = await post(
      app,
      { key: "sk-or-x" },
      { origin: "http://evil.x" },
    );
    expect(res.status).toBe(403);
    expect(applied).toHaveLength(0);
  });

  test("loopback-only on an exposed bind even when authed", async () => {
    const { app } = keyApp({ token: "secret", host: "0.0.0.0" });
    const res = await post(
      app,
      { key: "sk-or-x" },
      {
        authorization: "Bearer secret",
      },
    );
    expect(res.status).toBe(403);
  });
});

describe("telegram settings route — set / rotate / clear (#63)", () => {
  function tgApp(
    verifyTelegram: (
      token: string,
    ) => Promise<{ ok: boolean; username?: string }> = async () => ({
      ok: true,
      username: "test_bot",
    }),
  ) {
    const envFilePath = join(
      tmpdir(),
      `vellum-tg-${Math.random().toString(36).slice(2)}.env`,
    );
    const applied: Partial<typeof env>[] = [];
    // Hot-attach spy (#74): record the poller lifecycle the route drives.
    const tgCalls: string[] = [];
    const telegram = {
      attach: async (token: string) => {
        tgCalls.push(`attach:${token}`);
      },
      detach: async () => {
        tgCalls.push("detach");
      },
    };
    const app = buildApp(
      makeEngine(),
      new PaymentRequests(":memory:"),
      new DepositRequests(":memory:"),
      { host: "127.0.0.1" },
      {
        envFilePath,
        applyRuntime: (p) => applied.push(p),
        verifyKey: async () => true,
        verifyTelegram,
        telegram,
      },
    );
    return { app, envFilePath, applied, tgCalls };
  }
  const postTg = (app: ReturnType<typeof buildApp>, body: unknown) =>
    app.request("/api/settings/telegram", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  test("valid token → 200 + @username, persisted + adopted + hot-attached", async () => {
    const { app, envFilePath, applied, tgCalls } = tgApp();
    const res = await postTg(app, { token: "123:ABC", principalChatId: "42" });
    expect(res.status).toBe(200);
    expect((await res.json()) as Record<string, unknown>).toMatchObject({
      ok: true,
      configured: true,
      username: "test_bot",
    });
    expect(applied[0]?.TELEGRAM_BOT_TOKEN).toBe("123:ABC");
    expect(applied[0]?.TELEGRAM_PRINCIPAL_CHAT_ID).toBe(42);
    expect(readFileSync(envFilePath, "utf8")).toContain(
      "TELEGRAM_BOT_TOKEN=123:ABC",
    );
    // #74: the poller is hot-attached live with the new token (no restart).
    expect(tgCalls).toEqual(["attach:123:ABC"]);
    rmSync(envFilePath, { force: true });
  });

  test("empty token → clears telegram (configured:false) + detaches the poller + clears principal id", async () => {
    const { app, envFilePath, applied, tgCalls } = tgApp();
    // Seed a stale principal id so we can prove disable wipes it (!67 review).
    writeFileSync(envFilePath, "TELEGRAM_PRINCIPAL_CHAT_ID=999\n");
    const res = await postTg(app, { token: "" });
    expect(res.status).toBe(200);
    expect((await res.json()) as Record<string, unknown>).toMatchObject({
      configured: false,
    });
    expect(applied).toHaveLength(1); // applyRuntime called to clear
    // The stale principal id is cleared in both runtime + the env file, so the
    // next bot isn't pinned to a dead chat.
    expect("TELEGRAM_PRINCIPAL_CHAT_ID" in applied[0]!).toBe(true);
    expect(applied[0]!.TELEGRAM_PRINCIPAL_CHAT_ID).toBeUndefined();
    expect(readFileSync(envFilePath, "utf8")).not.toContain(
      "TELEGRAM_PRINCIPAL_CHAT_ID=999",
    );
    expect(tgCalls).toEqual(["detach"]); // #74: poller stopped live
    rmSync(envFilePath, { force: true });
  });

  test("reconnect with a blank chat id clears any prior principal id (!67 review)", async () => {
    const { app, envFilePath, applied } = tgApp();
    // A previous run pinned a principal chat id; now we rotate to a new bot and
    // intentionally leave the chat id blank → TOFU should re-claim, so the old
    // id must not survive.
    writeFileSync(envFilePath, "TELEGRAM_PRINCIPAL_CHAT_ID=999\n");
    const res = await postTg(app, { token: "456:DEF" });
    expect(res.status).toBe(200);
    expect(applied[0]?.TELEGRAM_BOT_TOKEN).toBe("456:DEF");
    expect("TELEGRAM_PRINCIPAL_CHAT_ID" in applied[0]!).toBe(true);
    expect(applied[0]!.TELEGRAM_PRINCIPAL_CHAT_ID).toBeUndefined();
    expect(readFileSync(envFilePath, "utf8")).not.toContain(
      "TELEGRAM_PRINCIPAL_CHAT_ID=999",
    );
    rmSync(envFilePath, { force: true });
  });

  test("invalid token (getMe fails) → 400, nothing persisted, not attached", async () => {
    const { app, applied, tgCalls } = tgApp(async () => ({ ok: false }));
    const res = await postTg(app, { token: "bad" });
    expect(res.status).toBe(400);
    expect(applied).toHaveLength(0);
    expect(tgCalls).toHaveLength(0); // #74: a bad token never attaches a poller
  });

  test("non-integer chat id → 400, nothing persisted", async () => {
    const { app, applied } = tgApp();
    const res = await postTg(app, { token: "123:ABC", principalChatId: "abc" });
    expect(res.status).toBe(400);
    expect(applied).toHaveLength(0);
  });

  test("loopback-only: rejected when the daemon is bound beyond loopback", async () => {
    const envFilePath = join(tmpdir(), `vellum-tg-exposed.env`);
    const app = buildApp(
      makeEngine(),
      new PaymentRequests(":memory:"),
      new DepositRequests(":memory:"),
      { token: "secret", host: "0.0.0.0" },
      {
        envFilePath,
        applyRuntime: () => {},
        verifyKey: async () => true,
        verifyTelegram: async () => ({ ok: true }),
      },
    );
    const res = await app.request("/api/settings/telegram", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer secret",
      },
      body: JSON.stringify({ token: "123:ABC" }),
    });
    expect(res.status).toBe(403);
  });
});

describe("edge/failure hardening (#85)", () => {
  const appWith = (over: Parameters<typeof createEngine>[0]) =>
    buildApp(
      makeEngine(over),
      new PaymentRequests(":memory:"),
      new DepositRequests(":memory:"),
    );
  const send = (a: ReturnType<typeof buildApp>, path: string, body: unknown) =>
    a.request(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  test("spend over the wallet balance → clean 422, not a 500", async () => {
    // fakeTxChain reports 10 USDC; spend 20 → insufficient → TxRejectedError → 422.
    await post("/api/personas", { name: "Atlas" });
    const res = await post("/api/personas/atlas/spend", {
      to: "bb1" + "q".repeat(39),
      amount: "20000000",
    });
    expect(res.status).toBe(422);
    expect(((await res.json()) as { error: string }).error).toMatch(
      /insufficient/i,
    );
  });

  test("a vault withdrawal rejected pre-flight → clean 422, not a 500", async () => {
    const a = appWith({
      txChain: {
        ...fakeTxChain,
        signAndBroadcast: async () => {
          throw new Error(
            "rejected: amount exceeds the approval's per-day limit",
          );
        },
      },
    });
    await send(a, "/api/personas", { name: "Atlas" });
    await send(a, "/api/personas/atlas/vaults", {
      name: "Groceries",
      symbol: "vUSDC",
      dailyWithdrawLimit: 5,
    });
    const wd = await send(a, "/api/personas/atlas/vaults/777/withdraw", {
      amount: "1000000",
    });
    expect(wd.status).toBe(422);
    expect(((await wd.json()) as { error: string }).error).toMatch(/rejected/i);
  });

  test("an invalid OpenRouter key surfaces a clean in-chat message, not a 500", async () => {
    const a = appWith({
      runLoop: async () => {
        throw new LlmAuthError(401);
      },
    });
    await send(a, "/api/personas", { name: "Atlas" });
    const res = await send(a, "/api/chat", {
      conversationId: "c1",
      personaId: "atlas",
      message: "hi",
    });
    // Caught in chat() → a clean 200 reply pointing at Settings (mirrors budget).
    expect(res.status).toBe(200);
    expect(((await res.json()) as { reply: string }).reply).toMatch(
      /OpenRouter.*(invalid|expired)/i,
    );
  });
});
