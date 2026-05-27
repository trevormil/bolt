import { Database } from "bun:sqlite";
import type { Meter } from "@vellum/llm";
import { createLogger } from "@vellum/shared";

const log = createLogger("ledger");

// Proof-of-action: every tool call, spend, vault op, and funding event is logged
// to a legible, append-only ledger — who/what/authority/cost. There is no update
// or delete method: entries are immutable once written. Surfaced as Telegram
// summaries and the web full view.
export type LedgerKind =
  | "message" // an agent turn answered the user
  | "tool_call" // a tool was invoked
  | "spend" // value left a persona wallet
  | "vault_op" // vault create/config/spend
  | "funding"; // value entered a persona wallet

export interface LedgerInput {
  personaId: string;
  kind: LedgerKind;
  summary: string; // human-legible one-liner
  authority: string; // who authorized: "agent" | "human" | "rule:vault" | …
  costUsd?: number;
  tokens?: number;
  txHash?: string; // on-chain actions
  meta?: Record<string, unknown>;
}
export interface LedgerEntry
  extends Required<Omit<LedgerInput, "txHash" | "meta">> {
  id: number;
  ts: number;
  txHash: string | null;
  meta: Record<string, unknown>;
}
export interface LedgerSummary {
  entries: number;
  totalCostUsd: number;
  totalTokens: number;
  byKind: Record<string, number>;
}

interface LedgerRow {
  id: number;
  persona_id: string;
  ts: number;
  kind: string;
  summary: string;
  authority: string;
  cost_usd: number;
  tokens: number;
  tx_hash: string | null;
  meta: string;
}

function toEntry(r: LedgerRow): LedgerEntry {
  return {
    id: r.id,
    personaId: r.persona_id,
    ts: r.ts,
    kind: r.kind as LedgerKind,
    summary: r.summary,
    authority: r.authority,
    costUsd: r.cost_usd,
    tokens: r.tokens,
    txHash: r.tx_hash,
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

export class Ledger {
  private db: Database;

  constructor(dbPath = ":memory:") {
    this.db = new Database(dbPath);
    this.db.run(`CREATE TABLE IF NOT EXISTS ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      persona_id TEXT NOT NULL,
      ts INTEGER NOT NULL,
      kind TEXT NOT NULL,
      summary TEXT NOT NULL,
      authority TEXT NOT NULL,
      cost_usd REAL NOT NULL DEFAULT 0,
      tokens INTEGER NOT NULL DEFAULT 0,
      tx_hash TEXT,
      meta TEXT NOT NULL DEFAULT '{}')`);
    this.db.run(
      "CREATE INDEX IF NOT EXISTS idx_ledger_persona_ts ON ledger(persona_id, ts)",
    );
  }

  /** Append one immutable entry. */
  record(input: LedgerInput): LedgerEntry {
    const ts = Date.now();
    const info = this.db
      .query(
        `INSERT INTO ledger (persona_id, ts, kind, summary, authority, cost_usd, tokens, tx_hash, meta)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.personaId,
        ts,
        input.kind,
        input.summary,
        input.authority,
        input.costUsd ?? 0,
        input.tokens ?? 0,
        input.txHash ?? null,
        JSON.stringify(input.meta ?? {}),
      );
    log.info(
      `+${input.kind} · ${input.personaId} · $${(input.costUsd ?? 0).toFixed(6)}`,
    );
    return {
      id: Number(info.lastInsertRowid),
      ts,
      personaId: input.personaId,
      kind: input.kind,
      summary: input.summary,
      authority: input.authority,
      costUsd: input.costUsd ?? 0,
      tokens: input.tokens ?? 0,
      txHash: input.txHash ?? null,
      meta: input.meta ?? {},
    };
  }

  /**
   * Surfacing hook: record an agent turn's metered cost (0005 Meter[]) as one
   * legible ledger entry. Sums tokens + $ across the turn's model round-trips.
   */
  recordAgentRun(
    personaId: string,
    summary: string,
    meters: Meter[],
  ): LedgerEntry {
    const costUsd = meters.reduce((n, m) => n + m.costUsd, 0);
    const tokens = meters.reduce((n, m) => n + m.totalTokens, 0);
    return this.record({
      personaId,
      kind: "message",
      summary,
      authority: "agent",
      costUsd,
      tokens,
    });
  }

  list(
    opts: { personaId?: string; kind?: LedgerKind; limit?: number } = {},
  ): LedgerEntry[] {
    const where: string[] = [];
    const params: (string | number)[] = [];
    if (opts.personaId) {
      where.push("persona_id = ?");
      params.push(opts.personaId);
    }
    if (opts.kind) {
      where.push("kind = ?");
      params.push(opts.kind);
    }
    const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
    params.push(opts.limit ?? 100);
    const rows = this.db
      .query(`SELECT * FROM ledger ${clause} ORDER BY ts DESC, id DESC LIMIT ?`)
      .all(...params) as LedgerRow[];
    return rows.map(toEntry);
  }

  /** Aggregate totals (all entries, not limited) for summaries + dashboards. */
  summary(personaId?: string): LedgerSummary {
    const clause = personaId ? "WHERE persona_id = ?" : "";
    const args = personaId ? [personaId] : [];
    const totals = this.db
      .query(
        `SELECT COUNT(*) AS n, COALESCE(SUM(cost_usd),0) AS c, COALESCE(SUM(tokens),0) AS t FROM ledger ${clause}`,
      )
      .get(...args) as { n: number; c: number; t: number };
    const kinds = this.db
      .query(`SELECT kind, COUNT(*) AS n FROM ledger ${clause} GROUP BY kind`)
      .all(...args) as { kind: string; n: number }[];
    return {
      entries: totals.n,
      totalCostUsd: totals.c,
      totalTokens: totals.t,
      byKind: Object.fromEntries(kinds.map((k) => [k.kind, k.n])),
    };
  }

  close(): void {
    this.db.close();
  }
}
