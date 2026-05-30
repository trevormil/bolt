import {
  createEngine as defaultCreateEngine,
  grantDefaultCapabilities,
  renderPersonaCard,
  DEFAULT_PERSONA_INSTRUCTIONS,
} from "@vellum/engine";
import {
  ensureDataDir,
  dataDir,
  upsertEnvFile,
  verifyTelegramToken,
  setAgentMnemonic,
  setTelegramBotToken,
  defaultBackend,
  type SecretBackend,
} from "@vellum/shared";
import { slug } from "./commands.ts";

// The answers the install wizard (#19) collects, and the pure setup it performs.
// Kept free of stdin/stdout so it's unit-testable; the interactive prompting
// lives in init-wizard.ts (the I/O shell), mirroring commands.ts vs repl.ts.

export interface SetupAnswers {
  // The LLM provider key. Optional — Vellum boots offline-of-cloud; the agent
  // just can't think until a key is set. Nothing else is ever hosted.
  openRouterKey?: string;
  // The master mnemonic all per-persona wallets derive from (generated fresh or
  // imported). Stored in the OS keychain (ADR-0007), never plaintext .env.
  mnemonic: string;
  personaName: string;
  // Set ONLY if the user wants the daemon reachable beyond loopback — guards
  // state-changing API routes with a bearer token.
  apiToken?: string;
  // Optional Telegram remote-control surface (#49). Telegram is the agent's
  // remote entrypoint (the bot polls OUT, so no daemon exposure is needed). When
  // set, the daemon attaches the bot on next boot. The principal chat id pins the
  // owner up front; left blank, the first chat to message the bot claims it (TOFU).
  telegramBotToken?: string;
  telegramPrincipalChatId?: string;
}

export interface SetupResult {
  personaId: string;
  address: string;
  dataDir: string;
  envPath: string;
  wroteKeys: string[]; // .env keys written (non-seed secrets only)
  seedBackend: string; // where the master seed was stored (e.g. macos-keychain)
  card: string; // the personality card (#25), ready to print
}

export interface SetupDeps {
  envPath: string; // where to persist NON-seed secrets (the repo .env Bun loads)
  createEngine?: typeof defaultCreateEngine; // injectable for tests
  // OS secret store for the master seed (ADR-0007), injectable so tests never
  // touch the real keychain. Defaults to the platform backend.
  secretBackend?: SecretBackend;
  // Telegram bot-token health-check (#74 review). Mirrors the web setup route:
  // validate via getMe before persisting so a mistyped token isn't written +
  // reported "enabled" only to silently fail at the next daemon boot. Injectable
  // so tests run offline.
  verifyTelegram?: (
    token: string,
  ) => Promise<{ ok: boolean; username?: string }>;
}

/**
 * Persist the collected secrets to .env, then create the local data dir + the
 * first persona (wallet + default capabilities) using the chosen mnemonic — so
 * the very next `vellum`/daemon process boots into a ready agent. Idempotent: a
 * persona that already exists is reused, and .env keys are merged in place.
 */
export async function runSetup(
  answers: SetupAnswers,
  deps: SetupDeps,
): Promise<SetupResult> {
  ensureDataDir();

  const updates: Record<string, string> = {};
  if (answers.openRouterKey) updates.OPENROUTER_API_KEY = answers.openRouterKey;
  if (answers.apiToken) updates.VELLUM_API_TOKEN = answers.apiToken;
  // Telegram is OPTIONAL (#49) — only persisted when a token was provided, and
  // only after a getMe health-check (#74 review): persisting an unvalidated
  // token would report "enabled" but fail to attach at the next boot.
  // The token itself goes to the OS keychain (#109 §1), not plaintext .env —
  // same shape as the agent seed; only the (non-secret) principal chat id
  // persists to .env. Token write happens AFTER all validation below to keep
  // failure paths from leaving partial state.
  let tgTokenToStore: string | undefined;
  if (answers.telegramBotToken?.trim()) {
    const token = answers.telegramBotToken.trim();
    const verify = deps.verifyTelegram ?? verifyTelegramToken;
    const tg = await verify(token);
    if (!tg.ok)
      throw new Error(
        "that Telegram bot token didn't validate — create one with @BotFather and retry",
      );
    tgTokenToStore = token;
  }
  if (answers.telegramPrincipalChatId?.trim()) {
    // Validate before writing .env (mirrors the web setup route): a non-integer
    // chat id is coerced to NaN by the env schema and would block the next boot.
    const chat = answers.telegramPrincipalChatId.trim();
    if (!/^-?[0-9]+$/.test(chat))
      throw new Error("Telegram chat id must be an integer");
    updates.TELEGRAM_PRINCIPAL_CHAT_ID = chat;
  }
  // Store the master seed in the OS keychain — never plaintext .env (ADR-0007).
  // After all validation above, so a bad Telegram token leaves no persisted state.
  // The Telegram bot token (if any) writes to the same backend (#109 §1).
  const secretBackend = deps.secretBackend ?? defaultBackend();
  await setAgentMnemonic(answers.mnemonic, secretBackend);
  if (tgTokenToStore) await setTelegramBotToken(tgTokenToStore, secretBackend);
  const wroteKeys = Object.keys(updates).length
    ? upsertEnvFile(deps.envPath, updates)
    : [];

  // Build the engine with the chosen mnemonic explicitly — the seed is in the
  // keychain but this process resolved its env once at import, so pass it directly.
  const engine = (deps.createEngine ?? defaultCreateEngine)({
    mnemonic: answers.mnemonic,
  });

  const id = slug(answers.personaName);
  if (!engine.store.getPersona(id))
    engine.store.createPersona(id, answers.personaName, {
      name: answers.personaName,
      role: "",
      voice: "",
      instructions: DEFAULT_PERSONA_INSTRUCTIONS,
    });
  const w = await engine.wallets.ensureWallet(id);
  grantDefaultCapabilities(engine.capabilities, id); // #37 baseline policy
  const persona = engine.store.getPersona(id)!;

  return {
    personaId: id,
    address: w.address,
    dataDir: dataDir(),
    envPath: deps.envPath,
    wroteKeys,
    seedBackend: secretBackend.name,
    card: renderPersonaCard(persona.soul, w.address),
  };
}
