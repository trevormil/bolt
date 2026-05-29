import type { Engine } from "@vellum/engine";
import { createLogger } from "@vellum/shared";
import { attachTelegram } from "./attach.ts";

const log = createLogger("telegram");

// The slice of grammy's Bot the controller drives. Keeping it structural lets
// attach be injected with a fake in tests (no network / no real bot).
export type StoppableBot = { stop(): Promise<void> };
export type AttachFn = (engine: Engine, token: string) => StoppableBot;

/**
 * Owns the live long-poller so the web surface can start/stop Telegram WITHOUT a
 * daemon restart (#74). Before this, a token set via /api/setup or Settings only
 * connected on the next daemon boot (attachTelegram reads env at start). Now the
 * route calls attach(token) and the bot connects immediately.
 *
 * Single-bot invariant: attach() stops any prior bot before starting a new one,
 * so two long-pollers never race for the same getUpdates offset (which Telegram
 * answers with 409 Conflict). Idempotent + safe to call repeatedly.
 */
export class TelegramController {
  private bot: StoppableBot | null = null;
  // Guards against interleaved attach/detach calls racing on `this.bot`.
  private pending: Promise<void> = Promise.resolve();

  constructor(
    private readonly engine: Engine,
    private readonly attachFn: AttachFn = attachTelegram,
  ) {}

  isRunning(): boolean {
    return this.bot !== null;
  }

  // (Re)start the poller with `token`. Stops any running bot first.
  attach(token: string): Promise<void> {
    return this.serialize(async () => {
      await this.stopCurrent();
      this.bot = this.attachFn(this.engine, token);
      log.info("telegram hot-attached");
    });
  }

  // Stop the poller if running. No-op when already detached.
  detach(): Promise<void> {
    return this.serialize(() => this.stopCurrent());
  }

  private async stopCurrent(): Promise<void> {
    const bot = this.bot;
    if (!bot) return;
    this.bot = null;
    await bot.stop().catch((e) => log.warn(`bot stop failed: ${e}`));
  }

  // Chain operations so a detach can't interleave with an in-flight attach.
  private serialize(op: () => Promise<void>): Promise<void> {
    const next = this.pending.then(op, op);
    // Swallow rejection on the chain pointer so one failure doesn't poison the
    // queue; the returned promise still surfaces the error to the caller.
    this.pending = next.catch(() => {});
    return next;
  }
}
