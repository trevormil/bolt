import type { Engine } from "@vellum/engine";
import { createLogger } from "@vellum/shared";
import { checkIn, formatCheckIn, type CheckInOptions } from "./checkin.ts";

const log = createLogger("scheduler");

export type Deliver = (
  personaId: string,
  message: string,
) => void | Promise<void>;

export interface SchedulerDeps {
  engine: Engine;
  deliver: Deliver; // how a nudge reaches the human (e.g. Telegram sendMessage)
  intervalMs?: number; // default 6h
  listPersonas?: () => string[]; // default: all personas in the store
  checkInOptions?: CheckInOptions;
  checkInFn?: typeof checkIn; // injectable for tests
}

/**
 * Light per-persona check-in scheduler (0018). On a cadence, runs each persona's
 * check-in and delivers only the non-quiet ones. The timer is a thin wrapper over
 * runOnce(), which is the unit-testable core (no real timers needed in tests).
 */
export class CheckInScheduler {
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly intervalMs: number;
  private readonly checkInFn: typeof checkIn;

  constructor(private readonly deps: SchedulerDeps) {
    this.intervalMs = deps.intervalMs ?? 6 * 60 * 60 * 1000;
    this.checkInFn = deps.checkInFn ?? checkIn;
  }

  private personas(): string[] {
    return (
      this.deps.listPersonas?.() ??
      this.deps.engine.store.listPersonas().map((p) => p.id)
    );
  }

  /** One pass over all personas. Returns how many nudges were delivered. */
  async runOnce(): Promise<number> {
    let delivered = 0;
    for (const id of this.personas()) {
      const ci = await this.checkInFn(
        this.deps.engine,
        id,
        this.deps.checkInOptions ?? {},
      );
      if (!ci) continue;
      const persona = this.deps.engine.store.getPersona(id);
      await this.deps.deliver(id, formatCheckIn(ci, persona?.soul.name ?? id));
      delivered++;
    }
    if (delivered) log.info(`delivered ${delivered} check-in(s)`);
    return delivered;
  }

  start(): void {
    if (this.timer) return;
    log.info(`check-ins every ${Math.round(this.intervalMs / 60000)}m`);
    // Unref so a running scheduler never keeps the process alive on its own.
    this.timer = setInterval(() => {
      void this.runOnce().catch((e) => log.warn(`check-in pass failed: ${e}`));
    }, this.intervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
