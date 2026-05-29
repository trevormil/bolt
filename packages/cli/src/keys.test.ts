import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { env, type SecretBackend } from "@vellum/shared";
import { migrateSeedToKeychain, runKeysCommand } from "./keys.ts";

function fakeBackend(initial: string | null = null) {
  let store = initial;
  const backend: SecretBackend = {
    name: "fake-store",
    async get() {
      return store;
    },
    async set(_account, value) {
      store = value;
    },
    async delete() {
      store = null;
    },
  };
  return { backend, peek: () => store };
}

function tmpEnv(contents: string): string {
  const p = join(mkdtempSync(join(tmpdir(), "vellum-keys-")), ".env");
  writeFileSync(p, contents);
  return p;
}

// agentMnemonicSource reads the env singleton; clear it so these tests reflect
// the backend, not the ambient dev .env.
const saved = env.AGENT_SIGNER_MNEMONIC;
afterEach(() => {
  env.AGENT_SIGNER_MNEMONIC = saved;
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
