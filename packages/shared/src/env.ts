import { z } from "zod";

// Parsed once at startup. Chain defaults to the Meridian devnet so the scaffold
// boots without a .env; secrets are optional until their tickets wire them in.
// Exported so it can be unit-tested with controlled inputs (the `env` singleton
// below reads the real process.env once at import).
export const envSchema = z.object({
  BITBADGES_CHAIN_ID: z.string().default("bitbadges-1"),
  BITBADGES_RPC: z.string().url().default("https://rpc.meridian.trevormil.com"),
  BITBADGES_LCD: z.string().url().default("https://lcd.meridian.trevormil.com"),

  AGENT_SIGNER_MNEMONIC: z.string().optional(),
  AGENT_SIGNER_PRIVKEY_HEX: z.string().optional(),

  TELEGRAM_BOT_TOKEN: z.string().optional(),

  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  OPENROUTER_API_KEY: z.string().optional(),

  // LLM routing (OpenRouter model ids): cheap by default, escalate to frontier.
  LLM_MODEL_CHEAP: z.string().default("anthropic/claude-haiku-4.5"),
  LLM_MODEL_FRONTIER: z.string().default("anthropic/claude-sonnet-4.6"),

  LANGFUSE_PUBLIC_KEY: z.string().optional(),
  LANGFUSE_SECRET_KEY: z.string().optional(),
  LANGFUSE_HOST: z.string().url().optional(),

  // Web app: persistent sqlite path (personas/memory/wallets/routing/ledger) +
  // the API/static server bind. Defaults to loopback — the API is unauthenticated,
  // so exposing it beyond localhost is an explicit opt-in (WEB_HOST=0.0.0.0).
  VELLUM_DB_PATH: z.string().default("./vellum.db"),
  WEB_PORT: z.coerce.number().default(8787),
  WEB_HOST: z.string().default("127.0.0.1"),

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
  // (OpenRouter-tracked via the ledger). Free-form USDC cap (0010): the discretionary
  // x/bank tier ceiling per persona, enforced by never funding above it.
  VELLUM_LLM_BUDGET_USD: z.coerce.number().default(1),
  VELLUM_FREEFORM_CAP_USD: z.coerce.number().default(25),
  // Per-persona check-in cadence (0018). Default 6h; lower it for demos.
  VELLUM_CHECKIN_INTERVAL_MS: z.coerce.number().default(6 * 60 * 60 * 1000),

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
