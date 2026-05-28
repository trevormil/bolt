import {
  env,
  createLogger,
  ensureDataDir,
  migrateLegacyDb,
} from "@vellum/shared";
import { createEngine } from "@vellum/engine";
import { CheckInScheduler, TaskScheduler } from "@vellum/scheduler";
import { buildBot } from "./bot.ts";
import { Recipients } from "./recipients.ts";

const log = createLogger("telegram");

// Primary surface. Starts the grammY bot (long-polling) when a token is set,
// wired to the shared engine; otherwise boots clean without Telegram creds.
if (!env.TELEGRAM_BOT_TOKEN) {
  log.info("ready · no TELEGRAM_BOT_TOKEN set (add it to .env to run the bot)");
} else {
  // Filesystem-first (#39): ensure ~/.vellum exists + migrate a legacy ./vellum.db.
  ensureDataDir();
  if (migrateLegacyDb(env.VELLUM_DB_PATH))
    log.info("migrated legacy ./vellum.db → " + env.VELLUM_DB_PATH);
  const engine = createEngine();
  await engine.txManager
    .reconcile()
    .catch((e) => log.warn(`reconcile failed: ${e}`));
  const recipients = new Recipients(env.VELLUM_DB_PATH);
  // Principal allowlist (#28): if a chat id is configured, only it may drive the
  // bot. Otherwise the first chat to interact claims ownership (TOFU) and every
  // later chat is refused — Vellum serves exactly one owner.
  const configured = env.TELEGRAM_PRINCIPAL_CHAT_ID ?? null;
  const authorizeChat = (chatId: number): boolean => {
    if (configured !== null) return chatId === configured;
    const principal = recipients.principal();
    if (principal === null) {
      recipients.record(chatId); // first contact claims ownership
      return true;
    }
    return chatId === principal;
  };
  const bot = buildBot(env.TELEGRAM_BOT_TOKEN, engine, {
    onSeen: (chatId) => recipients.record(chatId),
    authorizeChat,
  });

  // Proactive output (check-ins #18, scheduled tasks #36) goes ONLY to the
  // principal (the owner) — never broadcast to every chat that messaged the bot,
  // so one persona's output can't leak to a stranger (#36 privacy finding).
  const deliverToPrincipal = async (_personaId: string, message: string) => {
    const chatId = recipients.principal();
    if (chatId === null) return; // no principal yet — nothing to deliver to
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

  // Agent-settable scheduled tasks (#36): run due tasks + deliver to all chats.
  const deliverToAll = async (_personaId: string, message: string) => {
    for (const chatId of recipients.all()) {
      await bot.api
        .sendMessage(chatId, message)
        .catch((e) => log.warn(`task delivery failed: ${e}`));
    }
  };
  new TaskScheduler({ engine, deliver: deliverToAll }).start();

  log.info("starting bot (long polling)…");
  void bot.start({
    onStart: (info) => log.info(`bot online as @${info.username}`),
  });
}
