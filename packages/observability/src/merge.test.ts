import { describe, expect, test } from "bun:test";
import type { Event } from "./events.ts";
import {
  mergeObservability,
  latencyByKind,
  projectMonthlySpend,
  type LedgerLike,
} from "./merge.ts";

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

describe("mergeObservability (#95)", () => {
  test("every event becomes a source-tagged row, newest-first", () => {
    const rows = mergeObservability(
      [
        ev({ id: 1, ts: 100, kind: "chat_in" }),
        ev({ id: 2, ts: 300, kind: "fs_op" }),
      ],
      [],
    );
    expect(rows.map((r) => r.id)).toEqual(["ev:2", "ev:1"]); // sorted desc
    expect(rows.every((r) => r.source === "event")).toBe(true);
  });

  test("a settlement ledger row (has txHash) is always kept, alongside its ops event", () => {
    // A USDC send emits a tool_call event (ops: latency/ok) AND a ledger spend
    // entry with the on-chain txHash (settlement). Both must survive — the user
    // wants the ops row AND the money-truth row.
    const rows = mergeObservability(
      [ev({ id: 1, ts: 1000, kind: "tool_call", summary: "spend:send_usdc" })],
      [
        lg({
          id: 9,
          ts: 1001,
          kind: "spend",
          txHash: "ABC123",
          authority: "agent",
        }),
      ],
    );
    expect(rows).toHaveLength(2);
    const settlement = rows.find((r) => r.source === "ledger")!;
    expect(settlement.txHash).toBe("ABC123");
    expect(settlement.authority).toBe("agent");
  });

  test("a non-settlement ledger row is dropped when an event already represents it", () => {
    // The per-turn ledger "message" entry (no txHash) duplicates the chat_out
    // event — collapse to the richer event row.
    const rows = mergeObservability(
      [
        ev({
          id: 1,
          ts: 1000,
          kind: "chat_out",
          summary: "reply",
          costUsd: 0.002,
          latencyMs: 800,
        }),
      ],
      [
        lg({
          id: 9,
          ts: 1002,
          kind: "message",
          summary: "chat · hi",
          costUsd: 0.002,
        }),
      ],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe("ev:1");
    expect(rows[0]!.latencyMs).toBe(800); // the event's richer fields win
  });

  test("a non-settlement ledger row with no matching event IS kept", () => {
    const rows = mergeObservability(
      [ev({ id: 1, ts: 1000, kind: "chat_out" })],
      [
        lg({
          id: 9,
          ts: 5000,
          kind: "capability",
          summary: "vault.withdraw allowed",
          authority: "rule:vault",
        }),
      ],
    );
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.source === "ledger")!.authority).toBe(
      "rule:vault",
    );
  });

  test("a far-apart non-settlement ledger row is NOT deduped (outside the window)", () => {
    const rows = mergeObservability(
      [ev({ id: 1, ts: 1000, kind: "chat_out" })],
      [
        lg({
          id: 9,
          ts: 1000 + 60_000,
          kind: "message",
          summary: "later turn",
        }),
      ],
      { windowMs: 10_000 },
    );
    expect(rows).toHaveLength(2);
  });

  test("funding (ledger-only money-in) always appears in the feed", () => {
    const rows = mergeObservability(
      [],
      [
        lg({
          id: 9,
          ts: 1000,
          kind: "funding",
          summary: "+10 USDC",
          txHash: "FUND1",
        }),
      ],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.kind).toBe("funding");
    expect(rows[0]!.txHash).toBe("FUND1");
  });
});

describe("latencyByKind (#95)", () => {
  test("averages latency per kind, ignoring zero-latency events", () => {
    const out = latencyByKind([
      ev({ id: 1, ts: 1, kind: "chat_out", latencyMs: 800 }),
      ev({ id: 2, ts: 2, kind: "chat_out", latencyMs: 1200 }),
      ev({ id: 3, ts: 3, kind: "tool_call", latencyMs: 100 }),
      ev({ id: 4, ts: 4, kind: "chat_in", latencyMs: 0 }), // no latency → ignored
    ]);
    expect(out).toEqual({ chat_out: 1000, tool_call: 100 });
  });
});

describe("projectMonthlySpend (#95)", () => {
  test("projects 30× the daily rate and flags a breach vs the monthly cap", () => {
    expect(projectMonthlySpend(1, 20)).toEqual({
      projectedUsd: 30,
      capUsd: 20,
      willBreach: true,
    });
    expect(projectMonthlySpend(0.1).willBreach).toBe(false); // no cap → never breaches
  });
});
