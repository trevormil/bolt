import { z } from "zod";
import { dataPath } from "./paths.ts";

// Parsed once at startup. Chain defaults to the Meridian devnet so the scaffold
// boots without a .env; secrets are optional until their tickets wire them in.
// Exported so it can be unit-tested with controlled inputs (the `env` singleton
// below reads the real process.env once at import).
export const envSchema = z.object({
  BITBADGES_CHAIN_ID: z.string().default("bitbadges-1"),
  BITBADGES_RPC: z.string().url().default("https://rpc.meridian.trevormil.com"),
  BITBADGES_LCD: z.string().url().default("https://lcd.meridian.trevormil.com"),
  // Optional comma-separated fallback RPC endpoints (#24 F-05) — tried in order
  // after BITBADGES_RPC for read queries when the primary is unreachable.
  BITBADGES_RPC_FALLBACKS: z.string().default(""),

  AGENT_SIGNER_MNEMONIC: z.string().optional(),
  AGENT_SIGNER_PRIVKEY_HEX: z.string().optional(),
  // Where the agent's master seed lives at rest (ADR-0007). `auto` = OS keychain
  // on macOS, env-only elsewhere; `keychain` forces the keychain; `env` forces
  // env-only (CI / tests / opt-out). env always wins as the fast path regardless.
  VELLUM_SECRET_BACKEND: z.enum(["auto", "keychain", "env"]).default("auto"),

  TELEGRAM_BOT_TOKEN: z.string().optional(),
  // Principal chat allowlist (#28). When set, ONLY this chat id may drive the
  // bot; when unset, the first chat to interact claims ownership (first-contact
  // TOFU). Set this for a hardened single-owner deployment.
  TELEGRAM_PRINCIPAL_CHAT_ID: z.coerce.number().optional(),

  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  OPENROUTER_API_KEY: z.string().optional(),

  // LLM routing (OpenRouter model ids): cheap by default, escalate to frontier.
  LLM_MODEL_CHEAP: z.string().default("anthropic/claude-haiku-4.5"),
  LLM_MODEL_FRONTIER: z.string().default("anthropic/claude-sonnet-4.6"),
  // Allowlist of OpenRouter models a persona may be pinned to (#43 "approved
  // models"). Comma-separated; override to expand. A per-persona model override
  // is rejected unless it's in this set.
  VELLUM_APPROVED_MODELS: z
    .string()
    .default(
      "anthropic/claude-sonnet-4.6,anthropic/claude-haiku-4.5,anthropic/claude-3.5-sonnet,openai/gpt-4o,openai/gpt-4o-mini,google/gemini-2.0-flash-001",
    ),

  LANGFUSE_PUBLIC_KEY: z.string().optional(),
  LANGFUSE_SECRET_KEY: z.string().optional(),
  LANGFUSE_HOST: z.string().url().optional(),

  // Web app: persistent sqlite path (personas/memory/wallets/routing/ledger) +
  // the API/static server bind. Defaults to loopback. State-changing routes
  // require a bearer token (VELLUM_API_TOKEN); on loopback with no token set the
  // API is open for local dev, but binding beyond loopback (WEB_HOST=0.0.0.0)
  // REQUIRES a token or protected routes 401 (fail closed).
  // Defaults into the local data home (~/.vellum, #39) — not cwd-relative — so
  // the CLI, daemon, and web share one filesystem source of truth regardless of
  // launch dir. Explicit override still honored.
  VELLUM_DB_PATH: z.string().default(dataPath("vellum.db")),

  // The agent's working directory (#52) — the single root the YOLO filesystem +
  // command-execution (`run_command`) tools operate in. Defaults to
  // `<dataDir>/workspace` (see paths.ts workspaceDir); override to point the
  // agent at a project checkout. fs + exec are scoped here and cannot escape it.
  VELLUM_WORKSPACE: z.string().optional(),
  // Per-command wall-clock timeout for `run_command` (ms). The process tree is
  // killed on expiry so a runaway build can't hang the agent loop.
  VELLUM_EXEC_TIMEOUT_MS: z.coerce.number().int().positive().default(120_000),
  // Cap on captured stdout/stderr per stream (chars) — a flood is truncated so
  // it can't blow up the LLM context / cost.
  VELLUM_EXEC_MAX_OUTPUT: z.coerce.number().int().positive().default(16_000),

  WEB_PORT: z.coerce.number().default(8787),
  WEB_HOST: z.string().default("127.0.0.1"),
  // Bearer token guarding state-changing API routes. Optional on loopback;
  // required to expose the API beyond localhost.
  VELLUM_API_TOKEN: z.string().optional(),

  // Public base URL for the shareable links the agent mints (/pay, /deposit,
  // /vote) via the request_* tools (#67). When set, those tools return absolute
  // URLs; unset → a relative path (the daemon is loopback-only, so a bare path
  // is honest for local use).
  VELLUM_PUBLIC_URL: z.string().url().optional(),

  // Vellum is single-asset: the IBC USDC denom on the BitBadges devnet (6 dp,
  // displayed "USDC"). Balances, payment requests, and vaults use only this.
  VELLUM_DENOM: z
    .string()
    .default(
      "ibc/F082B65C88E4B6D5EF1DB243CDA1D331D002759E938A0F5CD3FFDC5D53B3E349",
    ),
  // Devnet USDC faucet (Meridian aggregator) — 10 USDC per claim to a bb1 address.
  VELLUM_FAUCET_URL: z
    .string()
    .url()
    .default("https://api.meridian.trevormil.com"),
  // The human principal's bb1 address — set as vault manager (agent has zero
  // manager capability). Until Keplr (0027) supplies it dynamically, configure here.
  VELLUM_PRINCIPAL_ADDRESS: z.string().optional(),
  // Per-persona LLM-spend budget (0009): max $/persona per rolling 24h window
  // (OpenRouter-tracked via the ledger). This is a cost guardrail, NOT a limit on
  // the user's USDC — there is no free-form spending cap; USDC limits live in vaults.
  VELLUM_LLM_BUDGET_USD: z.coerce.number().default(1),

  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type Env = z.infer<typeof envSchema>;

function parseEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    // Fail fast and loud — a misconfigured environment must never boot silently.
    console.error(
      "[env] invalid environment:",
      JSON.stringify(result.error.flatten().fieldErrors, null, 2),
    );
    process.exit(1);
  }
  return result.data;
}

export const env: Env = parseEnv();

/**
 * Mutate the live `env` singleton at runtime (#54 web onboarding). The web setup
 * route writes secrets to .env (persisted for next boot) AND calls this so the
 * ALREADY-RUNNING daemon adopts the new OpenRouter key / mnemonic without a
 * restart — consumers read `env.*` at call time, so the mutation takes effect
 * immediately. Loopback-gated at the route; never a public mutation surface.
 */
export function setRuntimeEnv(partial: Partial<Env>): void {
  Object.assign(env, partial);
}
