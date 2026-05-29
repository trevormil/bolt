import { join } from "node:path";
import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { confirmTx, generateWallet, getVotes } from "@vellum/chain";
import { verifyOpenRouterKey } from "@vellum/llm";
import { tracer } from "@vellum/trace";
import {
  createLogger,
  env,
  setRuntimeEnv,
  upsertEnvFile,
  ensureDataDir,
  migrateLegacyDb,
  verifyTelegramToken,
  getAgentMnemonic,
  setAgentMnemonic,
  defaultBackend,
  type SecretBackend,
} from "@vellum/shared";
import {
  createEngine,
  chat,
  grantDefaultCapabilities,
  DEFAULT_PERSONA_INSTRUCTIONS,
  CapabilityDeniedError,
  voteTally,
  llmBudget,
  evaluateBudget,
  mergeObservability,
  latencyByKind,
  projectMonthlySpend,
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
import {
  isBb1Address,
  isPositiveMicroAmount,
  TxRejectedError,
} from "@vellum/tx";

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
    const t = g.time as { unlockAt?: unknown; expiresAt?: unknown };
    const time: { unlockAt?: number; expiresAt?: number } = {};
    if (t.unlockAt != null) {
      if (typeof t.unlockAt !== "number" || t.unlockAt < 0) return "invalid";
      time.unlockAt = t.unlockAt;
    }
    if (t.expiresAt != null) {
      if (typeof t.expiresAt !== "number" || t.expiresAt < 0) return "invalid";
      time.expiresAt = t.expiresAt;
    }
    // A window that ends at/before it starts can never be withdrawn from.
    if (
      time.unlockAt != null &&
      time.expiresAt != null &&
      time.expiresAt <= time.unlockAt
    )
      return "invalid";
    // An empty time:{} is a no-op (not a policy) — see !43.
    if (time.unlockAt != null || time.expiresAt != null) out.time = time;
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
      if (typeof so.address !== "string" || !isBb1Address(so.address))
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
  // NOTE: POST /api/setup is deliberately NOT public. It persists a wallet
  // mnemonic, so it must stay behind the Host/Origin cross-site guard below
  // (else a page the user visits could POST localhost on a fresh install and
  // plant an attacker mnemonic — !51 HIGH). The auth middleware already lets it
  // through on loopback without a token (the first-run dev path), and the route
  // itself is additionally loopback-only + first-run-only.
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
  // Vault deposit-request share link (#62): the /deposit/:id page is opened by
  // anyone the funder shares it with, so READING the request is public (like the
  // pay link). There is deliberately NO public confirm/delete — unlike the
  // payment-request confirm (which verifies the on-chain credit), a deposit has
  // nothing to verify, so an unauthenticated delete would just be a griefing
  // vector. The persona owner dismisses the request (authed) once it's funded.
  if (method === "GET" && /^\/api\/deposit-requests\/[^/]+$/.test(path))
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
  // Injectable so tests get an isolated store; defaults to the engine's shared
  // instances (#67) so web routes and the agent's request_* tools mint links
  // against the same DB.
  paymentRequests = engine.paymentRequests,
  // Vault deposit requests (#62) — parallel to paymentRequests, own table.
  depositRequests = engine.depositRequests,
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
    // Built-SPA directory (injectable so the cache-header behavior is testable
    // against a fixture, not whatever dist a dev checkout happens to have).
    distDir?: string;
    // OpenRouter key health-check (#60), injectable so tests run offline.
    verifyKey?: (key: string) => Promise<boolean>;
    // Telegram bot-token health-check (#63, getMe) — injectable for offline tests.
    verifyTelegram?: (
      token: string,
    ) => Promise<{ ok: boolean; username?: string }>;
    // Hot-attach hook (#74): the daemon hands its TelegramController so a token
    // set via /api/setup or Settings connects the poller live — no restart. Web
    // stays decoupled from the telegram package via this duck-typed interface;
    // absent in tests/CLI that don't run a poller.
    telegram?: {
      attach(token: string): Promise<void>;
      detach(): Promise<void>;
    };
    // OS secret store for the agent master seed (ADR-0007), injectable so tests
    // never touch the real keychain. Defaults to the platform backend.
    secretBackend?: SecretBackend;
  } = {},
) {
  const app = new Hono();
  const setupEnvFilePath = setup.envFilePath ?? join(process.cwd(), ".env");
  const applyRuntimeEnv = setup.applyRuntime ?? setRuntimeEnv;
  const secretBackend = setup.secretBackend ?? defaultBackend();
  const distDir = setup.distDir ?? DIST;
  const verifyKey = setup.verifyKey ?? verifyOpenRouterKey;
  const verifyTelegram = setup.verifyTelegram ?? verifyTelegramToken;

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
  app.get("/api/setup-status", async (c) =>
    c.json({
      hasLlmKey: !!(
        env.OPENROUTER_API_KEY ||
        env.ANTHROPIC_API_KEY ||
        env.OPENAI_API_KEY
      ),
      hasWallet: !!(await getAgentMnemonic(secretBackend)),
      personaCount: engine.store.listPersonas().length,
      daemonExposed: !isLoopback(env.WEB_HOST),
      telegramConfigured: !!env.TELEGRAM_BOT_TOKEN,
    }),
  );

  // First-run web onboarding (#54): persist the LLM key + agent wallet, and make
  // the ALREADY-RUNNING daemon adopt them (no restart) so the next step (persona
  // creation) works immediately. Loopback-only + first-run-only — secrets are
  // never accepted over an exposed/network boundary, and never re-written once a
  // wallet exists. The wallet can be generated server-side; the phrase is the
  // AGENT's key and is NEVER returned to the browser (the user reveals it on
  // demand from Settings → Export, #57). It also never travels TO the server.
  app.post("/api/setup", async (c) => {
    if (!isLoopback(auth.host ?? "127.0.0.1"))
      return c.json(
        {
          error:
            "setup is loopback-only; configure secrets via the CLI when exposed",
        },
        403,
      );
    if (await getAgentMnemonic(secretBackend))
      return c.json({ error: "already set up" }, 409);

    const body = (await c.req.json().catch(() => ({}))) as {
      openRouterKey?: unknown;
      apiToken?: unknown;
      telegramBotToken?: unknown;
      telegramPrincipalChatId?: unknown;
    };

    // The LLM key is REQUIRED + health-checked (#60) — block an empty or invalid
    // key here, BEFORE generating the wallet / writing .env, so a bad key leaves
    // nothing persisted.
    const openRouterKey =
      typeof body.openRouterKey === "string" ? body.openRouterKey.trim() : "";
    if (!openRouterKey)
      return c.json({ error: "an OpenRouter API key is required" }, 400);
    if (!(await verifyKey(openRouterKey)))
      return c.json(
        { error: "that OpenRouter key didn't validate — check it and retry" },
        400,
      );

    // Telegram remote control (#49) — OPTIONAL. Parse + validate the principal
    // chat id BEFORE generating the wallet or writing .env (#65 review): a typo
    // like "abc" would otherwise persist TELEGRAM_PRINCIPAL_CHAT_ID, and the
    // next-boot zod env coercion (Number(...)) turns it into NaN and fails
    // startup — an optional onboarding field must never become a boot blocker.
    // Telegram chat ids may be negative (group chats), so allow a leading "-".
    const tgToken =
      typeof body.telegramBotToken === "string"
        ? body.telegramBotToken.trim()
        : "";
    const tgChat =
      typeof body.telegramPrincipalChatId === "string"
        ? body.telegramPrincipalChatId.trim()
        : "";
    if (tgChat && !/^-?[0-9]+$/.test(tgChat))
      return c.json({ error: "Telegram chat id must be an integer" }, 400);

    // Agent wallets are ALWAYS generated fresh (#59) — no import. The phrase
    // is the agent's key; it never enters the app from the user side.
    const mnemonic = (await generateWallet()).mnemonic;

    // The master seed goes to the OS keychain (ADR-0007), never plaintext .env;
    // only the non-seed secrets persist to the env file. The seed is adopted into
    // the running daemon below via wallets.setMnemonic (no env round-trip).
    const updates: Record<string, string> = {
      OPENROUTER_API_KEY: openRouterKey,
    };
    const runtime: Partial<typeof env> = {
      OPENROUTER_API_KEY: openRouterKey,
    };
    if (typeof body.apiToken === "string" && body.apiToken.trim()) {
      updates.VELLUM_API_TOKEN = body.apiToken.trim();
      runtime.VELLUM_API_TOKEN = body.apiToken.trim();
    }
    // Telegram remote control (#49) — OPTIONAL. Telegram is the agent's remote
    // entrypoint (the bot polls OUT, so no daemon exposure is needed). Persisted
    // + adopted into runtime env; the long-poller is attached on the next daemon
    // start (attachTelegram reads env at boot — it isn't hot-attached here). The
    // chat id was already validated as an integer above, before any persistence;
    // the token is getMe-validated below (#63) before anything is persisted.
    let tgUsername: string | undefined;
    if (tgToken) {
      // Health-check the token via getMe (#63) before persisting — a bad token
      // would otherwise fail silently at the next daemon boot. Nothing is
      // persisted yet (the wallet is in-memory), so a 400 here leaves no state.
      const tg = await verifyTelegram(tgToken);
      if (!tg.ok)
        return c.json(
          {
            error:
              "that Telegram bot token didn't validate — create one with @BotFather and retry",
          },
          400,
        );
      tgUsername = tg.username;
      updates.TELEGRAM_BOT_TOKEN = tgToken;
      runtime.TELEGRAM_BOT_TOKEN = tgToken;
      if (tgChat) {
        updates.TELEGRAM_PRINCIPAL_CHAT_ID = tgChat;
        runtime.TELEGRAM_PRINCIPAL_CHAT_ID = Number(tgChat);
      }
    }

    // Store the master seed in the OS keychain (after all validation, so a bad
    // Telegram token above leaves no persisted state). Then the non-seed secrets.
    await setAgentMnemonic(mnemonic, secretBackend);
    upsertEnvFile(setupEnvFilePath, updates); // persist for next boot
    applyRuntimeEnv(runtime); // live daemon adopts it now (no restart)
    engine.wallets.setMnemonic(mnemonic);

    // Hot-attach the long-poller so the bot connects immediately (#74) — no
    // daemon restart. Best-effort: the token already getMe-validated above, so
    // a failure here is a poller hiccup, not a bad credential; persistence holds
    // so the next boot still picks it up.
    if (tgToken)
      await setup.telegram
        ?.attach(tgToken)
        .catch((e) => log.warn(`telegram hot-attach failed: ${e}`));

    log.info(
      `web setup complete · wallet + LLM key configured${tgToken ? ` + telegram @${tgUsername ?? "?"} (connected)` : ""}`,
    );
    return c.json({
      ok: true,
      telegramEnabled: !!tgToken,
      telegramUsername: tgUsername,
    });
  });

  // Set / change / reset the OpenRouter key after onboarding (#60). Same trust
  // boundary as /api/setup (loopback-only, behind the Host/Origin guard) but NOT
  // first-run-gated — the key is health-checked before it's persisted + adopted.
  app.post("/api/settings/openrouter-key", async (c) => {
    if (!isLoopback(auth.host ?? "127.0.0.1"))
      return c.json({ error: "key changes are loopback-only" }, 403);
    const body = (await c.req.json().catch(() => ({}))) as { key?: unknown };
    const key = typeof body.key === "string" ? body.key.trim() : "";
    if (!key)
      return c.json({ error: "an OpenRouter API key is required" }, 400);
    if (!(await verifyKey(key)))
      return c.json(
        { error: "that OpenRouter key didn't validate — check it and retry" },
        400,
      );
    upsertEnvFile(setupEnvFilePath, { OPENROUTER_API_KEY: key });
    applyRuntimeEnv({ OPENROUTER_API_KEY: key });
    log.info("openrouter key updated · settings");
    return c.json({ ok: true });
  });

  // Set / rotate / clear the Telegram bot token after onboarding (#63). Same
  // loopback-only boundary as the OpenRouter key route; the token is health-
  // checked via getMe before it's persisted + adopted. An empty token clears
  // Telegram. Hot-attaches the poller so the change takes effect immediately
  // (#74) — set connects the bot, clear stops it, no daemon restart.
  app.post("/api/settings/telegram", async (c) => {
    if (!isLoopback(auth.host ?? "127.0.0.1"))
      return c.json({ error: "telegram changes are loopback-only" }, 403);
    const body = (await c.req.json().catch(() => ({}))) as {
      token?: unknown;
      principalChatId?: unknown;
    };
    const token = typeof body.token === "string" ? body.token.trim() : "";
    const chat =
      typeof body.principalChatId === "string"
        ? body.principalChatId.trim()
        : "";
    if (chat && !/^-?[0-9]+$/.test(chat))
      return c.json({ error: "Telegram chat id must be an integer" }, 400);

    if (!token) {
      // Empty token → disable Telegram + stop the poller. Clear the principal
      // chat id too (!67 review): a stale id left behind would re-pin the NEXT
      // bot to the old chat instead of letting TOFU /start re-claim ownership.
      upsertEnvFile(setupEnvFilePath, {
        TELEGRAM_BOT_TOKEN: "",
        TELEGRAM_PRINCIPAL_CHAT_ID: "",
      });
      applyRuntimeEnv({
        TELEGRAM_BOT_TOKEN: undefined,
        TELEGRAM_PRINCIPAL_CHAT_ID: undefined,
      });
      await setup.telegram
        ?.detach()
        .catch((e) => log.warn(`telegram detach failed: ${e}`));
      log.info("telegram disabled · settings");
      return c.json({ ok: true, configured: false });
    }

    const tg = await verifyTelegram(token);
    if (!tg.ok)
      return c.json(
        {
          error:
            "that Telegram bot token didn't validate — create one with @BotFather and retry",
        },
        400,
      );
    const updates: Record<string, string> = { TELEGRAM_BOT_TOKEN: token };
    const runtime: Partial<typeof env> = { TELEGRAM_BOT_TOKEN: token };
    if (chat) {
      updates.TELEGRAM_PRINCIPAL_CHAT_ID = chat;
      runtime.TELEGRAM_PRINCIPAL_CHAT_ID = Number(chat);
    } else {
      // No chat id given → drop any previous principal so the new bot isn't
      // pinned to a stale chat (!67 review). Blank = first /start claims it
      // (TOFU), matching what the UI promises.
      updates.TELEGRAM_PRINCIPAL_CHAT_ID = "";
      runtime.TELEGRAM_PRINCIPAL_CHAT_ID = undefined;
    }
    upsertEnvFile(setupEnvFilePath, updates);
    applyRuntimeEnv(runtime);
    // Hot-attach so the bot reconnects with the new token immediately (#74).
    await setup.telegram
      ?.attach(token)
      .catch((e) => log.warn(`telegram hot-attach failed: ${e}`));
    log.info(`telegram token updated · settings · @${tg.username ?? "?"}`);
    return c.json({ ok: true, configured: true, username: tg.username });
  });

  // Reveal the agent's master mnemonic for backup/recovery (#57). The onboarding
  // never shows it (it's the agent's key); the user exports it here deliberately
  // (Settings → Export). Same trust boundary as POST /api/setup: NOT public, so it
  // stays behind the Host/Origin guard + token auth, and the route itself is
  // additionally loopback-only — the phrase never crosses a network boundary.
  app.get("/api/agent/mnemonic", async (c) => {
    if (!isLoopback(auth.host ?? "127.0.0.1"))
      return c.json({ error: "seed export is loopback-only" }, 403);
    const mnemonic = await getAgentMnemonic(secretBackend);
    if (!mnemonic) return c.json({ error: "no agent wallet configured" }, 404);
    return c.json({ mnemonic });
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
      instructions?: string;
      soul?: { name: string; role: string; voice: string; values?: string[] };
    };
    const name = (body.name ?? "").trim();
    if (!name) return c.json({ error: "name is required" }, 400);
    const instructions =
      typeof body.instructions === "string" ? body.instructions.trim() : "";
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
    // Go all-in on PERSONA.md (#91): every new persona gets an instructions doc —
    // the supplied one, or the default template when blank — instead of falling
    // back to role/voice. Legacy role/voice are accepted (back-compat) but
    // superseded by instructions at render time (renderSoul).
    const soul = body.soul ?? {
      name,
      role: body.role?.trim() || "",
      voice: body.voice?.trim() || "",
      instructions: instructions || DEFAULT_PERSONA_INSTRUCTIONS,
    };
    const persona = engine.store.createPersona(id, name, soul);
    const wallet = await engine.wallets.ensureWallet(id);
    grantDefaultCapabilities(engine.capabilities, id); // #37 baseline policy
    return c.json({ persona, address: wallet.address }, 201);
  });

  // Update a persona's PERSONA.md instructions (#87) — the freeform doc appended
  // to every request. Empty string clears it (reverts to legacy role/voice).
  app.patch("/api/personas/:id", async (c) => {
    const id = c.req.param("id");
    const body = (await c.req.json().catch(() => ({}))) as {
      instructions?: unknown;
    };
    if (typeof body.instructions !== "string")
      return c.json({ error: "instructions (string) is required" }, 400);
    const persona = engine.store.updateInstructions(id, body.instructions);
    if (!persona) return c.json({ error: "unknown persona" }, 404);
    return c.json({ persona });
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

  // Unified observability feed (#95): one timeline merging the operational event
  // store (latency / errors / kind) with the proof-of-action ledger (authority +
  // on-chain txHash), plus the summary, latency-by-kind, budget windows, and a
  // month-end burn-down projection — everything the (now-retired) separate
  // Activity + Ledger screens showed, in one payload.
  app.get("/api/personas/:id/observability", (c) => {
    const id = c.req.param("id");
    if (!engine.store.getPersona(id))
      return c.json({ error: "unknown persona" }, 404);
    const limit = Math.min(
      500,
      Math.max(1, Number(c.req.query("limit")) || 200),
    );
    const events = engine.events.recent(id, limit);
    const ledger = engine.ledger.list({ personaId: id, limit });
    const llm = llmBudget(engine.ledger, id);
    const monthlyCap = BudgetLimits.get(engine.settings, id).value.monthlyUsd;
    return c.json({
      summary: engine.events.summary(id),
      latencyByKind: latencyByKind(events),
      rows: mergeObservability(events, ledger),
      budget: {
        llm,
        evaluation: evaluateBudget(engine, id),
        burndown: projectMonthlySpend(llm.spentUsd, monthlyCap),
      },
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
    // Full bb1 structural check + strictly-positive integer amount at the
    // boundary (#65 review) — a clean 400 here, rather than letting a malformed
    // recipient or "0" reach the TxManager.spend chokepoint and surface as a 500.
    if (!to || !isBb1Address(to) || !amount || !isPositiveMicroAmount(amount)) {
      return c.json(
        {
          error:
            "to (a valid bb1 address) and amount (a positive base-unit integer) are required",
        },
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
      // Insufficient funds / a pre-flight chain rejection → a clean 422, not a 500 (#85).
      if (e instanceof TxRejectedError)
        return c.json({ error: e.message }, 422);
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
  app.get("/api/vaults/:collectionId/signoff", async (c) => {
    const v = engine.vaults.getByCollection(c.req.param("collectionId"));
    if (!v || !v.gating?.multisig)
      return c.json({ error: "no multisig vault for this id" }, 404);
    // Live sign-off progress (#83): read the on-chain votes via the protobuf ABCI
    // query (approverAddress="" = collection-level) and compute the tally. If the
    // chain read fails, surface tallyError instead of a misleading "0 signed".
    let tally: ReturnType<typeof voteTally> | null = null;
    let tallyError = false;
    try {
      const votes = await getVotes({
        collectionId: v.collectionId,
        approvalId: v.withdrawApprovalId,
        proposalId: VAULT_WITHDRAW_PROPOSAL_ID,
      });
      tally = voteTally(v.gating.multisig, votes);
    } catch (e) {
      tallyError = true;
      log.warn(`signoff tally read failed for ${v.collectionId}: ${e}`);
    }
    return c.json({
      collectionId: v.collectionId,
      name: v.name,
      symbol: v.symbol,
      approvalId: v.withdrawApprovalId,
      proposalId: VAULT_WITHDRAW_PROPOSAL_ID,
      threshold: v.gating.multisig.threshold,
      signers: v.gating.multisig.signers,
      tally, // null when unread
      tallyError,
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
      // The human manager (#75) — the connected Keplr address from the UI. Falls
      // back to VELLUM_PRINCIPAL_ADDRESS server-side when omitted.
      managerAddress?: string;
    };
    if (!body.name?.trim() || !body.symbol?.trim()) {
      return c.json({ error: "name and symbol are required" }, 400);
    }
    const gating = parseGating(body.gating);
    if (gating === "invalid")
      return c.json({ error: "invalid gating policy" }, 400);
    const managerAddress = body.managerAddress?.trim();
    if (managerAddress && !isBb1Address(managerAddress))
      return c.json(
        { error: "managerAddress must be a valid bb1 address" },
        400,
      );
    try {
      const vault = await engine.vaults.create(id, {
        name: body.name.trim(),
        symbol: body.symbol.trim(),
        description: body.description?.trim(),
        dailyWithdrawLimit: body.dailyWithdrawLimit,
        gating,
        managerAddress,
      });
      return c.json(vault, 201);
    } catch (e) {
      if (e instanceof CapabilityDeniedError)
        return c.json({ error: e.message }, 403);
      // No manager configured (no connected wallet + no VELLUM_PRINCIPAL_ADDRESS)
      // → a clean 400 with guidance, not an unhandled 500 (#75).
      if (e instanceof Error && /no vault manager/.test(e.message))
        return c.json(
          {
            error:
              "Connect your wallet to set the vault manager (or configure VELLUM_PRINCIPAL_ADDRESS).",
          },
          400,
        );
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
      // Over the vault's cap / outside its window / missing sign-off / insufficient
      // escrow → rejected pre-flight. Surface a clean 422, never a 500 (#85).
      if (e instanceof TxRejectedError)
        return c.json({ error: e.message }, 422);
      throw e;
    }
  });

  // Tx status (#81): poll a submitted tx toward its terminal state so the UI can
  // show pending → confirmed/failed instead of an action that appears to hang.
  // Persona-scoped — a tx id belonging to another persona 404s (no cross-
  // compartment status leak).
  app.get("/api/personas/:id/tx/:txId", (c) => {
    const id = c.req.param("id");
    const tx = engine.txManager.get(c.req.param("txId"));
    if (!tx || tx.personaId !== id) return c.json({ error: "unknown tx" }, 404);
    return c.json({
      id: tx.id,
      hash: tx.hash,
      status: tx.status,
      height: tx.height,
      error: tx.error,
    });
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
    // Reject sub-micro amounts that round to 0 µUSDC — they'd mint a fundable
    // link for a zero-amount transfer (mirrors the agent tool's microOrNull).
    const micro = Math.round(usd * 1e6);
    if (micro < 1)
      return c.json({ error: "amountUsdc is too small (rounds to zero)" }, 400);
    const req = paymentRequests.create({
      personaId: id,
      toAddress: addr,
      denom: env.VELLUM_DENOM,
      amount: String(micro),
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

  // Vault deposit requests (#62) — the "fund this vault" analog of payment
  // requests. The agent/user raises a one-time deposit request for a specific
  // vault; the funder opens the /deposit/:id link and signs `vaultDepositMsg` to
  // fund the vault's escrow from their own Keplr wallet (the minted vault tokens
  // go to the persona agent, who later withdraws within the vault's rules).
  app.post("/api/personas/:id/deposit-requests", async (c) => {
    const id = c.req.param("id");
    if (!engine.store.getPersona(id))
      return c.json({ error: "unknown persona" }, 404);
    const agentAddress = engine.wallets.addressFor(id);
    if (!agentAddress) return c.json({ error: "persona has no wallet" }, 400);
    const body = (await c.req.json().catch(() => ({}))) as {
      collectionId?: string;
      amountUsdc?: number;
      memo?: string;
    };
    const collectionId = body.collectionId?.trim();
    if (!collectionId)
      return c.json({ error: "collectionId is required" }, 400);
    const vault = engine.vaults.getByCollection(collectionId);
    // The vault must belong to this persona — a deposit request always targets
    // one of the persona's own vaults.
    if (!vault || vault.personaId !== id)
      return c.json({ error: "unknown vault for this persona" }, 404);
    const usd = Number(body.amountUsdc);
    if (!Number.isFinite(usd) || usd <= 0)
      return c.json({ error: "amountUsdc must be a number > 0" }, 400);
    // Reject sub-micro amounts that round to 0 µUSDC (mirrors microOrNull) — a
    // zero-amount deposit request would render a fundable link that builds a
    // zero MsgTransferTokens.
    const micro = Math.round(usd * 1e6);
    if (micro < 1)
      return c.json({ error: "amountUsdc is too small (rounds to zero)" }, 400);
    const req = depositRequests.create({
      personaId: id,
      collectionId: vault.collectionId,
      vaultSymbol: vault.symbol,
      vaultName: vault.name,
      backingAddress: vault.backingAddress,
      agentAddress,
      denom: env.VELLUM_DENOM,
      amount: String(micro),
      memo: body.memo?.trim() || `Fund ${vault.symbol} vault`,
    });
    return c.json(req, 201);
  });

  app.get("/api/personas/:id/deposit-requests", (c) => {
    const id = c.req.param("id");
    if (!engine.store.getPersona(id))
      return c.json({ error: "unknown persona" }, 404);
    return c.json({ requests: depositRequests.listForPersona(id) });
  });

  // Public — the deposit page fetches this without persona context.
  app.get("/api/deposit-requests/:reqId", (c) => {
    const r = depositRequests.get(c.req.param("reqId"));
    if (!r) return c.json({ error: "unknown deposit request" }, 404);
    const persona = engine.store.getPersona(r.personaId);
    return c.json({
      request: r,
      personaName: persona?.soul.name ?? r.personaId,
    });
  });

  // There is NO public confirm route: a deposit has nothing to verify on-chain
  // (unlike a payment-request credit), so an unauthenticated delete would be pure
  // griefing. The funder just signs `vaultDepositMsg`; the persona owner dismisses
  // the request (authed) below once the vault shows funded. (#62)
  app.delete("/api/deposit-requests/:reqId", (c) => {
    const r = depositRequests.get(c.req.param("reqId"));
    if (!r) return c.json({ error: "unknown deposit request" }, 404);
    depositRequests.delete(r.id);
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

  // Chat sessions (#72): a persona can hold several named conversations, each
  // with its own transcript. These surface engine.conversations; the store
  // scopes every op by (id, personaId) so one persona's sessions can't be read
  // or mutated under another (the memory wall).
  app.get("/api/personas/:id/conversations", (c) => {
    const id = c.req.param("id");
    if (!engine.store.getPersona(id))
      return c.json({ error: "unknown persona" }, 404);
    return c.json({ conversations: engine.conversations.list(id) });
  });

  app.post("/api/personas/:id/conversations", async (c) => {
    const id = c.req.param("id");
    if (!engine.store.getPersona(id))
      return c.json({ error: "unknown persona" }, 404);
    const body = (await c.req.json().catch(() => ({}))) as { title?: unknown };
    const title = typeof body.title === "string" ? body.title : undefined;
    return c.json(engine.conversations.create(id, title), 201);
  });

  app.patch("/api/personas/:id/conversations/:cid", async (c) => {
    const id = c.req.param("id");
    const cid = c.req.param("cid");
    const body = (await c.req.json().catch(() => ({}))) as { title?: unknown };
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title) return c.json({ error: "title is required" }, 400);
    const updated = engine.conversations.rename(id, cid, title);
    if (!updated) return c.json({ error: "unknown conversation" }, 404);
    return c.json(updated);
  });

  app.delete("/api/personas/:id/conversations/:cid", (c) => {
    const id = c.req.param("id");
    const cid = c.req.param("cid");
    if (!engine.conversations.remove(id, cid))
      return c.json({ error: "unknown conversation" }, 404);
    return c.json({ ok: true });
  });

  app.get("/api/personas/:id/conversations/:cid/messages", (c) => {
    const id = c.req.param("id");
    const cid = c.req.param("cid");
    return c.json({ messages: engine.conversations.messages(id, cid) });
  });

  app.post("/api/chat", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      conversationId?: string;
      personaId?: string;
      message?: string;
      humanAddress?: unknown;
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
    // The human's connected Keplr address (#73) — per-turn context only. Reject a
    // malformed value (client bug) rather than silently dropping it; absent is
    // fine (not connected).
    const humanAddress =
      typeof body.humanAddress === "string" ? body.humanAddress.trim() : "";
    if (humanAddress && !isBb1Address(humanAddress))
      return c.json({ error: "humanAddress must be a bb1 address" }, 400);
    // Cross-persona guard (#72 wall): reject a conversation id that belongs to a
    // DIFFERENT persona BEFORE doing work → 400. ensure() is idempotent, so this
    // pre-check composes with chat()'s own persistence below. Transcript writes
    // (user + agent turns) now live in chat() so EVERY surface persists the same
    // way (#78) — the route no longer appends.
    try {
      engine.conversations.ensure(conversationId, personaId);
    } catch {
      return c.json(
        { error: "conversation belongs to a different persona" },
        400,
      );
    }
    // Shared chat flow (budget gate → routing → agent loop + vault tools →
    // ledger + memory + transcript persistence). Identical on web + Telegram.
    const trace = tracer.trace("chat", { personaId, conversationId });
    const r = await chat(engine, {
      conversationId,
      personaId,
      message,
      trace,
      humanAddress: humanAddress || undefined,
    });
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
    let file = Bun.file(distDir + rel);
    const served = await file.exists();
    if (!served) file = Bun.file(distDir + "index.html");
    if (!(await file.exists())) {
      // No build present — a clear error, also no-cache (it's the shell slot, and
      // must not be cached past a build).
      return c.text("build the SPA first: bun run build", 404, {
        "cache-control": "no-cache",
      });
    }
    const type = file.type || "application/octet-stream";
    // Vite's hashed assets are immutable (the hash changes when content does), so
    // cache them hard. The HTML shell must always revalidate, or a browser keeps
    // loading a stale bundle after a rebuild — which silently serves old UI/CSS.
    const immutable = served && rel.startsWith("assets/");
    return new Response(file, {
      headers: {
        "content-type": type,
        "cache-control": immutable
          ? "public, max-age=31536000, immutable"
          : "no-cache",
      },
    });
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
