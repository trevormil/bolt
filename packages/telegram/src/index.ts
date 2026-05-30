import {
  env,
  createLogger,
  ensureDataDir,
  migrateLegacyDb,
  getTelegramBotToken,
} from "@vellum/shared";
import { createEngine } from "@vellum/engine";
import { attachTelegram } from "./attach.ts";

export { attachTelegram } from "./attach.ts";
export { buildBot, type BotOptions, BOT_COMMANDS } from "./bot.ts";
export {
  TelegramController,
  type StoppableBot,
  type AttachFn,
} from "./controller.ts";
export { Recipients } from "./recipients.ts";
export { Sessions } from "./sessions.ts";

const log = createLogger("telegram");

// Standalone Telegram entry. Starts the grammY bot (long-polling) when a token
// is set, wired to the shared engine; otherwise boots clean without creds.
// The unified daemon (#31) calls attachTelegram() against its own engine.
if (import.meta.main) {
  const token = await getTelegramBotToken();
  if (!token) {
    log.info(
      "ready · no Telegram bot token (set via `vellum init` or migrate plaintext via `vellum keys migrate-telegram`)",
    );
  } else {
    ensureDataDir();
    if (migrateLegacyDb(env.VELLUM_DB_PATH))
      log.info("migrated legacy ./vellum.db → " + env.VELLUM_DB_PATH);
    const engine = createEngine();
    await engine.txManager
      .reconcile()
      .catch((e) => log.warn(`reconcile failed: ${e}`));
    attachTelegram(engine, token);
  }
}
