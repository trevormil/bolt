import { describe, expect, test } from "bun:test";
import type { Event } from "./events.ts";
import { mergeObservability, type LedgerLike } from "./merge.ts";

// Property/fuzz hardening for mergeObservability (#112 §3). The function has
// six enumerated dedup cases but the 10s proximity window has edges (events
// 9.999s apart, settlement rows + matching events) that example-based tests
// miss. We fuzz over random event+ledger sets and assert four invariants:
//   I1. Every event surfaces as exactly one `ev:<id>` row, source "event".
//   I2. Every settlement ledger row (truthy txHash) surfaces as `lg:<id>`,
//       source "ledger".
//   I3. A non-settlement ledger row surfaces IFF no event with matching
//       matchKey sits within `windowMs` of it.
//   I4. Output is sorted desc by ts.
//
// The oracle declares the matchKey table independently rather than importing
// the private one — a divergence between this table and the implementation's
// is itself a bug the fuzz catches.

const MATCH_KEY: Record<string, string> = {
  chat_out: "chat",
  message: "chat",
  tool_call: "tool_call",
  capability: "capability",
  spend: "spend",
  vault_op: "vault_op",
  funding: "funding",
};
function key(kind: string): string {
  return MATCH_KEY[kind] ?? `event:${kind}`;
}

const EVENT_KINDS: Event["kind"][] = [
  "chat_in",
  "chat_out",
  "tool_call",
  "fs_op",
  "capability",
  "task_run",
  "spend",
  "vault_op",
  "security",
  "error",
];
const LEDGER_KINDS = [
  "message",
  "tool_call",
  "capability",
  "spend",
  "vault_op",
  "funding",
  "rebate",
  "adjustment",
];

function ev(over: Partial<Event> & Pick<Event, "id" | "ts" | "kind">): Event {
  return {
    personaId: "p",
    summary: "",
    latencyMs: 0,
    costUsd: 0,
    tokens: 0,
    ok: true,
    meta: {},
    ...over,
  };
}
function lg(
  over: Partial<LedgerLike> & Pick<LedgerLike, "id" | "ts" | "kind">,
): LedgerLike {
  return {
    summary: "",
    authority: "agent",
    costUsd: 0,
    tokens: 0,
    txHash: null,
    ...over,
  };
}

function expectedIds(
  events: Event[],
  ledger: LedgerLike[],
  windowMs: number,
): Set<string> {
  const out = new Set<string>();
  for (const e of events) out.add(`ev:${e.id}`);
  for (const l of ledger) {
    if (l.txHash) {
      out.add(`lg:${l.id}`); // I2: settlement always kept
      continue;
    }
    const k = key(l.kind);
    const dup = events.some(
      (e) => key(e.kind) === k && Math.abs(e.ts - l.ts) <= windowMs,
    );
    if (!dup) out.add(`lg:${l.id}`); // I3
  }
  return out;
}

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function genScenario(): { events: Event[]; ledger: LedgerLike[] } {
  const nEvents = Math.floor(Math.random() * 8);
  const nLedger = Math.floor(Math.random() * 8);
  const events: Event[] = [];
  const ledger: LedgerLike[] = [];
  for (let i = 0; i < nEvents; i++) {
    events.push(
      ev({
        id: i + 1,
        ts: Math.floor(Math.random() * 100_000),
        kind: pick(EVENT_KINDS),
      }),
    );
  }
  for (let i = 0; i < nLedger; i++) {
    const settlement = Math.random() < 0.4;
    ledger.push(
      lg({
        id: i + 1,
        ts: Math.floor(Math.random() * 100_000),
        kind: pick(LEDGER_KINDS),
        txHash: settlement ? `TX_${i}` : null,
      }),
    );
  }
  return { events, ledger };
}

describe("mergeObservability — property/fuzz (#112 §3)", () => {
  test("I2: every settlement ledger row survives, even when an event collides exactly", () => {
    // Specifically pins down the "settlement always wins" rule, including the
    // ts-equal collision with a same-key event.
    for (const k of LEDGER_KINDS) {
      const rows = mergeObservability(
        [ev({ id: 1, ts: 1000, kind: "tool_call" })],
        [lg({ id: 9, ts: 1000, kind: k, txHash: "TXABC" })],
      );
      expect(rows.some((r) => r.id === "lg:9")).toBe(true);
      expect(rows.find((r) => r.id === "lg:9")?.txHash).toBe("TXABC");
    }
  });

  test("I3: non-settlement ledger drops INSIDE window, survives OUTSIDE window — both sides of the boundary", () => {
    const windowMs = 10_000;
    // Pairs that should dedup (same matchKey, within window).
    const dedupePairs: Array<[Event["kind"], string]> = [
      ["chat_out", "message"], // both map to "chat"
      ["tool_call", "tool_call"],
      ["capability", "capability"],
      ["spend", "spend"],
      ["vault_op", "vault_op"],
    ];
    for (const [eKind, lKind] of dedupePairs) {
      // Inside window — ledger row dropped.
      let rows = mergeObservability(
        [ev({ id: 1, ts: 1000, kind: eKind })],
        [lg({ id: 9, ts: 1000 + windowMs, kind: lKind })],
      );
      expect(rows.some((r) => r.id === "lg:9")).toBe(false);
      // Outside window — ledger row kept.
      rows = mergeObservability(
        [ev({ id: 1, ts: 1000, kind: eKind })],
        [lg({ id: 9, ts: 1000 + windowMs + 1, kind: lKind })],
      );
      expect(rows.some((r) => r.id === "lg:9")).toBe(true);
    }
    // Non-matching matchKey — never dedups, always survives.
    const rows = mergeObservability(
      [ev({ id: 1, ts: 1000, kind: "spend" })],
      [lg({ id: 9, ts: 1000, kind: "vault_op" })],
    );
    expect(rows.some((r) => r.id === "lg:9")).toBe(true);
  });

  test("invariant sweep over 1000 random scenarios", () => {
    const windowMs = 10_000;
    for (let i = 0; i < 1000; i++) {
      const { events, ledger } = genScenario();
      const rows = mergeObservability(events, ledger);
      const actualIds = new Set(rows.map((r) => r.id));
      const wantIds = expectedIds(events, ledger, windowMs);
      // I1 + I2 + I3 together: id set matches the oracle.
      expect(actualIds).toEqual(wantIds);
      // Uniqueness — no double-counting.
      expect(rows.length).toBe(actualIds.size);
      // I4: sorted desc by ts (non-strict — equal ts allowed).
      for (let j = 1; j < rows.length; j++) {
        expect(rows[j - 1]!.ts).toBeGreaterThanOrEqual(rows[j]!.ts);
      }
      // Source tagging: events → "event", ledger → "ledger".
      for (const r of rows) {
        if (r.id.startsWith("ev:")) expect(r.source).toBe("event");
        else expect(r.source).toBe("ledger");
      }
    }
  });
});
