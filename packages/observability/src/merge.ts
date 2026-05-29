import type { Event } from "./events.ts";

// Unifies the two observability surfaces into ONE timeline (#95). The event
// store is the spine (the complete operational record: chat, fs, capability,
// tool, error, latency, ok). The ledger contributes the accountability lens it
// alone has — `authority` + on-chain `txHash`. A settlement ledger row (one with
// a txHash) is ALWAYS kept: it carries on-chain truth no event holds. A ledger
// row WITHOUT a txHash (e.g. the per-turn "message" cost entry) is dropped when
// an event already represents it, so the feed isn't redundant. Everything else
// from both sources is kept and tagged by source.

export type ObservabilitySource = "event" | "ledger";

export interface UnifiedRow {
  id: string; // "ev:<n>" | "lg:<n>" — source-prefixed so ids never collide
  ts: number;
  kind: string; // original kind (for the badge)
  summary: string;
  source: ObservabilitySource;
  latencyMs?: number;
  costUsd: number;
  tokens: number;
  ok?: boolean;
  authority?: string; // settlement attribution (ledger only)
  txHash?: string | null; // on-chain settlement (ledger only)
  meta: Record<string, unknown>;
}

// Structural shape of a ledger entry — declared here so @vellum/observability
// needn't depend on @vellum/ledger (one-way: the merge consumes ledger data).
export interface LedgerLike {
  id: number;
  ts: number;
  kind: string;
  summary: string;
  authority: string;
  costUsd: number;
  tokens: number;
  txHash: string | null;
}

// Collapse the two kind vocabularies to a common key for dedup correlation.
// Only the kinds that genuinely overlap map together; everything else stays
// unique so it can never be mistaken for a duplicate.
function matchKey(kind: string): string {
  switch (kind) {
    case "chat_out":
    case "message":
      return "chat";
    case "tool_call":
      return "tool_call";
    case "capability":
      return "capability";
    case "spend":
      return "spend";
    case "vault_op":
      return "vault_op";
    case "funding":
      return "funding";
    default:
      return `event:${kind}`; // chat_in / fs_op / task_run / error — never dedup
  }
}

const DEFAULT_WINDOW_MS = 10_000;

export interface MergeOpts {
  windowMs?: number; // dedup proximity for a non-settlement ledger row
}

/**
 * Merge events + ledger entries into one source-tagged, newest-first timeline.
 * - Every event becomes a row (source: "event").
 * - A ledger row WITH a txHash is always kept (settlement truth, source: "ledger").
 * - A ledger row WITHOUT a txHash is kept only if no event of the same matchKey
 *   sits within `windowMs` of it — otherwise the event already represents it.
 */
export function mergeObservability(
  events: Event[],
  ledger: LedgerLike[],
  opts: MergeOpts = {},
): UnifiedRow[] {
  const windowMs = opts.windowMs ?? DEFAULT_WINDOW_MS;

  const rows: UnifiedRow[] = events.map((e) => ({
    id: `ev:${e.id}`,
    ts: e.ts,
    kind: e.kind,
    summary: e.summary,
    source: "event",
    latencyMs: e.latencyMs,
    costUsd: e.costUsd,
    tokens: e.tokens,
    ok: e.ok,
    meta: e.meta,
  }));

  for (const lg of ledger) {
    const settlement = !!lg.txHash;
    if (!settlement) {
      const key = matchKey(lg.kind);
      const dup = events.some(
        (e) => matchKey(e.kind) === key && Math.abs(e.ts - lg.ts) <= windowMs,
      );
      if (dup) continue; // an event already represents this row
    }
    rows.push({
      id: `lg:${lg.id}`,
      ts: lg.ts,
      kind: lg.kind,
      summary: lg.summary,
      source: "ledger",
      costUsd: lg.costUsd,
      tokens: lg.tokens,
      authority: lg.authority,
      txHash: lg.txHash,
      meta: {},
    });
  }

  return rows.sort((a, b) => b.ts - a.ts);
}

/** Average latency (ms) per event kind, over events that recorded a latency. */
export function latencyByKind(events: Event[]): Record<string, number> {
  const acc: Record<string, { sum: number; n: number }> = {};
  for (const e of events) {
    if (!e.latencyMs) continue;
    (acc[e.kind] ??= { sum: 0, n: 0 }).sum += e.latencyMs;
    acc[e.kind]!.n += 1;
  }
  return Object.fromEntries(
    Object.entries(acc).map(([k, v]) => [k, Math.round(v.sum / v.n)]),
  );
}

/**
 * Project month-end LLM spend from the rolling 24h rate, vs an optional monthly
 * cap. Rolling windows have no "elapsed fraction", so the daily window IS the
 * current rate; ×30 is the honest first-order projection.
 */
export function projectMonthlySpend(
  daily24hUsd: number,
  monthlyCapUsd?: number,
): { projectedUsd: number; capUsd?: number; willBreach: boolean } {
  const projectedUsd = daily24hUsd * 30;
  return {
    projectedUsd,
    capUsd: monthlyCapUsd,
    willBreach: monthlyCapUsd !== undefined && projectedUsd > monthlyCapUsd,
  };
}
