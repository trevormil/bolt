import { describe, expect, test } from "bun:test";
import { envSchema } from "./env.ts";

describe("envSchema", () => {
  test("applies devnet defaults when nothing is set", () => {
    const env = envSchema.parse({});
    expect(env.BITBADGES_CHAIN_ID).toBe("bitbadges-1");
    expect(env.BITBADGES_RPC).toBe("https://rpc.meridian.trevormil.com");
    expect(env.BITBADGES_LCD).toBe("https://lcd.meridian.trevormil.com");
    expect(env.LOG_LEVEL).toBe("info");
  });

  test("leaves secrets undefined when absent", () => {
    const env = envSchema.parse({});
    expect(env.AGENT_SIGNER_MNEMONIC).toBeUndefined();
    expect(env.TELEGRAM_BOT_TOKEN).toBeUndefined();
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(env.LANGFUSE_PUBLIC_KEY).toBeUndefined();
  });

  test("overrides defaults from provided values", () => {
    const env = envSchema.parse({
      BITBADGES_CHAIN_ID: "custom-1",
      LOG_LEVEL: "debug",
    });
    expect(env.BITBADGES_CHAIN_ID).toBe("custom-1");
    expect(env.LOG_LEVEL).toBe("debug");
  });

  test("rejects an invalid LOG_LEVEL", () => {
    expect(envSchema.safeParse({ LOG_LEVEL: "loud" }).success).toBe(false);
  });

  test("rejects a non-URL RPC", () => {
    expect(envSchema.safeParse({ BITBADGES_RPC: "not-a-url" }).success).toBe(
      false,
    );
  });
});
