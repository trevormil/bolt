import { Database } from "bun:sqlite";
import { randomUUID } from "node:crypto";

// Agent-settable scheduled tasks (#36) — local cron, persisted in ~/.vellum so
// they survive restarts and the daemon (#31) runs them. Generalizes the
// hardcoded check-in (#18) to arbitrary recurring tasks the agent or user
// defines. A task is a prompt run against a persona on an interval; setting one
// is capability-gated (#37 "schedule"); running it goes through engine.chat, so
// any FS/spend the agent does still hits its own gates.
//
// Schedule model: a recurring interval (ms). Cron-expression parsing is a
// follow-up; interval covers the MVP without a parser dependency.
export interface Task {
  id: string;
  personaId: string;
  prompt: string;
  intervalMs: number;
  nextRun: number;
  enabled: boolean;
  // Armed (#24 / T-13): a scheduled run is read-only (no value-moving vault
  // tools) UNLESS armed. Default false — the human opts a recurring task into
  // money-moving authority explicitly.
  armed: boolean;
  created: number;
}

interface Row {
  id: string;
  persona_id: string;
  prompt: string;
  interval_ms: number;
  next_run: number;
  enabled: number;
  armed: number;
  created: number;
}
const toTask = (r: Row): Task => ({
  id: r.id,
  personaId: r.persona_id,
  prompt: r.prompt,
  intervalMs: r.interval_ms,
  nextRun: r.next_run,
  enabled: r.enabled === 1,
  armed: r.armed === 1,
  created: r.created,
});

export class TaskStore {
  private db: Database;

  constructor(dbPath = ":memory:") {
    this.db = new Database(dbPath);
    this.db.run(`CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      persona_id TEXT NOT NULL,
      prompt TEXT NOT NULL,
      interval_ms INTEGER NOT NULL,
      next_run INTEGER NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      armed INTEGER NOT NULL DEFAULT 0,
      created INTEGER NOT NULL)`);
    // Migrate pre-#24 DBs that lack the `armed` column (default 0 = read-only).
    const cols = this.db.query("PRAGMA table_info(tasks)").all() as {
      name: string;
    }[];
    if (!cols.some((c) => c.name === "armed"))
      this.db.run(
        "ALTER TABLE tasks ADD COLUMN armed INTEGER NOT NULL DEFAULT 0",
      );
  }

  create(input: {
    personaId: string;
    prompt: string;
    intervalMs: number;
    armed?: boolean;
    now?: number;
  }): Task {
    const id = randomUUID();
    const now = input.now ?? Date.now();
    this.db
      .query(
        `INSERT INTO tasks (id, persona_id, prompt, interval_ms, next_run, enabled, armed, created)
         VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
      )
      .run(
        id,
        input.personaId,
        input.prompt,
        input.intervalMs,
        now + input.intervalMs,
        input.armed ? 1 : 0,
        now,
      );
    return this.get(id)!;
  }

  get(id: string): Task | null {
    const r = this.db
      .query("SELECT * FROM tasks WHERE id = ?")
      .get(id) as Row | null;
    return r ? toTask(r) : null;
  }

  list(personaId?: string): Task[] {
    const rows = (
      personaId
        ? this.db
            .query("SELECT * FROM tasks WHERE persona_id = ? ORDER BY created")
            .all(personaId)
        : this.db.query("SELECT * FROM tasks ORDER BY created").all()
    ) as Row[];
    return rows.map(toTask);
  }

  /** Enabled tasks whose nextRun is due (<= now). */
  due(now = Date.now()): Task[] {
    return (
      this.db
        .query(
          "SELECT * FROM tasks WHERE enabled = 1 AND next_run <= ? ORDER BY next_run",
        )
        .all(now) as Row[]
    ).map(toTask);
  }

  /** Advance a task's nextRun after a run (recurring). */
  markRan(id: string, now = Date.now()): void {
    const t = this.get(id);
    if (!t) return;
    this.db
      .query("UPDATE tasks SET next_run = ? WHERE id = ?")
      .run(now + t.intervalMs, id);
  }

  setEnabled(id: string, enabled: boolean): void {
    this.db
      .query("UPDATE tasks SET enabled = ? WHERE id = ?")
      .run(enabled ? 1 : 0, id);
  }

  delete(id: string): void {
    this.db.query("DELETE FROM tasks WHERE id = ?").run(id);
  }

  close(): void {
    this.db.close();
  }
}
