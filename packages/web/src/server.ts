import { Hono } from "hono";
import { tracer } from "@vellum/trace";
import { createLogger, env } from "@vellum/shared";
import { createEngine, type Engine } from "./engine.ts";
import { vaultTools } from "./agent-tools.ts";

// Built SPA dir, resolved from this file (cwd-independent) so the server can be
// launched from the repo root (where .env loads) or from packages/web alike.
const DIST = new URL("../dist/", import.meta.url).pathname;

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

  app.get("/api/health", (c) => c.json({ ok: true }));

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

  // Devnet USDC faucet — fund a persona's wallet (10 USDC/claim).
  app.post("/api/personas/:id/faucet", async (c) => {
    const id = c.req.param("id");
    if (!engine.store.getPersona(id))
      return c.json({ error: "unknown persona" }, 404);
    const { address } = await engine.wallets.ensureWallet(id);
    return c.json(await engine.claimFaucet(address));
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
    // Deterministically bind this conversation to the chosen persona, then
    // dispatch. The agent reasons only over that persona's own memory.
    const trace = tracer.trace("chat", { personaId, conversationId });
    engine.orchestrator.resolve(conversationId, `/switch ${personaId}`);
    // Give the agent its persona-scoped vault tools (create/list/withdraw).
    const { tools, invoke } = vaultTools(engine, personaId);
    const res = await engine.orchestrator.handle(conversationId, message, {
      trace,
      tools,
      invoke,
    });
    trace.end();
    void tracer.flush();
    const costUsd = res.meters.reduce((n, m) => n + m.costUsd, 0);
    const tokens = res.meters.reduce((n, m) => n + m.totalTokens, 0);
    engine.ledger.recordAgentRun(
      personaId,
      `chat · ${message.slice(0, 60)}`,
      res.meters,
    );
    // Accrue memory (persona-scoped) so recall improves over the conversation.
    await engine.store.remember(personaId, `User said: ${message}`, {
      source: "chat",
    });
    return c.json({ reply: res.reply, personaId, costUsd, tokens });
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
