import { join } from "node:path";
import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { confirmTx, generateWallet, addressOf } from "@vellum/chain";
import { tracer } from "@vellum/trace";
import {
  createLogger,
  env,
  setRuntimeEnv,
  upsertEnvFile,
  ensureDataDir,
  migrateLegacyDb,
} from "@vellum/shared";
import {
  createEngine,
  chat,
  grantDefaultCapabilities,
  CapabilityDeniedError,
  llmBudget,
  evaluateBudget,
  BudgetLimits,
  BudgetLimitsSchema,
  Model,
  APPROVED_MODELS,
  isApprovedModel,
  McpServers,
  McpServersSchema,
  type Engine,
} from "@vellum/engine";
import {
  VAULT_WITHDRAW_PROPOSAL_ID,
  type VaultGating,
  type GatingPeriod,
} from "@vellum/tokenization";
import { PaymentRequests } from "./payment-requests.ts";

// Built SPA dir, resolved from this file (cwd-independent) so the server can be
// launched from the repo root (where .env loads) or from packages/web alike.
const DIST = new URL("../dist/", import.meta.url).pathname;

const log = createLogger("web");

// Sum the µamount of `denom` credited TO `toAddress` by a tx's coin_received
// events. Used to verify a payment-request tx actually moved the requested funds
// to the persona — confirming the tx merely committed isn't enough (any
// confirmed hash could otherwise be replayed to fake a funding). Pure for tests.
export function creditedAmount(
  events: { type: string; attributes?: { key: string; value: string }[] }[],
  toAddress: string,
  denom: string,
): bigint {
  let total = 0n;
  for (const e of events) {
    if (e.type !== "coin_received") continue;
    let receiver: string | undefined;
    let amount: string | undefined;
    for (const a of e.attributes ?? []) {
      if (a.key === "receiver") receiver = a.value;
      else if (a.key === "amount") amount = a.value;
    }
    if (receiver !== toAddress || !amount) continue;
    // amount is comma-separated "<micro><denom>" entries.
    for (const part of amount.split(",")) {
      if (part.endsWith(denom)) {
        const num = part.slice(0, part.length - denom.length);
        if (/^[0-9]+$/.test(num)) total += BigInt(num);
      }
    }
  }
  return total;
}

// Fetch a committed tx and confirm it credited `toAddress` at least `minMicro`
// of `denom`.
async function verifyCredit(
  hash: string,
  toAddress: string,
  denom: string,
  minMicro: string,
): Promise<boolean> {
  const res = await fetch(
    `${env.BITBADGES_LCD}/cosmos/tx/v1beta1/txs/${hash}`,
    {
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (!res.ok) return false;
  const j = (await res.json()) as {
    tx_response?: {
      events?: {
        type: string;
        attributes?: { key: string; value: string }[];
      }[];
    };
  };
  return (
    creditedAmount(j.tx_response?.events ?? [], toAddress, denom) >=
    BigInt(minMicro)
  );
}

export const isLoopback = (host: string): boolean =>
  host === "127.0.0.1" || host === "localhost" || host === "::1";

const GATING_PERIODS: GatingPeriod[] = ["daily", "weekly", "monthly"];

// Validate a vault gating policy from request JSON (#45 slice 2). Returns the
// parsed policy, `undefined` (no gating), or "invalid". Pure — exported for tests.
export function parseGating(raw: unknown): VaultGating | undefined | "invalid" {
  if (raw == null) return undefined;
  if (typeof raw !== "object") return "invalid";
  const g = raw as { amount?: unknown; time?: unknown; multisig?: unknown };
  const out: VaultGating = {};
  if (g.amount != null) {
    const a = g.amount as { limitUsd?: unknown; period?: unknown };
    if (
      typeof a.limitUsd !== "number" ||
      !(a.limitUsd > 0) ||
      typeof a.period !== "string" ||
      !GATING_PERIODS.includes(a.period as GatingPeriod)
    )
      return "invalid";
    out.amount = { limitUsd: a.limitUsd, period: a.period as GatingPeriod };
  }
  if (g.time != null) {
    const t = g.time as { unlockAt?: unknown };
    if (t.unlockAt != null) {
      if (typeof t.unlockAt !== "number" || t.unlockAt < 0) return "invalid";
      // An empty time:{} is a no-op (not a policy) — see !43.
      out.time = { unlockAt: t.unlockAt };
    }
  }
  if (g.multisig != null) {
    const ms = g.multisig as {
      signers?: unknown;
      threshold?: unknown;
      challengeDelayMs?: unknown;
    };
    if (!Array.isArray(ms.signers) || ms.signers.length === 0) return "invalid";
    const signers: { address: string; weight?: number }[] = [];
    for (const s of ms.signers) {
      const so = s as { address?: unknown; weight?: unknown };
      if (typeof so.address !== "string" || !so.address.startsWith("bb1"))
        return "invalid";
      if (
        so.weight != null &&
        (typeof so.weight !== "number" || so.weight <= 0)
      )
        return "invalid";
      signers.push({
        address: so.address,
        weight: so.weight as number | undefined,
      });
    }
    if (typeof ms.threshold !== "number" || ms.threshold <= 0) return "invalid";
    // The threshold must be reachable: it can't exceed the total signer weight,
    // or the vault's withdrawal quorum could never be met (a vault you can never
    // withdraw from). !44 MEDIUM.
    const totalWeight = signers.reduce((n, s) => n + (s.weight ?? 1), 0);
    if (ms.threshold > totalWeight) return "invalid";
    if (
      ms.challengeDelayMs != null &&
      (typeof ms.challengeDelayMs !== "number" || ms.challengeDelayMs < 0)
    )
      return "invalid";
    out.multisig = {
      signers,
      threshold: ms.threshold,
      challengeDelayMs: ms.challengeDelayMs as number | undefined,
    };
  }
  return out.amount || out.time || out.multisig ? out : undefined;
}

// Routes safe to serve without auth: liveness, public chain config, and the
// share-link pay endpoints (a PaymentRequest link is opened by anyone the human
// shares it with; the confirm is safe because it verifies the on-chain credit).
export function isPublicRoute(method: string, path: string): boolean {
  if (path === "/api/health" || path === "/api/config") return true;
  // Setup status drives the onboarding screen before anything is configured.
  // No secrets — booleans + counts only, no local path material (#19/!48).
  if (method === "GET" && path === "/api/setup-status") return true;
  // First-run web onboarding (#54): reachable before any key/persona exists. The
  // route itself is loopback-gated + first-run-only — see POST /api/setup.
  if (method === "POST" && path === "/api/setup") return true;
  // Auth status + login/logout must be reachable to authenticate in the first place.
  if (method === "GET" && path === "/api/auth") return true;
  if (method === "POST" && (path === "/api/login" || path === "/api/logout"))
    return true;
  if (method === "GET" && /^\/api\/payment-requests\/[^/]+$/.test(path))
    return true;
  if (
    method === "POST" &&
    /^\/api\/payment-requests\/[^/]+\/confirm$/.test(path)
  )
    return true;
  // Vault sign-off info is public (collectionId + signers are on-chain) — the
  // third-party sign-off page (#45 slice 3) reads it without a persona session.
  if (method === "GET" && /^\/api\/vaults\/[^/]+\/signoff$/.test(path))
    return true;
  return false;
}

const SESSION_COOKIE = "vellum_session";

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
export function buildApp(
  engine: Engine,
  // Injectable so tests get an isolated store; prod shares the engine's sqlite
  // file (own table). Defaults to the configured DB path.
  paymentRequests = new PaymentRequests(env.VELLUM_DB_PATH),
  // Auth config (injectable for tests). Defaults to env.
  auth: { token?: string; host?: string } = {
    token: env.VELLUM_API_TOKEN,
    host: env.WEB_HOST,
  },
  // First-run setup side-effects (injectable for tests so /api/setup doesn't
  // write the real .env or mutate the global env singleton). Prod uses the
  // cwd .env Bun auto-loads + the live env mutation.
  setup: {
    envFilePath?: string;
    applyRuntime?: (partial: Partial<typeof env>) => void;
  } = {},
) {
  const app = new Hono();
  const setupEnvFilePath = setup.envFilePath ?? join(process.cwd(), ".env");
  const applyRuntimeEnv = setup.applyRuntime ?? setRuntimeEnv;

  // Security headers (#24 / T-11). Defense-in-depth even though the app binds
  // loopback by default: a malicious local page must not be able to frame the
  // installed PWA / localhost UI (clickjacking) or MIME-sniff responses. CSRF on
  // the cookie path is already handled by the SameSite=Strict session cookie.
  // We set frame-ancestors only (not a full CSP) so the Vite SPA's inline
  // styles aren't broken.
  app.use("*", async (c, next) => {
    await next();
    c.header("X-Frame-Options", "DENY");
    c.header("X-Content-Type-Options", "nosniff");
    c.header("Referrer-Policy", "no-referrer");
    c.header("Content-Security-Policy", "frame-ancestors 'none'");
  });

  // Auth boundary: protect every state-changing/private route. Public routes
  // (health, config, share-link pay endpoints) pass through. With a token set,
  // protected routes require `Authorization: Bearer <token>`. With NO token,
  // protected routes are open on loopback (local dev) but fail closed (401)
  // when bound beyond loopback — so an exposed server is never unauthenticated.
  const loopback = isLoopback(auth.host ?? "127.0.0.1");
  app.use("/api/*", async (c, next) => {
    if (isPublicRoute(c.req.method, c.req.path)) return next();

    // Cross-site + DNS-rebinding guard. A local app must not be drivable by a
    // web page the user happens to visit: on loopback the API is open (no
    // token), so a malicious site could otherwise fetch localhost and move
    // money. (a) Reject a Host header that isn't loopback while bound locally
    // (DNS-rebinding: attacker.com → 127.0.0.1). (b) Reject any cross-origin
    // browser request (CSRF). Same-origin SPA requests (Origin == Host) and
    // non-browser clients (curl/bearer, no Origin) pass.
    const host = c.req.header("host") ?? "";
    const hostname = host.split(":")[0];
    if (loopback && hostname && !isLoopback(hostname))
      return c.json({ error: "unexpected Host (possible DNS rebinding)" }, 403);
    const origin = c.req.header("origin");
    if (origin && origin !== `http://${host}` && origin !== `https://${host}`)
      return c.json({ error: "cross-origin request rejected" }, 403);

    if (auth.token) {
      // Accept a bearer header (API clients) OR the session cookie (browser SPA,
      // set by /api/login — httpOnly, so it's never exposed to page JS).
      const bearer = c.req.header("authorization") === `Bearer ${auth.token}`;
      const cookie = getCookie(c, SESSION_COOKIE) === auth.token;
      if (!bearer && !cookie) return c.json({ error: "unauthorized" }, 401);
      return next();
    }
    if (!loopback) {
      return c.json(
        {
          error:
            "API auth required — set VELLUM_API_TOKEN to expose beyond loopback",
        },
        401,
      );
    }
    return next();
  });

  app.get("/api/health", (c) => c.json({ ok: true }));

  // Session login for the browser SPA: exchange the API token for an httpOnly,
  // SameSite=Strict session cookie (CSRF-safe; not readable by page JS). When no
  // token is configured (loopback dev), auth is open so login is a no-op.
  app.post("/api/login", async (c) => {
    if (!auth.token) return c.json({ ok: true, authRequired: false });
    const body = (await c.req.json().catch(() => ({}))) as { token?: string };
    if (body.token !== auth.token)
      return c.json({ error: "invalid token" }, 401);
    setCookie(c, SESSION_COOKIE, auth.token, {
      httpOnly: true,
      sameSite: "Strict",
      secure: !loopback,
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    return c.json({ ok: true });
  });

  app.post("/api/logout", (c) => {
    deleteCookie(c, SESSION_COOKIE, { path: "/" });
    return c.json({ ok: true });
  });

  // Whether the API needs a login (so the SPA shows a prompt only when required).
  app.get("/api/auth", (c) =>
    c.json({
      authRequired: !!auth.token,
      authed:
        !auth.token ||
        getCookie(c, SESSION_COOKIE) === auth.token ||
        c.req.header("authorization") === `Bearer ${auth.token}`,
    }),
  );

  // Public chain config so the client can configure Keplr (0027) without baking
  // env into the bundle. No secrets — just the devnet endpoints + USDC denom.
  app.get("/api/config", (c) =>
    c.json({
      chainId: env.BITBADGES_CHAIN_ID,
      rpc: env.BITBADGES_RPC,
      lcd: env.BITBADGES_LCD,
      denom: env.VELLUM_DENOM,
      // Approved per-persona models (#43) so the Settings UI can offer a vetted
      // dropdown instead of a free-text field.
      models: APPROVED_MODELS,
    }),
  );

  // Onboarding setup status (#19) — what's configured, so the web onboarding
  // (SetupFlow) knows whether to show the first-run flow. Booleans/counts ONLY:
  // never the key/mnemonic values, and never the local data-dir path
  // (unauthenticated route — no local filesystem disclosure; !48 review).
  app.get("/api/setup-status", (c) =>
    c.json({
      hasLlmKey: !!(
        env.OPENROUTER_API_KEY ||
        env.ANTHROPIC_API_KEY ||
        env.OPENAI_API_KEY
      ),
      hasWallet: !!env.AGENT_SIGNER_MNEMONIC,
      personaCount: engine.store.listPersonas().length,
      daemonExposed: !isLoopback(env.WEB_HOST),
    }),
  );

  // First-run web onboarding (#54): persist the LLM key + agent wallet, and make
  // the ALREADY-RUNNING daemon adopt them (no restart) so the next step (persona
  // creation) works immediately. Loopback-only + first-run-only — secrets are
  // never accepted over an exposed/network boundary, and never re-written once a
  // wallet exists. The wallet can be generated server-side (the mnemonic is
  // returned ONCE to back up — it never travels TO the server).
  app.post("/api/setup", async (c) => {
    if (!isLoopback(auth.host ?? "127.0.0.1"))
      return c.json(
        {
          error:
            "setup is loopback-only; configure secrets via the CLI when exposed",
        },
        403,
      );
    if (env.AGENT_SIGNER_MNEMONIC)
      return c.json({ error: "already set up" }, 409);

    const body = (await c.req.json().catch(() => ({}))) as {
      openRouterKey?: unknown;
      mnemonic?: unknown;
      apiToken?: unknown;
    };

    // Generate a fresh wallet unless the user imported one.
    let generatedMnemonic: string | null = null;
    let mnemonic: string;
    if (typeof body.mnemonic === "string" && body.mnemonic.trim()) {
      mnemonic = body.mnemonic.trim();
      try {
        await addressOf(mnemonic); // validate the phrase
      } catch {
        return c.json({ error: "invalid mnemonic" }, 400);
      }
    } else {
      const w = await generateWallet();
      mnemonic = w.mnemonic;
      generatedMnemonic = w.mnemonic;
    }

    const updates: Record<string, string> = { AGENT_SIGNER_MNEMONIC: mnemonic };
    const runtime: Partial<typeof env> = { AGENT_SIGNER_MNEMONIC: mnemonic };
    if (typeof body.openRouterKey === "string" && body.openRouterKey.trim()) {
      updates.OPENROUTER_API_KEY = body.openRouterKey.trim();
      runtime.OPENROUTER_API_KEY = body.openRouterKey.trim();
    }
    if (typeof body.apiToken === "string" && body.apiToken.trim()) {
      updates.VELLUM_API_TOKEN = body.apiToken.trim();
      runtime.VELLUM_API_TOKEN = body.apiToken.trim();
    }

    upsertEnvFile(setupEnvFilePath, updates); // persist for next boot
    applyRuntimeEnv(runtime); // live daemon adopts it now (no restart)
    engine.wallets.setMnemonic(mnemonic);

    log.info(
      "web setup complete · wallet configured" +
        (updates.OPENROUTER_API_KEY ? " + LLM key" : ""),
    );
    return c.json({ ok: true, generatedMnemonic });
  });

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
    grantDefaultCapabilities(engine.capabilities, id); // #37 baseline policy
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

  // Devnet USDC faucet — fund a persona's wallet (10 USDC/claim). No free-form
  // cap: the discretionary balance is unconstrained; spending limits live only
  // in vaults (on-chain rules).
  app.post("/api/personas/:id/faucet", async (c) => {
    const id = c.req.param("id");
    if (!engine.store.getPersona(id))
      return c.json({ error: "unknown persona" }, 404);
    const { address } = await engine.wallets.ensureWallet(id);
    return c.json(await engine.claimFaucet(address));
  });

  // LLM-spend budget for a persona (0009 — OpenRouter-tracked cost guardrail).
  // There is no free-form USDC cap; USDC spending limits live only in vaults.
  // Per-persona observability (#42): structured event timeline + window
  // aggregates for the dashboard. Distinct from the dev-side trace layer.
  app.get("/api/personas/:id/events", (c) => {
    const id = c.req.param("id");
    if (!engine.store.getPersona(id))
      return c.json({ error: "unknown persona" }, 404);
    const limit = Math.min(
      500,
      Math.max(1, Number(c.req.query("limit")) || 100),
    );
    return c.json({
      summary: engine.events.summary(id),
      events: engine.events.recent(id, limit),
    });
  });

  app.get("/api/personas/:id/budget", (c) => {
    const id = c.req.param("id");
    if (!engine.store.getPersona(id))
      return c.json({ error: "unknown persona" }, 404);
    // `llm` is the legacy rolling-24h shape (existing readers). `evaluation` is
    // the #44 per-window evaluation (daily/weekly/monthly), used by the UI.
    return c.json({
      llm: llmBudget(engine.ledger, id),
      evaluation: evaluateBudget(engine, id),
      limits: BudgetLimits.get(engine.settings, id),
    });
  });

  // Per-persona LLM-cost budget limits (#44). PUT body is a strict subset of
  // { dailyUsd, weeklyUsd, monthlyUsd } — omit a key to leave it unset (no cap
  // for that window). PUT {} clears all overrides (resets to inherit/default).
  app.put("/api/personas/:id/budget-limits", async (c) => {
    const id = c.req.param("id");
    if (!engine.store.getPersona(id))
      return c.json({ error: "unknown persona" }, 404);
    const body = (await c.req.json().catch(() => ({}))) as unknown;
    const parsed = BudgetLimitsSchema.safeParse(body);
    if (!parsed.success)
      return c.json(
        { error: "invalid limits", issues: parsed.error.issues },
        400,
      );
    if (Object.keys(parsed.data).length === 0) {
      BudgetLimits.reset(engine.settings, id);
    } else {
      BudgetLimits.setPersona(engine.settings, id, parsed.data);
    }
    return c.json(BudgetLimits.get(engine.settings, id));
  });

  // Scheduled tasks (#36) over HTTP so the SPA can manage them (they were
  // agent-tool-only). create is capability-gated ("schedule"); armed=false
  // means the run is read-only (#24/T-13) — can't move money.
  app.get("/api/personas/:id/tasks", (c) => {
    const id = c.req.param("id");
    if (!engine.store.getPersona(id))
      return c.json({ error: "unknown persona" }, 404);
    return c.json({ tasks: engine.tasks.list(id) });
  });
  app.post("/api/personas/:id/tasks", async (c) => {
    const id = c.req.param("id");
    if (!engine.store.getPersona(id))
      return c.json({ error: "unknown persona" }, 404);
    const body = (await c.req.json().catch(() => ({}))) as {
      prompt?: string;
      everyMinutes?: number;
      armed?: boolean;
    };
    const prompt = body.prompt?.trim();
    const everyMinutes = Number(body.everyMinutes);
    if (!prompt || !(everyMinutes > 0))
      return c.json({ error: "prompt and everyMinutes > 0 required" }, 400);
    if (
      !(await engine.authorizer.authorize(id, {
        capability: "schedule",
        summary: `schedule every ${everyMinutes}m: ${prompt.slice(0, 60)}`,
      }))
    )
      return c.json({ error: "denied: persona lacks 'schedule'" }, 403);
    const t = engine.tasks.create({
      personaId: id,
      prompt,
      intervalMs: Math.round(everyMinutes * 60_000),
      armed: body.armed === true,
    });
    return c.json(t, 201);
  });
  app.delete("/api/personas/:id/tasks/:taskId", (c) => {
    const id = c.req.param("id");
    if (!engine.store.getPersona(id))
      return c.json({ error: "unknown persona" }, 404);
    const t = engine.tasks.get(c.req.param("taskId"));
    if (!t || t.personaId !== id) return c.json({ error: "unknown task" }, 404);
    engine.tasks.delete(t.id);
    return c.json({ ok: true });
  });

  // Per-persona OpenRouter model override (#43). GET returns {value, source};
  // PUT body { model: string | null } — null clears the override (inherit).
  app.get("/api/personas/:id/model", (c) => {
    const id = c.req.param("id");
    if (!engine.store.getPersona(id))
      return c.json({ error: "unknown persona" }, 404);
    return c.json(Model.get(engine.settings, id));
  });
  app.put("/api/personas/:id/model", async (c) => {
    const id = c.req.param("id");
    if (!engine.store.getPersona(id))
      return c.json({ error: "unknown persona" }, 404);
    const body = (await c.req.json().catch(() => ({}))) as { model?: unknown };
    if (body.model === null) {
      Model.reset(engine.settings, id);
      return c.json(Model.get(engine.settings, id));
    }
    if (typeof body.model !== "string" || body.model.trim() === "")
      return c.json(
        { error: "model must be a non-empty OpenRouter model id, or null" },
        400,
      );
    const model = body.model.trim();
    // Enforce the approved-models allowlist (#43): a persona can only be pinned
    // to a vetted model, not an arbitrary OpenRouter id.
    if (!isApprovedModel(model))
      return c.json(
        { error: "model not in the approved list", approved: APPROVED_MODELS },
        400,
      );
    Model.setPersona(engine.settings, id, model);
    return c.json(Model.get(engine.settings, id));
  });

  // Per-persona MCP server config (#46). GET returns {value, source}; PUT body
  // { servers: McpServerConfig[] | null } — null clears the override (inherit
  // the global set). Connections are (re)established lazily on the persona's next
  // chat turn, so a config change takes effect without a daemon restart; the old
  // pooled connection is harmless and reused if the entry is unchanged.
  app.get("/api/personas/:id/mcp-servers", (c) => {
    const id = c.req.param("id");
    if (!engine.store.getPersona(id))
      return c.json({ error: "unknown persona" }, 404);
    return c.json(McpServers.get(engine.settings, id));
  });
  app.put("/api/personas/:id/mcp-servers", async (c) => {
    const id = c.req.param("id");
    if (!engine.store.getPersona(id))
      return c.json({ error: "unknown persona" }, 404);
    const body = (await c.req.json().catch(() => ({}))) as {
      servers?: unknown;
    };
    if (body.servers === null) {
      McpServers.reset(engine.settings, id);
      return c.json(McpServers.get(engine.settings, id));
    }
    const parsed = McpServersSchema.safeParse(body.servers);
    if (!parsed.success)
      return c.json(
        { error: "invalid MCP server config", detail: parsed.error.message },
        400,
      );
    McpServers.setPersona(engine.settings, id, parsed.data);
    return c.json(McpServers.get(engine.settings, id));
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
    // Spend is gated at the TxManager chokepoint (#37) — a direct call can't
    // bypass it. Catch the denial here → 403.
    const trace = tracer.trace("spend", { personaId: id });
    try {
      const pending = await engine.txManager.spend({
        personaId: id,
        to,
        amount,
        trace,
      });
      trace.end();
      void tracer.flush();
      return c.json(pending);
    } catch (e) {
      trace.end();
      void tracer.flush();
      if (e instanceof CapabilityDeniedError)
        return c.json({ error: e.message }, 403);
      throw e;
    }
  });

  // Vaults — agent creates (human is manager); list; agent withdraws within rules.
  app.get("/api/personas/:id/vaults", (c) => {
    const id = c.req.param("id");
    if (!engine.store.getPersona(id))
      return c.json({ error: "unknown persona" }, 404);
    return c.json({ vaults: engine.vaults.list(id) });
  });

  // Escrow tracking (#45, ADR-0003): the locked backing balance for a vault —
  // read-only truth from chain, distinct from the agent's wallet balance.
  app.get("/api/personas/:id/vaults/:collectionId/escrow", async (c) => {
    const id = c.req.param("id");
    if (!engine.store.getPersona(id))
      return c.json({ error: "unknown persona" }, 404);
    try {
      return c.json(
        await engine.vaults.escrow(id, c.req.param("collectionId")),
      );
    } catch (e) {
      return c.json(
        { error: e instanceof Error ? e.message : "escrow lookup failed" },
        404,
      );
    }
  });

  // PUBLIC sign-off info for a multisig vault (#45 slice 3) — what the
  // third-party /vote page needs to build a MsgCastVote. No persona session;
  // collectionId + signers are on-chain/public. 404 unless the vault is multisig.
  app.get("/api/vaults/:collectionId/signoff", (c) => {
    const v = engine.vaults.getByCollection(c.req.param("collectionId"));
    if (!v || !v.gating?.multisig)
      return c.json({ error: "no multisig vault for this id" }, 404);
    return c.json({
      collectionId: v.collectionId,
      name: v.name,
      symbol: v.symbol,
      approvalId: v.withdrawApprovalId,
      proposalId: VAULT_WITHDRAW_PROPOSAL_ID,
      threshold: v.gating.multisig.threshold,
      signers: v.gating.multisig.signers,
    });
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
      gating?: VaultGating;
    };
    if (!body.name?.trim() || !body.symbol?.trim()) {
      return c.json({ error: "name and symbol are required" }, 400);
    }
    const gating = parseGating(body.gating);
    if (gating === "invalid")
      return c.json({ error: "invalid gating policy" }, 400);
    try {
      const vault = await engine.vaults.create(id, {
        name: body.name.trim(),
        symbol: body.symbol.trim(),
        description: body.description?.trim(),
        dailyWithdrawLimit: body.dailyWithdrawLimit,
        gating,
      });
      return c.json(vault, 201);
    } catch (e) {
      if (e instanceof CapabilityDeniedError)
        return c.json({ error: e.message }, 403);
      throw e;
    }
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
    const collectionId = c.req.param("collectionId");
    try {
      return c.json(await engine.vaults.withdraw(id, collectionId, amount));
    } catch (e) {
      if (e instanceof CapabilityDeniedError)
        return c.json({ error: e.message }, 403);
      throw e;
    }
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

  // The human signed + broadcast client-side (inline in the app, or via the
  // /pay link); this verifies the tx committed on chain (truth from chain, not
  // the client's word), records the funding in the ledger, then deletes the
  // request — the ledger is the permanent trail, so filled requests aren't kept.
  app.post("/api/payment-requests/:reqId/confirm", async (c) => {
    const r = paymentRequests.get(c.req.param("reqId"));
    // Already filled (or never existed) — the funding, if any, is in the ledger.
    if (!r) return c.json({ error: "unknown or already-filled request" }, 404);
    const body = (await c.req.json().catch(() => ({}))) as { txHash?: string };
    const txHash = body.txHash?.trim();
    if (!txHash) return c.json({ error: "txHash is required" }, 400);
    try {
      await confirmTx(txHash); // throws on revert / not-yet-committed
      // Verify the tx actually credited THIS persona the requested amount —
      // not just that some tx with this hash committed. Without this, any
      // confirmed hash could be replayed to fabricate a funding entry.
      const ok = await verifyCredit(txHash, r.toAddress, r.denom, r.amount);
      if (!ok) {
        return c.json(
          {
            error:
              "tx did not transfer the requested amount of USDC to this persona",
          },
          400,
        );
      }
    } catch (e) {
      return c.json(
        { error: e instanceof Error ? e.message : "tx not confirmed" },
        400,
      );
    }
    // recordOnchain is idempotent on txHash. `created: false` means this tx was
    // ALREADY recorded as a funding — i.e. someone is trying to reuse one tx to
    // confirm a second request. Reject it (don't delete this request / fake a
    // fill) so one on-chain transfer can fund exactly one request.
    const { created } = engine.ledger.recordOnchain({
      personaId: r.personaId,
      kind: "funding",
      summary: `funded ${(Number(r.amount) / 1e6).toFixed(2)} USDC via payment request`,
      authority: "human",
      txHash,
      meta: { paymentRequestId: r.id, amount: r.amount, denom: r.denom },
    });
    if (!created)
      return c.json(
        { error: "this tx has already funded a request — one tx per request" },
        409,
      );
    paymentRequests.delete(r.id);
    return c.json({ ok: true, txHash, amount: r.amount });
  });

  // Dismiss a pending request without paying it (full UX for outstanding ones).
  app.delete("/api/payment-requests/:reqId", (c) => {
    const r = paymentRequests.get(c.req.param("reqId"));
    if (!r) return c.json({ error: "unknown payment request" }, 404);
    paymentRequests.delete(r.id);
    return c.json({ ok: true });
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
  // routing). Content-Type MUST be set explicitly: Bun.file's auto-inferred
  // type is dropped once the response passes through Hono + the security-headers
  // middleware, and with `X-Content-Type-Options: nosniff` (#24/T-11) the
  // browser then refuses to execute the typeless module script — a blank page.
  // Setting it from the file's inferred MIME keeps assets executable + nosniff-safe.
  app.get("/*", async (c) => {
    const rel =
      c.req.path === "/" ? "index.html" : c.req.path.replace(/^\/+/, "");
    let file = Bun.file(DIST + rel);
    if (!(await file.exists())) file = Bun.file(DIST + "index.html");
    if (!(await file.exists())) {
      return c.text("build the SPA first: bun run build", 404);
    }
    const type = file.type || "application/octet-stream";
    return new Response(file, { headers: { "content-type": type } });
  });

  return app;
}

// Bun.serve options. Binds loopback by default; exposing beyond localhost
// (WEB_HOST=0.0.0.0) requires VELLUM_API_TOKEN (enforced at startup). Exported
// for testability.
export function webServeOptions(app: ReturnType<typeof buildApp>) {
  return { port: env.WEB_PORT, hostname: env.WEB_HOST, fetch: app.fetch };
}

if (import.meta.main) {
  // Filesystem-first (#39): ensure ~/.vellum exists + migrate a legacy ./vellum.db.
  ensureDataDir();
  if (migrateLegacyDb(env.VELLUM_DB_PATH))
    log.info("migrated legacy ./vellum.db → " + env.VELLUM_DB_PATH);
  const engine = createEngine();
  // Reconcile any PENDING txs against the chain BEFORE serving new work (§13.5).
  await engine.txManager
    .reconcile()
    .catch((e) => log.warn(`reconcile failed: ${e}`));
  const app = buildApp(engine);
  const opts = webServeOptions(app);
  if (!isLoopback(env.WEB_HOST) && !env.VELLUM_API_TOKEN) {
    // Fail closed: don't serve privileged routes unauthenticated on a public bind.
    log.error(
      `refusing to bind ${env.WEB_HOST} without VELLUM_API_TOKEN — set a token to expose the API`,
    );
    process.exit(1);
  }
  log.info(`Bolt web · http://${opts.hostname}:${opts.port}`);
  Bun.serve(opts);
}
