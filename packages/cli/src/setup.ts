import {
  createEngine as defaultCreateEngine,
  grantDefaultCapabilities,
  renderPersonaCard,
} from "@vellum/engine";
import { ensureDataDir, dataDir, upsertEnvFile } from "@vellum/shared";
import { slug } from "./commands.ts";

// The answers the install wizard (#19) collects, and the pure setup it performs.
// Kept free of stdin/stdout so it's unit-testable; the interactive prompting
// lives in init-wizard.ts (the I/O shell), mirroring commands.ts vs repl.ts.

export interface SetupAnswers {
  // The LLM provider key. Optional — Vellum boots offline-of-cloud; the agent
  // just can't think until a key is set. Nothing else is ever hosted.
  openRouterKey?: string;
  // The master mnemonic all per-persona wallets derive from (generated fresh or
  // imported). Written to .env so a fresh process re-derives the same wallets.
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
  wroteKeys: string[];
  card: string; // the personality card (#25), ready to print
}

export interface SetupDeps {
  envPath: string; // where to persist secrets (the repo .env Bun auto-loads)
  createEngine?: typeof defaultCreateEngine; // injectable for tests
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

  const updates: Record<string, string> = {
    AGENT_SIGNER_MNEMONIC: answers.mnemonic,
  };
  if (answers.openRouterKey) updates.OPENROUTER_API_KEY = answers.openRouterKey;
  if (answers.apiToken) updates.VELLUM_API_TOKEN = answers.apiToken;
  // Telegram is OPTIONAL (#49) — only persisted when a token was provided.
  if (answers.telegramBotToken?.trim())
    updates.TELEGRAM_BOT_TOKEN = answers.telegramBotToken.trim();
  if (answers.telegramPrincipalChatId?.trim())
    updates.TELEGRAM_PRINCIPAL_CHAT_ID = answers.telegramPrincipalChatId.trim();
  const wroteKeys = upsertEnvFile(deps.envPath, updates);

  // Build the engine with the chosen mnemonic explicitly — env was just written
  // but the current process parsed it once at import, so pass it directly.
  const engine = (deps.createEngine ?? defaultCreateEngine)({
    mnemonic: answers.mnemonic,
  });

  const id = slug(answers.personaName);
  if (!engine.store.getPersona(id))
    engine.store.createPersona(id, answers.personaName, {
      name: answers.personaName,
      role: "personal assistant",
      voice: "friendly and concise",
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
    card: renderPersonaCard(persona.soul, w.address),
  };
}
