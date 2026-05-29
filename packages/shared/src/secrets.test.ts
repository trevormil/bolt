import { afterEach, describe, expect, test } from "bun:test";
import { env } from "./env.ts";
import {
  getAgentMnemonic,
  setAgentMnemonic,
  clearAgentMnemonic,
  agentMnemonicSource,
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
afterEach(() => {
  env.AGENT_SIGNER_MNEMONIC = saved;
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
