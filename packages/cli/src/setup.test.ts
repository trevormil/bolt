import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createEngine, type Engine } from "@vellum/engine";
import { generateWallet } from "@vellum/chain";
import { runSetup } from "./setup.ts";

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
  test("writes secrets to .env and creates the first persona with a wallet", async () => {
    const { mnemonic } = await generateWallet();
    const envPath = join(mkdtempSync(join(tmpdir(), "vellum-setup-")), ".env");
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
    expect(res.wroteKeys.sort()).toEqual([
      "AGENT_SIGNER_MNEMONIC",
      "OPENROUTER_API_KEY",
      "VELLUM_API_TOKEN",
    ]);

    // The persona + wallet are persisted in the engine.
    const persona = captured!.store.getPersona("pat-assistant");
    expect(persona).toBeTruthy();
    expect(captured!.wallets.addressFor("pat-assistant")).toBe(res.address);
    // Go all-in on PERSONA.md (#91): the CLI seeds the default instructions doc,
    // not legacy role/voice.
    expect(persona!.soul.instructions).toBeTruthy();
    expect(persona!.soul.role).toBe("");

    // Secrets landed in .env (mnemonic quoted because it has spaces).
    const env = readFileSync(envPath, "utf8");
    expect(env).toContain("OPENROUTER_API_KEY=sk-or-test");
    expect(env).toContain("VELLUM_API_TOKEN=tok-abc");
    expect(env).toContain(`AGENT_SIGNER_MNEMONIC="${mnemonic}"`);
  });

  test("omits optional secrets and is idempotent on re-run (persona reused)", async () => {
    const { mnemonic } = await generateWallet();
    const envPath = join(mkdtempSync(join(tmpdir(), "vellum-setup-")), ".env");
    const make = (opts: Parameters<typeof createEngine>[0]) =>
      createEngine({ ...opts, dbPath: ":memory:", embedder: null });

    const first = await runSetup(
      { mnemonic, personaName: "Solo" },
      { envPath, createEngine: make },
    );
    expect(first.wroteKeys).toEqual(["AGENT_SIGNER_MNEMONIC"]); // no key/token
    const env = readFileSync(envPath, "utf8");
    expect(env).not.toContain("OPENROUTER_API_KEY");

    const second = await runSetup(
      { mnemonic, personaName: "Solo" },
      { envPath, createEngine: make },
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
        createEngine: make,
        verifyTelegram: async () => ({ ok: true, username: "test_bot" }),
      },
    );
    const env1 = readFileSync(withTg, "utf8");
    expect(env1).toContain("TELEGRAM_BOT_TOKEN=123456:ABC-token");
    expect(env1).toContain("TELEGRAM_PRINCIPAL_CHAT_ID=42");

    // Absent → nothing written (skippable; no accidental empty token).
    const without = join(mkdtempSync(join(tmpdir(), "vellum-setup-")), ".env");
    await runSetup(
      { mnemonic, personaName: "Solo" },
      { envPath: without, createEngine: make },
    );
    expect(readFileSync(without, "utf8")).not.toContain("TELEGRAM_BOT_TOKEN");
  });

  test("rejects a non-integer Telegram chat id — nothing written (#63 review)", async () => {
    const { mnemonic } = await generateWallet();
    const make = (opts: Parameters<typeof createEngine>[0]) =>
      createEngine({ ...opts, dbPath: ":memory:", embedder: null });
    const envPath = join(mkdtempSync(join(tmpdir(), "vellum-setup-")), ".env");
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
          createEngine: make,
          verifyTelegram: async () => ({ ok: true }),
        },
      ),
    ).rejects.toThrow(/integer/);
    // The throw happens before upsertEnvFile, so the .env is never written —
    // a typo can't become a boot blocker.
    expect(() => readFileSync(envPath, "utf8")).toThrow();
  });

  test("rejects an unvalidated Telegram bot token — nothing written (#74 review)", async () => {
    const { mnemonic } = await generateWallet();
    const make = (opts: Parameters<typeof createEngine>[0]) =>
      createEngine({ ...opts, dbPath: ":memory:", embedder: null });
    const envPath = join(mkdtempSync(join(tmpdir(), "vellum-setup-")), ".env");
    await expect(
      runSetup(
        {
          mnemonic,
          personaName: "Solo",
          telegramBotToken: "bad-token",
        },
        {
          envPath,
          createEngine: make,
          verifyTelegram: async () => ({ ok: false }),
        },
      ),
    ).rejects.toThrow(/didn't validate/);
    // getMe runs before upsertEnvFile, so a mistyped token is never persisted +
    // never falsely reported "enabled".
    expect(() => readFileSync(envPath, "utf8")).toThrow();
  });
});
