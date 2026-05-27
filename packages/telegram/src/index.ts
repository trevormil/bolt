import { env, createLogger } from "@vellum/shared";
import { createEngine } from "@vellum/engine";
import { buildBot } from "./bot.ts";

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
  const bot = buildBot(env.TELEGRAM_BOT_TOKEN, engine);
  log.info("starting bot (long polling)…");
  void bot.start({
    onStart: (info) => log.info(`bot online as @${info.username}`),
  });
}
