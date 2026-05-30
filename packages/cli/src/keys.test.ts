import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { env, type SecretBackend } from "@vellum/shared";
import {
  migrateSeedToKeychain,
  migrateTelegramToKeychain,
  runKeysCommand,
} from "./keys.ts";

// Multi-account fake so seed + Telegram token (#109 §1) live independently.
function fakeBackend(initial: string | null = null) {
  const store = new Map<string, string>();
  if (initial !== null) store.set("AGENT_SIGNER_MNEMONIC", initial);
  let lastSet: string | null = initial;
  const backend: SecretBackend = {
    name: "fake-store",
    async get(account) {
      return store.get(account) ?? null;
    },
    async set(account, value) {
      store.set(account, value);
      lastSet = value;
    },
    async delete(account) {
      store.delete(account);
    },
  };
  function peek(account?: string): string | null {
    if (account) return store.get(account) ?? null;
    return lastSet;
  }
  return { backend, peek };
}

function tmpEnv(contents: string): string {
  const p = join(mkdtempSync(join(tmpdir(), "vellum-keys-")), ".env");
  writeFileSync(p, contents);
  return p;
}

// agentMnemonicSource / telegramBotTokenSource read the env singleton; clear
// it so these tests reflect the backend, not the ambient dev .env.
const saved = env.AGENT_SIGNER_MNEMONIC;
const savedTg = env.TELEGRAM_BOT_TOKEN;
afterEach(() => {
  env.AGENT_SIGNER_MNEMONIC = saved;
  env.TELEGRAM_BOT_TOKEN = savedTg;
});

describe("migrateSeedToKeychain (#96 / ADR-0007)", () => {
  test("moves the seed into the backend and scrubs the .env line", async () => {
    env.AGENT_SIGNER_MNEMONIC = undefined;
    const { backend, peek } = fakeBackend(null);
    const envPath = tmpEnv(
      `OPENROUTER_API_KEY=sk-test\nAGENT_SIGNER_MNEMONIC="alpha bravo charlie"\n`,
    );
    const r = await migrateSeedToKeychain({
      seed: "alpha bravo charlie",
      envPath,
      backend,
    });
    expect(r.migrated).toBe(true);
    expect(r.scrubbed).toContain("AGENT_SIGNER_MNEMONIC");
    expect(peek()).toBe("alpha bravo charlie");
    const after = readFileSync(envPath, "utf8");
    expect(after).not.toContain("AGENT_SIGNER_MNEMONIC");
    expect(after).toContain("OPENROUTER_API_KEY=sk-test"); // others preserved
  });

  test("no-op when env has no seed but the keychain already holds one", async () => {
    env.AGENT_SIGNER_MNEMONIC = undefined;
    const { backend } = fakeBackend("already in keychain");
    const r = await migrateSeedToKeychain({
      seed: undefined,
      envPath: tmpEnv(`OPENROUTER_API_KEY=sk-test\n`),
      backend,
    });
    expect(r.migrated).toBe(false);
    expect(r.message).toMatch(/already in/i);
  });

  test("reports nothing-to-do when neither env nor keychain has a seed", async () => {
    env.AGENT_SIGNER_MNEMONIC = undefined;
    const { backend } = fakeBackend(null);
    const r = await migrateSeedToKeychain({
      seed: undefined,
      envPath: tmpEnv(""),
      backend,
    });
    expect(r.migrated).toBe(false);
    expect(r.message).toMatch(/no seed/i);
  });
});

describe("runKeysCommand (#96)", () => {
  test("status reports the keychain when the backend holds the seed", async () => {
    env.AGENT_SIGNER_MNEMONIC = undefined;
    const { backend } = fakeBackend("seed in store");
    const out = await runKeysCommand(["status"], {
      backend,
      envPath: tmpEnv(""),
    });
    expect(out).toMatch(/OS secret store/);
    expect(out).not.toContain("seed in store"); // never leaks the value
  });

  test("status flags a plaintext-env seed and points to migrate", async () => {
    env.AGENT_SIGNER_MNEMONIC = "ambient env seed";
    const { backend } = fakeBackend(null);
    const out = await runKeysCommand(["status"], {
      backend,
      envPath: tmpEnv(""),
    });
    expect(out).toMatch(/plaintext env/);
    expect(out).toMatch(/migrate/);
    expect(out).not.toContain("ambient env seed");
  });

  test("migrate via dispatch uses the injected envSeed and stores it", async () => {
    env.AGENT_SIGNER_MNEMONIC = undefined;
    const { backend, peek } = fakeBackend(null);
    const out = await runKeysCommand(["migrate"], {
      backend,
      envPath: tmpEnv(`AGENT_SIGNER_MNEMONIC="x y z"\n`),
      envSeed: "x y z",
    });
    expect(peek()).toBe("x y z");
    expect(out).toMatch(/Stored the master seed/);
  });
});

describe("migrateTelegramToKeychain (#109 §1)", () => {
  test("moves the token into the backend and scrubs the .env line", async () => {
    env.TELEGRAM_BOT_TOKEN = undefined;
    const { backend, peek } = fakeBackend(null);
    const envPath = tmpEnv(
      `OPENROUTER_API_KEY=sk-test\nTELEGRAM_BOT_TOKEN=123:ABC\nTELEGRAM_PRINCIPAL_CHAT_ID=42\n`,
    );
    const r = await migrateTelegramToKeychain({
      token: "123:ABC",
      envPath,
      backend,
    });
    expect(r.migrated).toBe(true);
    expect(r.scrubbed).toContain("TELEGRAM_BOT_TOKEN");
    expect(peek("TELEGRAM_BOT_TOKEN")).toBe("123:ABC");
    const after = readFileSync(envPath, "utf8");
    expect(after).not.toContain("TELEGRAM_BOT_TOKEN");
    // Non-secret routing metadata is preserved — only the token is scrubbed.
    expect(after).toContain("TELEGRAM_PRINCIPAL_CHAT_ID=42");
    expect(after).toContain("OPENROUTER_API_KEY=sk-test");
  });

  test("no-op when env has no token but the keychain already holds one", async () => {
    env.TELEGRAM_BOT_TOKEN = undefined;
    const store = new Map<string, string>([
      ["TELEGRAM_BOT_TOKEN", "already in keychain"],
    ]);
    const backend: SecretBackend = {
      name: "fake-store",
      async get(account) {
        return store.get(account) ?? null;
      },
      async set(account, value) {
        store.set(account, value);
      },
      async delete(account) {
        store.delete(account);
      },
    };
    const r = await migrateTelegramToKeychain({
      token: undefined,
      envPath: tmpEnv(`OPENROUTER_API_KEY=sk-test\n`),
      backend,
    });
    expect(r.migrated).toBe(false);
    expect(r.message).toMatch(/already in/i);
  });

  test("reports nothing-to-do when neither env nor keychain has a token", async () => {
    env.TELEGRAM_BOT_TOKEN = undefined;
    const { backend } = fakeBackend(null);
    const r = await migrateTelegramToKeychain({
      token: undefined,
      envPath: tmpEnv(""),
      backend,
    });
    expect(r.migrated).toBe(false);
    expect(r.message).toMatch(/No Telegram bot token found/i);
  });

  test("dispatch via `migrate-telegram` uses the injected envTelegramToken and stores it", async () => {
    env.TELEGRAM_BOT_TOKEN = undefined;
    const { backend, peek } = fakeBackend(null);
    const out = await runKeysCommand(["migrate-telegram"], {
      backend,
      envPath: tmpEnv(`TELEGRAM_BOT_TOKEN=999:XYZ\n`),
      envTelegramToken: "999:XYZ",
    });
    expect(peek("TELEGRAM_BOT_TOKEN")).toBe("999:XYZ");
    expect(out).toMatch(/Stored the Telegram bot token/);
  });

  test("status includes the telegram-token row alongside the seed row", async () => {
    env.AGENT_SIGNER_MNEMONIC = undefined;
    env.TELEGRAM_BOT_TOKEN = undefined;
    const { backend } = fakeBackend(null);
    const out = await runKeysCommand(["status"], {
      backend,
      envPath: tmpEnv(""),
    });
    expect(out).toMatch(/agent signer seed/);
    expect(out).toMatch(/telegram bot token/);
    expect(out).toMatch(/not configured/);
  });
});
