import {
  env,
  createLogger,
  ensureDataDir,
  migrateLegacyDb,
} from "@vellum/shared";
import { createEngine, McpServers, GLOBAL } from "@vellum/engine";
import { buildApp, webServeOptions, isLoopback } from "@vellum/web";
import { TelegramController } from "@vellum/telegram";

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
  // .env perms boot check (#115 §3). The file holds the OpenRouter key and
  // (post-ADR-0007) at worst the Telegram bot token + a tertiary
  // VELLUM_API_TOKEN. upsertEnvFile chmods to 600 on every write, but a
  // pre-existing .env copied with a default 644 umask never gets touched
  // until someone calls the rotate route. Auto-tighten + log a warning at
  // boot so the perms are honest from the first start.
  try {
    const { statSync, chmodSync } = await import("node:fs");
    const envPath = `${process.cwd()}/.env`;
    const st = statSync(envPath);
    const mode = st.mode & 0o777;
    if (mode & 0o077) {
      log.warn(
        `.env perms ${mode.toString(8)} are world/group-readable — auto-tightening to 600`,
      );
      chmodSync(envPath, 0o600);
    }
  } catch {
    // No .env to check (fresh install before /api/setup runs) — fine.
  }

  const engine = createEngine();
  // Boot-time recovery (#99 §2): mark crashed `submitting` rows so the
  // per-persona durable guard releases — otherwise a process death between
  // the durable INSERT and the hash recording locks the wallet forever.
  await engine.txManager
    .recoverStuckSubmitting()
    .catch((e) => log.warn(`recoverStuckSubmitting failed: ${e}`));
  // Reconcile leftover PENDING txs against the chain before serving (§13.5).
  await engine.txManager
    .reconcile()
    .catch((e) => log.warn(`reconcile failed: ${e}`));
  // Keep draining PENDING txs while we run (#81): the initial out-of-band confirm
  // gives up after ~20s, so a withdrawal that commits later would otherwise sit
  // PENDING — and freeze the persona's next tx (the durable guard) — until the
  // next restart. This sweep re-confirms stale-pending rows on a cadence so they
  // settle on their own.
  const stopAutoReconcile = engine.txManager.startAutoReconcile();

  // Web/PWA server. Fail closed: never bind beyond loopback without a token.
  if (!isLoopback(env.WEB_HOST) && !env.VELLUM_API_TOKEN) {
    log.error(
      `refusing to bind ${env.WEB_HOST} without VELLUM_API_TOKEN — set a token to expose the API`,
    );
    process.exit(1);
  }
  // Telegram is the agent's proactive channel when configured. The controller
  // owns the live poller so the web routes (/api/setup, Settings) can start or
  // stop it without a daemon restart (#74) — handed to buildApp as the hot-
  // attach hook below.
  const telegram = new TelegramController(engine);
  const opts = webServeOptions(
    buildApp(engine, undefined, undefined, undefined, { telegram }),
  );
  Bun.serve(opts);
  log.info(`web · http://${opts.hostname}:${opts.port}`);

  // Recurring prompts are scheduled externally via OS cron
  // (docs/runbooks/schedule-with-cron.md).
  if (env.TELEGRAM_BOT_TOKEN) {
    await telegram.attach(env.TELEGRAM_BOT_TOKEN);
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
      stopAutoReconcile();
      void engine.mcp.closeAll().finally(() => process.exit(0));
    });

  log.info(
    "vellum daemon ready · web" + (env.TELEGRAM_BOT_TOKEN ? " + telegram" : ""),
  );
}

if (import.meta.main) {
  await startDaemon();
}
