import { env, createLogger } from "@vellum/shared";
import type { Engine } from "@vellum/engine";
import { CheckInScheduler, TaskScheduler } from "@vellum/scheduler";
import { Bot } from "grammy";
import { buildBot } from "./bot.ts";
import { Recipients } from "./recipients.ts";

const log = createLogger("telegram");

/**
 * Attach the Telegram surface to an already-built engine: principal allowlist
 * (#28), proactive schedulers (#18 check-ins, #36 tasks) delivering to the
 * principal only, and the long-polling bot. Shared by the standalone Telegram
 * entry and the unified local daemon (#31) so both drive ONE engine + one
 * ~/.vellum DB. Returns the running bot (caller may stop it).
 */
export function attachTelegram(engine: Engine, token: string): Bot {
  const recipients = new Recipients(env.VELLUM_DB_PATH);
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
  });

  // Proactive output goes ONLY to the principal — never broadcast (#36 leak).
  const deliverToPrincipal = async (_personaId: string, message: string) => {
    const chatId = recipients.principal();
    if (chatId === null) return;
    await bot.api
      .sendMessage(chatId, message)
      .catch((e) => log.warn(`proactive delivery failed: ${e}`));
  };
  new CheckInScheduler({
    engine,
    intervalMs: env.VELLUM_CHECKIN_INTERVAL_MS,
    deliver: deliverToPrincipal,
  }).start();
  new TaskScheduler({ engine, deliver: deliverToPrincipal }).start();

  log.info("starting bot (long polling)…");
  void bot.start({
    onStart: (info) => log.info(`bot online as @${info.username}`),
  });
  return bot;
}
