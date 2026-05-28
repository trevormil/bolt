import { Database } from "bun:sqlite";

/**
 * Per-persona event store (#42) — the user-facing product observability layer.
 * Distinct from @vellum/trace (developer/Langfuse tracing) and from the
 * @vellum/ledger (proof-of-action / settlement). Events here are structured,
 * append-only, and rich with latency + cost so each persona can have a
 * dashboard answering "what did you do today, what did it cost, how fast?"
 *
 * Persisted in ~/.vellum so the CLI, daemon, and web share one telemetry
 * surface. Never store raw message bodies — summaries + structured meta only.
 */

export type EventKind =
  | "chat_in" // user message received (latency = N/A; cost = 0)
  | "chat_out" // agent response sent (latency_ms = wall, costUsd, tokens)
  | "tool_call" // tool invoked (name in meta.tool, ok flag, latency)
  | "fs_op" // filesystem read/list/write (#35) — meta.op, meta.path
  | "capability" // gated action allowed/denied/asked (#37) — meta.authority
  | "task_run" // scheduled task fired (#36) — meta.taskId, ok
  | "spend" // value left a persona wallet
  | "vault_op" // vault create/withdraw
  | "error"; // unhandled error at a surface

export interface EventInput {
  personaId: string;
  kind: EventKind;
  summary: string; // human-legible one-liner, never raw bodies
  latencyMs?: number;
  costUsd?: number;
  tokens?: number;
  ok?: boolean; // for tool_call / fs_op / task_run / chat_out
  meta?: Record<string, unknown>;
}
export interface Event extends Required<Omit<EventInput, "meta">> {
  id: number;
  ts: number;
  meta: Record<string, unknown>;
}

interface EventRow {
  id: number;
  persona_id: string;
  ts: number;
  kind: string;
  summary: string;
  latency_ms: number | null;
  cost_usd: number;
  tokens: number;
  ok: number | null;
  meta: string;
}

function toEvent(r: EventRow): Event {
  return {
    id: r.id,
    personaId: r.persona_id,
    ts: r.ts,
    kind: r.kind as EventKind,
    summary: r.summary,
    latencyMs: r.latency_ms ?? 0,
    costUsd: r.cost_usd,
    tokens: r.tokens,
    ok: r.ok === null ? true : r.ok === 1,
    meta: parseMeta(r.meta),
  };
}
function parseMeta(s: string): Record<string, unknown> {
  try {
    return JSON.parse(s) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export interface EventSummaryWindow {
  events: number;
  costUsd: number;
  tokens: number;
  errors: number; // ok = false count
}
export interface EventSummary {
  byKind: Record<string, number>;
  last24h: EventSummaryWindow;
  last7d: EventSummaryWindow;
  last30d: EventSummaryWindow;
}

const DAY = 86_400_000;

export class EventStore {
  private db: Database;

  constructor(dbPath = ":memory:") {
    this.db = new Database(dbPath);
    this.db.run(`CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      persona_id TEXT NOT NULL,
      ts INTEGER NOT NULL,
      kind TEXT NOT NULL,
      summary TEXT NOT NULL,
      latency_ms INTEGER,
      cost_usd REAL NOT NULL DEFAULT 0,
      tokens INTEGER NOT NULL DEFAULT 0,
      ok INTEGER,
      meta TEXT NOT NULL DEFAULT '{}')`);
    this.db.run(
      "CREATE INDEX IF NOT EXISTS idx_events_persona_ts ON events(persona_id, ts)",
    );
    this.db.run("CREATE INDEX IF NOT EXISTS idx_events_kind ON events(kind)");
  }

  /** Append one event. Never throws on a sane input — callers want emit to be
   *  fire-and-forget; bad shapes are best caught at the call site. */
  emit(input: EventInput): Event {
    const ts = Date.now();
    const okCol = input.ok === undefined ? null : input.ok ? 1 : 0;
    const info = this.db
      .query(
        `INSERT INTO events (persona_id, ts, kind, summary, latency_ms, cost_usd, tokens, ok, meta)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.personaId,
        ts,
        input.kind,
        input.summary,
        input.latencyMs ?? null,
        input.costUsd ?? 0,
        input.tokens ?? 0,
        okCol,
        JSON.stringify(input.meta ?? {}),
      );
    return {
      id: Number(info.lastInsertRowid),
      ts,
      personaId: input.personaId,
      kind: input.kind,
      summary: input.summary,
      latencyMs: input.latencyMs ?? 0,
      costUsd: input.costUsd ?? 0,
      tokens: input.tokens ?? 0,
      ok: input.ok ?? true,
      meta: input.meta ?? {},
    };
  }

  /** Recent events for a persona, newest first. */
  recent(personaId: string, limit = 200): Event[] {
    const rows = this.db
      .query(
        "SELECT * FROM events WHERE persona_id = ? ORDER BY ts DESC LIMIT ?",
      )
      .all(personaId, limit) as EventRow[];
    return rows.map(toEvent);
  }

  /** Aggregate counters + per-window cost/error totals for the dashboard. */
  summary(personaId: string, now: number = Date.now()): EventSummary {
    const window = (sinceTs: number): EventSummaryWindow => {
      const r = this.db
        .query(
          `SELECT
             COUNT(*) AS n,
             COALESCE(SUM(cost_usd), 0) AS c,
             COALESCE(SUM(tokens), 0) AS t,
             COALESCE(SUM(CASE WHEN ok = 0 THEN 1 ELSE 0 END), 0) AS e
           FROM events WHERE persona_id = ? AND ts >= ?`,
        )
        .get(personaId, sinceTs) as {
        n: number;
        c: number;
        t: number;
        e: number;
      };
      return { events: r.n, costUsd: r.c, tokens: r.t, errors: r.e };
    };
    const byKindRows = this.db
      .query(
        "SELECT kind, COUNT(*) AS n FROM events WHERE persona_id = ? GROUP BY kind",
      )
      .all(personaId) as { kind: string; n: number }[];
    return {
      byKind: Object.fromEntries(byKindRows.map((r) => [r.kind, r.n])),
      last24h: window(now - DAY),
      last7d: window(now - 7 * DAY),
      last30d: window(now - 30 * DAY),
    };
  }

  close(): void {
    this.db.close();
  }
}
