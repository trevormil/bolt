import { z } from "zod";

// Parsed once at startup. Chain defaults to the Meridian devnet so the scaffold
// boots without a .env; secrets are optional until their tickets wire them in.
const schema = z.object({
  BITBADGES_CHAIN_ID: z.string().default("bitbadges-1"),
  BITBADGES_RPC: z.string().url().default("https://rpc.meridian.trevormil.com"),
  BITBADGES_LCD: z.string().url().default("https://lcd.meridian.trevormil.com"),

  AGENT_SIGNER_MNEMONIC: z.string().optional(),
  AGENT_SIGNER_PRIVKEY_HEX: z.string().optional(),

  TELEGRAM_BOT_TOKEN: z.string().optional(),

  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),

  LANGFUSE_PUBLIC_KEY: z.string().optional(),
  LANGFUSE_SECRET_KEY: z.string().optional(),
  LANGFUSE_HOST: z.string().url().optional(),

  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type Env = z.infer<typeof schema>;

function parseEnv(): Env {
  const result = schema.safeParse(process.env);
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
