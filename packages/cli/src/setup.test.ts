import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createEngine, type Engine } from "@vellum/engine";
import { generateWallet } from "@vellum/chain";
import type { SecretBackend } from "@vellum/shared";
import { runSetup } from "./setup.ts";

// In-memory secret store so the test never touches the real macOS keychain.
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

// Isolate the data dir to a temp home so the test never touches ~/.vellum.
let prevHome: string | undefined;
beforeEach(() => {
  prevHome = process.env.VELLUM_HOME;
  process.env.VELLUM_HOME = mkdtempSync(join(tmpdir(), "vellum-home-"));
});
afterEach(() => {
  if (prevHome === undefined) delete process.env.VELLUM_HOME;
  else process.env.VELLUM_HOME = prevHome;
});

describe("runSetup (#19 install wizard core)", () => {
  test("stores the seed in the keychain (not .env) + writes other secrets + creates the first persona", async () => {
    const { mnemonic } = await generateWallet();
    const envPath = join(mkdtempSync(join(tmpdir(), "vellum-setup-")), ".env");
    const { backend, peek } = fakeBackend();
    let captured: Engine | undefined;

    const res = await runSetup(
      {
        openRouterKey: "sk-or-test",
        mnemonic,
        personaName: "Pat Assistant",
        apiToken: "tok-abc",
      },
      {
        envPath,
        secretBackend: backend,
        createEngine: (opts) => {
          captured = createEngine({
            ...opts,
            dbPath: ":memory:",
            embedder: null,
          });
          return captured;
        },
      },
    );

    expect(res.personaId).toBe("pat-assistant");
    expect(res.address.startsWith("bb1")).toBe(true);
    // The seed is NOT a .env key anymore — only the non-seed secrets are.
    expect(res.wroteKeys.sort()).toEqual([
      "OPENROUTER_API_KEY",
      "VELLUM_API_TOKEN",
    ]);
    expect(res.seedBackend).toBe("fake-store");

    // The persona + wallet are persisted in the engine.
    const persona = captured!.store.getPersona("pat-assistant");
    expect(persona).toBeTruthy();
    expect(captured!.wallets.addressFor("pat-assistant")).toBe(res.address);
    // Go all-in on PERSONA.md (#91): the CLI seeds the default instructions doc.
    expect(persona!.soul.instructions).toBeTruthy();
    expect(persona!.soul.role).toBe("");

    // The master seed went to the secret store; the .env has the others but
    // never the seed (the whole point of #96).
    expect(peek()).toBe(mnemonic);
    const env = readFileSync(envPath, "utf8");
    expect(env).toContain("OPENROUTER_API_KEY=sk-or-test");
    expect(env).toContain("VELLUM_API_TOKEN=tok-abc");
    expect(env).not.toContain("AGENT_SIGNER_MNEMONIC");
  });

  test("with no optional secrets, writes no .env at all (seed still stored) + reused on re-run", async () => {
    const { mnemonic } = await generateWallet();
    const envPath = join(mkdtempSync(join(tmpdir(), "vellum-setup-")), ".env");
    const { backend, peek } = fakeBackend();
    const make = (opts: Parameters<typeof createEngine>[0]) =>
      createEngine({ ...opts, dbPath: ":memory:", embedder: null });

    const first = await runSetup(
      { mnemonic, personaName: "Solo" },
      { envPath, secretBackend: backend, createEngine: make },
    );
    expect(first.wroteKeys).toEqual([]); // nothing but the seed
    expect(peek()).toBe(mnemonic); // seed in the keychain
    expect(existsSync(envPath)).toBe(false); // no plaintext file created

    const second = await runSetup(
      { mnemonic, personaName: "Solo" },
      { envPath, secretBackend: backend, createEngine: make },
    );
    expect(second.personaId).toBe(first.personaId);
  });

  test("Telegram is optional: writes the token + chat id only when provided (#49)", async () => {
    const { mnemonic } = await generateWallet();
    const make = (opts: Parameters<typeof createEngine>[0]) =>
      createEngine({ ...opts, dbPath: ":memory:", embedder: null });

    // Provided → persisted to .env so the daemon attaches the bot on next boot.
    const withTg = join(mkdtempSync(join(tmpdir(), "vellum-setup-")), ".env");
    await runSetup(
      {
        mnemonic,
        personaName: "Solo",
        telegramBotToken: "123456:ABC-token",
        telegramPrincipalChatId: "42",
      },
      {
        envPath: withTg,
        secretBackend: fakeBackend().backend,
        createEngine: make,
        verifyTelegram: async () => ({ ok: true, username: "test_bot" }),
      },
    );
    const env1 = readFileSync(withTg, "utf8");
    expect(env1).toContain("TELEGRAM_BOT_TOKEN=123456:ABC-token");
    expect(env1).toContain("TELEGRAM_PRINCIPAL_CHAT_ID=42");
    expect(env1).not.toContain("AGENT_SIGNER_MNEMONIC");

    // Absent → no .env at all (skippable; no accidental empty token).
    const without = join(mkdtempSync(join(tmpdir(), "vellum-setup-")), ".env");
    await runSetup(
      { mnemonic, personaName: "Solo" },
      {
        envPath: without,
        secretBackend: fakeBackend().backend,
        createEngine: make,
      },
    );
    expect(existsSync(without)).toBe(false);
  });

  test("rejects a non-integer Telegram chat id — neither .env nor keychain written (#63 review)", async () => {
    const { mnemonic } = await generateWallet();
    const make = (opts: Parameters<typeof createEngine>[0]) =>
      createEngine({ ...opts, dbPath: ":memory:", embedder: null });
    const envPath = join(mkdtempSync(join(tmpdir(), "vellum-setup-")), ".env");
    const { backend, peek } = fakeBackend();
    await expect(
      runSetup(
        {
          mnemonic,
          personaName: "Solo",
          telegramBotToken: "123456:ABC-token",
          telegramPrincipalChatId: "not-a-number",
        },
        {
          envPath,
          secretBackend: backend,
          createEngine: make,
          verifyTelegram: async () => ({ ok: true }),
        },
      ),
    ).rejects.toThrow(/integer/);
    // The throw happens before the seed is stored, so nothing is persisted — a
    // typo can't become a boot blocker or leave a stray seed.
    expect(existsSync(envPath)).toBe(false);
    expect(peek()).toBeNull();
  });

  test("rejects an unvalidated Telegram bot token — neither .env nor keychain written (#74 review)", async () => {
    const { mnemonic } = await generateWallet();
    const make = (opts: Parameters<typeof createEngine>[0]) =>
      createEngine({ ...opts, dbPath: ":memory:", embedder: null });
    const envPath = join(mkdtempSync(join(tmpdir(), "vellum-setup-")), ".env");
    const { backend, peek } = fakeBackend();
    await expect(
      runSetup(
        {
          mnemonic,
          personaName: "Solo",
          telegramBotToken: "bad-token",
        },
        {
          envPath,
          secretBackend: backend,
          createEngine: make,
          verifyTelegram: async () => ({ ok: false }),
        },
      ),
    ).rejects.toThrow(/didn't validate/);
    // getMe runs before the seed is stored, so a mistyped token is never
    // persisted + the keychain stays untouched.
    expect(existsSync(envPath)).toBe(false);
    expect(peek()).toBeNull();
  });
});
