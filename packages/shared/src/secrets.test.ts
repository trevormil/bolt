import { afterEach, describe, expect, test } from "bun:test";
import { env } from "./env.ts";
import {
  getAgentMnemonic,
  setAgentMnemonic,
  clearAgentMnemonic,
  agentMnemonicSource,
  getTelegramBotToken,
  setTelegramBotToken,
  clearTelegramBotToken,
  telegramBotTokenSource,
  type SecretBackend,
} from "./secrets.ts";

// An in-memory backend that records calls — stands in for the macOS keychain so
// the suite never shells out.
function fakeBackend(initial: string | null = null) {
  let store = initial;
  const calls = { get: 0, set: 0, delete: 0 };
  const backend: SecretBackend = {
    name: "fake",
    async get() {
      calls.get++;
      return store;
    },
    async set(_account, value) {
      calls.set++;
      store = value;
    },
    async delete() {
      calls.delete++;
      store = null;
    },
  };
  return { backend, calls, peek: () => store };
}

const saved = env.AGENT_SIGNER_MNEMONIC;
const savedTg = env.TELEGRAM_BOT_TOKEN;
afterEach(() => {
  env.AGENT_SIGNER_MNEMONIC = saved;
  env.TELEGRAM_BOT_TOKEN = savedTg;
});

describe("agent seed resolution (#96 / ADR-0007)", () => {
  test("env wins and the secret store is never read", async () => {
    env.AGENT_SIGNER_MNEMONIC = "env seed words";
    const { backend, calls } = fakeBackend("keychain seed words");
    expect(await getAgentMnemonic(backend)).toBe("env seed words");
    expect(calls.get).toBe(0);
  });

  test("falls back to the secret store when env is empty", async () => {
    env.AGENT_SIGNER_MNEMONIC = undefined;
    const { backend, calls } = fakeBackend("keychain seed words");
    expect(await getAgentMnemonic(backend)).toBe("keychain seed words");
    expect(calls.get).toBe(1);
  });

  test("undefined when neither env nor the store has a seed", async () => {
    env.AGENT_SIGNER_MNEMONIC = undefined;
    const { backend } = fakeBackend(null);
    expect(await getAgentMnemonic(backend)).toBeUndefined();
  });

  test("a backend read failure resolves to undefined, not a throw", async () => {
    env.AGENT_SIGNER_MNEMONIC = undefined;
    const backend: SecretBackend = {
      name: "broken",
      async get() {
        throw new Error("keychain locked");
      },
      async set() {},
      async delete() {},
    };
    expect(await getAgentMnemonic(backend)).toBeUndefined();
  });

  test("setAgentMnemonic writes through the backend; a later read returns it", async () => {
    env.AGENT_SIGNER_MNEMONIC = undefined;
    const { backend, calls, peek } = fakeBackend(null);
    await setAgentMnemonic("freshly stored seed", backend);
    expect(calls.set).toBe(1);
    expect(peek()).toBe("freshly stored seed");
    expect(await getAgentMnemonic(backend)).toBe("freshly stored seed");
  });

  test("clearAgentMnemonic deletes from the backend → resolution goes absent", async () => {
    env.AGENT_SIGNER_MNEMONIC = undefined;
    const { backend, calls } = fakeBackend("seed to drop");
    await clearAgentMnemonic(backend);
    expect(calls.delete).toBe(1);
    expect(await getAgentMnemonic(backend)).toBeUndefined();
  });

  test("agentMnemonicSource reports env / keychain / none without leaking the value", async () => {
    env.AGENT_SIGNER_MNEMONIC = undefined;
    expect(await agentMnemonicSource(fakeBackend(null).backend)).toBe("none");
    expect(await agentMnemonicSource(fakeBackend("x").backend)).toBe(
      "keychain",
    );
    env.AGENT_SIGNER_MNEMONIC = "from env";
    expect(await agentMnemonicSource(fakeBackend("x").backend)).toBe("env");
  });
});

describe("Telegram bot token resolution (#109 §1)", () => {
  test("env wins and the secret store is never read", async () => {
    env.TELEGRAM_BOT_TOKEN = "env-token";
    const { backend, calls } = fakeBackend("keychain-token");
    expect(await getTelegramBotToken(backend)).toBe("env-token");
    expect(calls.get).toBe(0);
  });

  test("falls back to the secret store when env is empty", async () => {
    env.TELEGRAM_BOT_TOKEN = undefined;
    const { backend, calls } = fakeBackend("keychain-token");
    expect(await getTelegramBotToken(backend)).toBe("keychain-token");
    expect(calls.get).toBe(1);
  });

  test("undefined when neither env nor the store has a token", async () => {
    env.TELEGRAM_BOT_TOKEN = undefined;
    const { backend } = fakeBackend(null);
    expect(await getTelegramBotToken(backend)).toBeUndefined();
  });

  test("a backend read failure resolves to undefined, not a throw", async () => {
    env.TELEGRAM_BOT_TOKEN = undefined;
    const backend: SecretBackend = {
      name: "broken",
      async get() {
        throw new Error("keychain locked");
      },
      async set() {},
      async delete() {},
    };
    expect(await getTelegramBotToken(backend)).toBeUndefined();
  });

  test("setTelegramBotToken writes through; a later read returns it", async () => {
    env.TELEGRAM_BOT_TOKEN = undefined;
    const { backend, calls, peek } = fakeBackend(null);
    await setTelegramBotToken("freshly stored token", backend);
    expect(calls.set).toBe(1);
    expect(peek()).toBe("freshly stored token");
    expect(await getTelegramBotToken(backend)).toBe("freshly stored token");
  });

  test("clearTelegramBotToken deletes from the backend → resolution goes absent", async () => {
    env.TELEGRAM_BOT_TOKEN = undefined;
    const { backend, calls } = fakeBackend("token to drop");
    await clearTelegramBotToken(backend);
    expect(calls.delete).toBe(1);
    expect(await getTelegramBotToken(backend)).toBeUndefined();
  });

  test("telegramBotTokenSource reports env / keychain / none without leaking the value", async () => {
    env.TELEGRAM_BOT_TOKEN = undefined;
    expect(await telegramBotTokenSource(fakeBackend(null).backend)).toBe(
      "none",
    );
    expect(await telegramBotTokenSource(fakeBackend("x").backend)).toBe(
      "keychain",
    );
    env.TELEGRAM_BOT_TOKEN = "from env";
    expect(await telegramBotTokenSource(fakeBackend("x").backend)).toBe("env");
  });

  test("token and seed are stored under distinct accounts — no aliasing", async () => {
    // The seed and the Telegram token both use the same KEYCHAIN_SERVICE so
    // the keychain ACL is one item the user can audit, but they MUST address
    // different accounts. A fake backend that ignored the account name would
    // alias them; this catches that regression.
    const store = new Map<string, string>();
    const backend: SecretBackend = {
      name: "account-aware-fake",
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
    env.AGENT_SIGNER_MNEMONIC = undefined;
    env.TELEGRAM_BOT_TOKEN = undefined;
    await setAgentMnemonic("twelve word seed phrase here", backend);
    await setTelegramBotToken("123:ABC", backend);
    expect(await getAgentMnemonic(backend)).toBe(
      "twelve word seed phrase here",
    );
    expect(await getTelegramBotToken(backend)).toBe("123:ABC");
    // Clearing the token must not nuke the seed (and vice versa).
    await clearTelegramBotToken(backend);
    expect(await getTelegramBotToken(backend)).toBeUndefined();
    expect(await getAgentMnemonic(backend)).toBe(
      "twelve word seed phrase here",
    );
  });
});
