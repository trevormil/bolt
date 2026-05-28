import { chat, type Engine } from "@vellum/engine";
import { createLogger } from "@vellum/shared";

const log = createLogger("scheduler");

export interface TaskSchedulerDeps {
  engine: Engine;
  deliver: (personaId: string, message: string) => void | Promise<void>;
  intervalMs?: number; // tick cadence (default 60s)
}

/**
 * Runs agent-settable scheduled tasks (#36): on each tick, any due task is run
 * through engine.chat against its persona and the reply delivered. runDue() is
 * the unit-testable core (pass a clock); start() is a thin timer over it. Each
 * task's nextRun is advanced even on error, so a failing task can't hot-loop.
 */
export class TaskScheduler {
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly intervalMs: number;

  constructor(private readonly deps: TaskSchedulerDeps) {
    this.intervalMs = deps.intervalMs ?? 60_000;
  }

  async runDue(now = Date.now()): Promise<number> {
    const due = this.deps.engine.tasks.due(now);
    for (const t of due) {
      try {
        const r = await chat(this.deps.engine, {
          conversationId: `task:${t.id}`,
          personaId: t.personaId,
          message: t.prompt,
          // T-13: proactive runs are read-only unless the task is armed, so an
          // unattended schedule can't move money without explicit opt-in.
          readOnly: !t.armed,
        });
        await this.deps.deliver(
          t.personaId,
          `⏰ ${t.prompt.slice(0, 60)}\n${r.reply}`,
        );
        // task_run telemetry (#42): emit success only AFTER delivery succeeds,
        // so a delivery failure (caught below as ok:false) can't also leave an
        // ok:true record for the same run (!46 review).
        this.deps.engine.events.emit({
          personaId: t.personaId,
          kind: "task_run",
          summary: `scheduled: ${t.prompt.slice(0, 60)}`,
          ok: true,
          meta: { taskId: t.id, armed: t.armed },
        });
      } catch (e) {
        log.warn(`task ${t.id.slice(0, 8)} failed: ${e}`);
        this.deps.engine.events.emit({
          personaId: t.personaId,
          kind: "task_run",
          summary: `scheduled (failed): ${t.prompt.slice(0, 60)}`,
          ok: false,
          meta: { taskId: t.id, armed: t.armed },
        });
      }
      this.deps.engine.tasks.markRan(t.id, now);
    }
    if (due.length) log.info(`ran ${due.length} scheduled task(s)`);
    return due.length;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.runDue().catch((e) => log.warn(`task tick failed: ${e}`));
    }, this.intervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
