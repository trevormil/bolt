import { Hono } from "hono";
import { confirmTx } from "@vellum/chain";
import { tracer } from "@vellum/trace";
import { createLogger, env } from "@vellum/shared";
import {
  createEngine,
  chat,
  freeformCap,
  llmBudget,
  type Engine,
} from "@vellum/engine";
import { PaymentRequests } from "./payment-requests.ts";

// Built SPA dir, resolved from this file (cwd-independent) so the server can be
// launched from the repo root (where .env loads) or from packages/web alike.
const DIST = new URL("../dist/", import.meta.url).pathname;

// Meridian devnet faucet mints a fixed 10 USDC/claim — used to gate against
// overshooting the free-form cap (0010).
const FAUCET_CLAIM_USDC = 10;

const log = createLogger("web");

function slug(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "persona"
  );
}

// The web API: a thin shell over the engine. Onboarding (create persona →
// provision wallet), chat (deterministic routing → bounded agent loop → ledger),
// and per-persona wallet/ledger views. The persona memory hard wall + routing
// determinism live in the engine packages; this layer just exposes them.
export function buildApp(engine: Engine) {
  const app = new Hono();
  const paymentRequests = new PaymentRequests(env.VELLUM_DB_PATH);

  app.get("/api/health", (c) => c.json({ ok: true }));

  // Public chain config so the client can configure Keplr (0027) without baking
  // env into the bundle. No secrets — just the devnet endpoints + USDC denom.
  app.get("/api/config", (c) =>
    c.json({
      chainId: env.BITBADGES_CHAIN_ID,
      rpc: env.BITBADGES_RPC,
      lcd: env.BITBADGES_LCD,
      denom: env.VELLUM_DENOM,
    }),
  );

  app.get("/api/personas", (c) => {
    const personas = engine.store.listPersonas().map((p) => ({
      ...p,
      address: engine.wallets.addressFor(p.id),
    }));
    return c.json({ personas });
  });

  app.post("/api/personas", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      id?: string;
      name?: string;
      role?: string;
      voice?: string;
      soul?: { name: string; role: string; voice: string; values?: string[] };
    };
    const name = (body.name ?? "").trim();
    if (!name) return c.json({ error: "name is required" }, 400);
    // An explicit id must be slug-safe: routing encodes it into `/switch <id>`
    // (\S+) and it becomes a path param, so spaces/punctuation break chat.
    const explicit = body.id?.trim();
    if (explicit && !/^[a-z0-9-]+$/.test(explicit)) {
      return c.json({ error: "id must match /^[a-z0-9-]+$/" }, 400);
    }
    const id = explicit || slug(name);
    if (engine.store.getPersona(id)) {
      return c.json({ error: `persona already exists: ${id}` }, 409);
    }
    const soul = body.soul ?? {
      name,
      role: body.role?.trim() || "personal assistant",
      voice: body.voice?.trim() || "friendly and concise",
    };
    const persona = engine.store.createPersona(id, name, soul);
    const wallet = await engine.wallets.ensureWallet(id);
    return c.json({ persona, address: wallet.address }, 201);
  });

  app.get("/api/personas/:id/wallet", async (c) => {
    const id = c.req.param("id");
    if (!engine.store.getPersona(id))
      return c.json({ error: "unknown persona" }, 404);
    const wallet = await engine.wallets.ensureWallet(id);
    const balances = await engine.wallets.balanceFor(id);
    // Single-asset: only the USDC denom, in base units (micro-USDC).
    const usdc =
      balances.find((b) => b.denom === env.VELLUM_DENOM)?.amount ?? "0";
    return c.json({ address: wallet.address, usdc });
  });

  // Devnet USDC faucet — fund a persona's wallet (10 USDC/claim). Refused once the
  // free-form (discretionary x/bank) balance hits the cap (0010 — never fund above it).
  app.post("/api/personas/:id/faucet", async (c) => {
    const id = c.req.param("id");
    if (!engine.store.getPersona(id))
      return c.json({ error: "unknown persona" }, 404);
    const { address } = await engine.wallets.ensureWallet(id);
    const balances = await engine.wallets.balanceFor(id);
    const usdc =
      balances.find((b) => b.denom === env.VELLUM_DENOM)?.amount ?? "0";
    const cap = freeformCap(usdc);
    // Refuse if a full claim wouldn't fit under the cap — not just when already
    // at it. The faucet mints a fixed amount, so gating on headroom (vs atCap)
    // is what actually keeps the discretionary balance from overshooting (0010).
    if (cap.headroomUsd < FAUCET_CLAIM_USDC) {
      return c.json(
        {
          error: `free-form cap $${cap.capUsd} would be exceeded by a $${FAUCET_CLAIM_USDC} claim (balance $${cap.balanceUsd.toFixed(2)}, headroom $${cap.headroomUsd.toFixed(2)}) — move funds into a vault`,
        },
        409,
      );
    }
    return c.json(await engine.claimFaucet(address));
  });

  // Budgets/caps for a persona (0009 LLM-spend + 0010 free-form USDC).
  app.get("/api/personas/:id/budget", async (c) => {
    const id = c.req.param("id");
    if (!engine.store.getPersona(id))
      return c.json({ error: "unknown persona" }, 404);
    const balances = await engine.wallets.balanceFor(id);
    const usdc =
      balances.find((b) => b.denom === env.VELLUM_DENOM)?.amount ?? "0";
    return c.json({
      llm: llmBudget(engine.ledger, id),
      freeform: freeformCap(usdc),
    });
  });

  // Spend from a persona's wallet, governed by the tx-lifecycle invariant (0023):
  // returns the PENDING tx; confirmation + ledger happen out of band.
  app.post("/api/personas/:id/spend", async (c) => {
    const id = c.req.param("id");
    if (!engine.store.getPersona(id))
      return c.json({ error: "unknown persona" }, 404);
    const body = (await c.req.json().catch(() => ({}))) as {
      to?: string;
      amount?: string;
    };
    const to = body.to?.trim();
    const amount = body.amount?.trim();
    if (!to?.startsWith("bb1") || !amount || !/^[0-9]+$/.test(amount)) {
      return c.json(
        { error: "to (bb1…) and amount (base-unit integer) are required" },
        400,
      );
    }
    const trace = tracer.trace("spend", { personaId: id });
    const pending = await engine.txManager.spend({
      personaId: id,
      to,
      amount,
      trace,
    });
    trace.end();
    void tracer.flush();
    return c.json(pending);
  });

  // Vaults — agent creates (human is manager); list; agent withdraws within rules.
  app.get("/api/personas/:id/vaults", (c) => {
    const id = c.req.param("id");
    if (!engine.store.getPersona(id))
      return c.json({ error: "unknown persona" }, 404);
    return c.json({ vaults: engine.vaults.list(id) });
  });

  app.post("/api/personas/:id/vaults", async (c) => {
    const id = c.req.param("id");
    if (!engine.store.getPersona(id))
      return c.json({ error: "unknown persona" }, 404);
    const body = (await c.req.json().catch(() => ({}))) as {
      name?: string;
      symbol?: string;
      description?: string;
      dailyWithdrawLimit?: number;
    };
    if (!body.name?.trim() || !body.symbol?.trim()) {
      return c.json({ error: "name and symbol are required" }, 400);
    }
    const vault = await engine.vaults.create(id, {
      name: body.name.trim(),
      symbol: body.symbol.trim(),
      description: body.description?.trim(),
      dailyWithdrawLimit: body.dailyWithdrawLimit,
    });
    return c.json(vault, 201);
  });

  app.post("/api/personas/:id/vaults/:collectionId/withdraw", async (c) => {
    const id = c.req.param("id");
    if (!engine.store.getPersona(id))
      return c.json({ error: "unknown persona" }, 404);
    const body = (await c.req.json().catch(() => ({}))) as { amount?: string };
    const amount = body.amount?.trim();
    if (!amount || !/^[0-9]+$/.test(amount)) {
      return c.json(
        { error: "amount (base-unit µUSDC integer) is required" },
        400,
      );
    }
    return c.json(
      await engine.vaults.withdraw(id, c.req.param("collectionId"), amount),
    );
  });

  // Payment requests (0014) — the agent/user raises a one-time funding request;
  // the human opens the link and signs a USDC transfer to the persona from their
  // own Keplr wallet. The agent never pulls funds.
  app.post("/api/personas/:id/payment-requests", async (c) => {
    const id = c.req.param("id");
    if (!engine.store.getPersona(id))
      return c.json({ error: "unknown persona" }, 404);
    const addr = engine.wallets.addressFor(id);
    if (!addr) return c.json({ error: "persona has no wallet" }, 400);
    const body = (await c.req.json().catch(() => ({}))) as {
      amountUsdc?: number;
      memo?: string;
    };
    const usd = Number(body.amountUsdc);
    if (!Number.isFinite(usd) || usd <= 0)
      return c.json({ error: "amountUsdc must be a number > 0" }, 400);
    const req = paymentRequests.create({
      personaId: id,
      toAddress: addr,
      denom: env.VELLUM_DENOM,
      amount: String(Math.round(usd * 1e6)),
      memo: body.memo?.trim() || `Fund ${id}`,
    });
    return c.json(req, 201);
  });

  app.get("/api/personas/:id/payment-requests", (c) => {
    const id = c.req.param("id");
    if (!engine.store.getPersona(id))
      return c.json({ error: "unknown persona" }, 404);
    return c.json({ requests: paymentRequests.listForPersona(id) });
  });

  // Public — the pay page fetches this without persona context.
  app.get("/api/payment-requests/:reqId", (c) => {
    const r = paymentRequests.get(c.req.param("reqId"));
    if (!r) return c.json({ error: "unknown payment request" }, 404);
    const persona = engine.store.getPersona(r.personaId);
    return c.json({
      request: r,
      personaName: persona?.soul.name ?? r.personaId,
    });
  });

  // The human signed + broadcast client-side; this verifies the tx committed on
  // chain (truth from chain, not the client's word) and records the funding —
  // idempotent on txHash, so a double-confirm is a no-op.
  app.post("/api/payment-requests/:reqId/confirm", async (c) => {
    const r = paymentRequests.get(c.req.param("reqId"));
    if (!r) return c.json({ error: "unknown payment request" }, 404);
    if (r.status === "paid") return c.json(r); // already recorded — idempotent
    const body = (await c.req.json().catch(() => ({}))) as { txHash?: string };
    const txHash = body.txHash?.trim();
    if (!txHash) return c.json({ error: "txHash is required" }, 400);
    try {
      await confirmTx(txHash); // throws on revert / not-yet-committed
    } catch (e) {
      return c.json(
        { error: e instanceof Error ? e.message : "tx not confirmed" },
        400,
      );
    }
    engine.ledger.recordOnchain({
      personaId: r.personaId,
      kind: "funding",
      summary: `funded ${(Number(r.amount) / 1e6).toFixed(2)} USDC via payment request`,
      authority: "human",
      txHash,
      meta: { paymentRequestId: r.id, amount: r.amount, denom: r.denom },
    });
    return c.json(paymentRequests.markPaid(r.id, txHash));
  });

  app.get("/api/personas/:id/ledger", (c) => {
    const id = c.req.param("id");
    if (!engine.store.getPersona(id))
      return c.json({ error: "unknown persona" }, 404);
    return c.json({
      entries: engine.ledger.list({ personaId: id, limit: 100 }),
      summary: engine.ledger.summary(id),
    });
  });

  app.post("/api/chat", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      conversationId?: string;
      personaId?: string;
      message?: string;
    };
    const { conversationId, personaId, message } = body;
    if (!conversationId || !personaId || !message?.trim()) {
      return c.json(
        { error: "conversationId, personaId, and message are required" },
        400,
      );
    }
    if (!engine.store.getPersona(personaId)) {
      return c.json({ error: `unknown persona: ${personaId}` }, 404);
    }
    // Shared chat flow (budget gate → routing → agent loop + vault tools →
    // ledger + memory). Identical on web + Telegram.
    const trace = tracer.trace("chat", { personaId, conversationId });
    const r = await chat(engine, { conversationId, personaId, message, trace });
    trace.end();
    void tracer.flush();
    return c.json({
      reply: r.reply,
      personaId,
      costUsd: r.costUsd,
      tokens: r.tokens,
      budgetExceeded: r.budgetExceeded,
    });
  });

  // Unknown API paths return JSON (not the SPA), so clients get a real error.
  app.all("/api/*", (c) => c.json({ error: "not found" }, 404));

  // Serve the built SPA; unknown non-API paths fall back to index.html (SPA
  // routing). Bun infers Content-Type from the file.
  app.get("/*", async (c) => {
    const rel =
      c.req.path === "/" ? "index.html" : c.req.path.replace(/^\/+/, "");
    let file = Bun.file(DIST + rel);
    if (!(await file.exists())) file = Bun.file(DIST + "index.html");
    if (!(await file.exists())) {
      return c.text("build the SPA first: bun run build", 404);
    }
    return new Response(file);
  });

  return app;
}

// Bun.serve options. Binds loopback by default (the API is unauthenticated);
// set WEB_HOST=0.0.0.0 to expose beyond localhost. Exported for testability.
export function webServeOptions(app: ReturnType<typeof buildApp>) {
  return { port: env.WEB_PORT, hostname: env.WEB_HOST, fetch: app.fetch };
}

if (import.meta.main) {
  const engine = createEngine();
  // Reconcile any PENDING txs against the chain BEFORE serving new work (§13.5).
  await engine.txManager
    .reconcile()
    .catch((e) => log.warn(`reconcile failed: ${e}`));
  const app = buildApp(engine);
  const opts = webServeOptions(app);
  log.info(`Vellum web · http://${opts.hostname}:${opts.port}`);
  Bun.serve(opts);
}
