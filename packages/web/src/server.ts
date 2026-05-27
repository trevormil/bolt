import { Hono } from "hono";
import { createLogger, env } from "@vellum/shared";
import { createEngine, type Engine } from "./engine.ts";

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
    const id = body.id?.trim() || slug(name);
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
    const balance = await engine.wallets.balanceFor(id);
    return c.json({ address: wallet.address, balance });
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
    engine.orchestrator.resolve(conversationId, `/switch ${personaId}`);
    const res = await engine.orchestrator.handle(conversationId, message);
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

if (import.meta.main) {
  const engine = createEngine();
  const app = buildApp(engine);
  const port = env.WEB_PORT;
  log.info(`Vellum web · http://localhost:${port}`);
  Bun.serve({ port, fetch: app.fetch });
}
