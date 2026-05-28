import { env, createLogger } from "@vellum/shared";
import type { Engine } from "@vellum/engine";
import { Bot } from "grammy";
import { buildBot } from "./bot.ts";
import { Recipients } from "./recipients.ts";
import { Sessions } from "./sessions.ts";

const log = createLogger("telegram");

/**
 * Attach the Telegram surface to an already-built engine: principal allowlist
 * (#28) and the long-polling bot. Shared by the standalone Telegram entry and
 * the unified local daemon (#31) so both drive ONE engine + one ~/.vellum DB.
 * Returns the running bot (caller may stop it).
 */
export function attachTelegram(engine: Engine, token: string): Bot {
  const recipients = new Recipients(env.VELLUM_DB_PATH);
  // Per-chat active-persona selection (#49), persisted in the same ~/.vellum DB
  // so /switch survives a restart. One operator drives multiple compartments.
  const sessions = new Sessions(env.VELLUM_DB_PATH);
  // Principal allowlist (#28): a configured chat id pins the owner; otherwise
  // the first chat to interact claims ownership (TOFU), later chats refused.
  const configured = env.TELEGRAM_PRINCIPAL_CHAT_ID ?? null;
  const authorizeChat = (chatId: number): boolean => {
    if (configured !== null) return chatId === configured;
    const principal = recipients.principal();
    if (principal === null) {
      recipients.record(chatId);
      return true;
    }
    return chatId === principal;
  };
  const bot = buildBot(token, engine, {
    onSeen: (chatId) => recipients.record(chatId),
    authorizeChat,
    sessions,
  });

  // TODO(#24 T-06): second-channel high-value-spend approval. When the
  // capability gate returns "ask" for a spend, the engine calls its `approve`
  // callback; the natural remote approver is a Telegram yes/no to the principal
  // chat here. DEFERRED — T-06 (the "ask"/threshold policy + engine approver
  // wiring) isn't built yet, so there is intentionally no approver injected. All
  // money paths today are gated default-allow/deny via grants (#37); wiring a
  // half-built approve prompt would fake a confirmation flow that nothing emits.

  log.info("starting bot (long polling)…");
  void bot.start({
    onStart: (info) => log.info(`bot online as @${info.username}`),
  });
  return bot;
}
