import { env, createLogger } from "@vellum/shared";
import { createEngine } from "@vellum/engine";
import { CheckInScheduler } from "@vellum/scheduler";
import { buildBot } from "./bot.ts";
import { Recipients } from "./recipients.ts";

const log = createLogger("telegram");

// Primary surface. Starts the grammY bot (long-polling) when a token is set,
// wired to the shared engine; otherwise boots clean without Telegram creds.
if (!env.TELEGRAM_BOT_TOKEN) {
  log.info("ready · no TELEGRAM_BOT_TOKEN set (add it to .env to run the bot)");
} else {
  const engine = createEngine();
  await engine.txManager
    .reconcile()
    .catch((e) => log.warn(`reconcile failed: ${e}`));
  const recipients = new Recipients(env.VELLUM_DB_PATH);
  const bot = buildBot(env.TELEGRAM_BOT_TOKEN, engine, {
    onSeen: (chatId) => recipients.record(chatId),
  });

  // Proactive per-persona check-ins (0018): on a cadence, push any non-quiet
  // nudge to every known chat. Delivery failures are logged, never fatal.
  const scheduler = new CheckInScheduler({
    engine,
    intervalMs: env.VELLUM_CHECKIN_INTERVAL_MS,
    deliver: async (_personaId, message) => {
      for (const chatId of recipients.all()) {
        await bot.api
          .sendMessage(chatId, message)
          .catch((e) => log.warn(`check-in delivery failed: ${e}`));
      }
    },
  });
  scheduler.start();

  log.info("starting bot (long polling)…");
  void bot.start({
    onStart: (info) => log.info(`bot online as @${info.username}`),
  });
}
