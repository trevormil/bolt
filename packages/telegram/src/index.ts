import {
  env,
  createLogger,
  ensureDataDir,
  migrateLegacyDb,
} from "@vellum/shared";
import { createEngine } from "@vellum/engine";
import { attachTelegram } from "./attach.ts";

export { attachTelegram } from "./attach.ts";
export { buildBot, type BotOptions } from "./bot.ts";
export { Recipients } from "./recipients.ts";

const log = createLogger("telegram");

// Standalone Telegram entry. Starts the grammY bot (long-polling) when a token
// is set, wired to the shared engine; otherwise boots clean without creds.
// The unified daemon (#31) calls attachTelegram() against its own engine.
if (import.meta.main) {
  if (!env.TELEGRAM_BOT_TOKEN) {
    log.info(
      "ready · no TELEGRAM_BOT_TOKEN set (add it to .env to run the bot)",
    );
  } else {
    ensureDataDir();
    if (migrateLegacyDb(env.VELLUM_DB_PATH))
      log.info("migrated legacy ./vellum.db → " + env.VELLUM_DB_PATH);
    const engine = createEngine();
    await engine.txManager
      .reconcile()
      .catch((e) => log.warn(`reconcile failed: ${e}`));
    attachTelegram(engine, env.TELEGRAM_BOT_TOKEN);
  }
}
