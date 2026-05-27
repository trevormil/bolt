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
  // the API/static server port.
  VELLUM_DB_PATH: z.string().default("./vellum.db"),
  WEB_PORT: z.coerce.number().default(8787),

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
