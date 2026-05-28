import {
  env,
  createLogger,
  ensureDataDir,
  migrateLegacyDb,
} from "@vellum/shared";
import { createEngine } from "@vellum/engine";
import { buildApp, webServeOptions, isLoopback } from "@vellum/web";
import { attachTelegram } from "@vellum/telegram";

const log = createLogger("daemon");

/**
 * The unified local daemon (#31). One engine + one ~/.vellum DB hosting all
 * three long-running surfaces — the web/PWA server, the Telegram long-poller,
 * and the schedulers (#18 check-ins, #36 tasks) — in a single process so they
 * share state without coordinating over the DB from separate processes.
 *
 * Local-only: binds loopback by default; the only outbound call is OpenRouter.
 * Autostart is handled by the launchd/systemd units (service.ts + install
 * script), which run this entry with KeepAlive/Restart.
 */
export async function startDaemon(): Promise<void> {
  ensureDataDir();
  if (migrateLegacyDb(env.VELLUM_DB_PATH))
    log.info("migrated legacy ./vellum.db → " + env.VELLUM_DB_PATH);

  const engine = createEngine();
  // Reconcile leftover PENDING txs against the chain before serving (§13.5).
  await engine.txManager
    .reconcile()
    .catch((e) => log.warn(`reconcile failed: ${e}`));

  // Web/PWA server. Fail closed: never bind beyond loopback without a token.
  if (!isLoopback(env.WEB_HOST) && !env.VELLUM_API_TOKEN) {
    log.error(
      `refusing to bind ${env.WEB_HOST} without VELLUM_API_TOKEN — set a token to expose the API`,
    );
    process.exit(1);
  }
  const opts = webServeOptions(buildApp(engine));
  Bun.serve(opts);
  log.info(`web · http://${opts.hostname}:${opts.port}`);

  // Telegram surface + schedulers (only if a token is configured). The
  // schedulers start inside attachTelegram; without a token there is no
  // delivery channel, so they're not started (a CLI-only run uses the web UI).
  if (env.TELEGRAM_BOT_TOKEN) {
    attachTelegram(engine, env.TELEGRAM_BOT_TOKEN);
  } else {
    log.info("telegram · no TELEGRAM_BOT_TOKEN (web-only daemon)");
  }

  log.info(
    "vellum daemon ready · scheduler + web" +
      (env.TELEGRAM_BOT_TOKEN ? " + telegram" : ""),
  );
}

if (import.meta.main) {
  await startDaemon();
}
