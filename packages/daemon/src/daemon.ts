import {
  env,
  createLogger,
  ensureDataDir,
  migrateLegacyDb,
} from "@vellum/shared";
import { createEngine, McpServers, GLOBAL } from "@vellum/engine";
import { buildApp, webServeOptions, isLoopback } from "@vellum/web";
import { attachTelegram } from "@vellum/telegram";

const log = createLogger("daemon");

/**
 * The unified local daemon (#31). One engine + one ~/.vellum DB hosting the
 * long-running surfaces — the web/PWA server and the Telegram long-poller — in a
 * single process so they share state without coordinating over the DB from
 * separate processes. (Recurring runs are scheduled via OS cron now — see
 * docs/runbooks/schedule-with-cron.md.)
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

  // Telegram is the agent's proactive channel when configured; otherwise the
  // daemon serves the web/PWA surface only. Recurring prompts are scheduled
  // externally via OS cron (docs/runbooks/schedule-with-cron.md).
  if (env.TELEGRAM_BOT_TOKEN) {
    attachTelegram(engine, env.TELEGRAM_BOT_TOKEN);
  } else {
    log.info("telegram · no TELEGRAM_BOT_TOKEN (web-only daemon)");
  }

  // MCP servers (#46): warm the GLOBAL set once at startup so the connections
  // are alive before the first chat turn (persona-specific overrides connect
  // lazily on that persona's first turn and are then pooled too). A server that
  // fails to connect is logged + skipped inside the manager — never fatal.
  const globalMcp = McpServers.get(engine.settings, GLOBAL).value;
  if (globalMcp.length) {
    const n = await engine.mcp.warm(globalMcp);
    log.info(`mcp · warmed ${n}/${globalMcp.length} global server(s)`);
  }
  // Close MCP child processes on shutdown so they don't orphan when launchd
  // stops us. Best-effort + idempotent (closeAll clears its own state).
  for (const sig of ["SIGTERM", "SIGINT"] as const)
    process.once(sig, () => {
      void engine.mcp.closeAll().finally(() => process.exit(0));
    });

  log.info(
    "vellum daemon ready · web" + (env.TELEGRAM_BOT_TOKEN ? " + telegram" : ""),
  );
}

if (import.meta.main) {
  await startDaemon();
}
