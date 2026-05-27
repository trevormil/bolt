import { describe, expect, test } from "bun:test";
import type { Meter } from "@vellum/llm";
import { Ledger } from "./index.ts";

const meter = (costUsd: number, totalTokens: number): Meter => ({
  model: "m",
  tier: "cheap",
  promptTokens: 0,
  completionTokens: 0,
  totalTokens,
  costUsd,
  ms: 0,
});

describe("Ledger", () => {
  test("records an immutable entry with cost + authority", () => {
    const l = new Ledger();
    const e = l.record({
      personaId: "atlas",
      kind: "spend",
      summary: "sent 10 ubadge to bb1xyz",
      authority: "human",
      costUsd: 0,
      tokens: 0,
      txHash: "ABC123",
      meta: { to: "bb1xyz" },
    });
    expect(e.id).toBeGreaterThan(0);
    expect(e.ts).toBeGreaterThan(0);
    expect(e.txHash).toBe("ABC123");
    expect(e.meta.to).toBe("bb1xyz");
    expect(l.list()).toHaveLength(1);
    l.close();
  });

  test("recordOnchain is idempotent on txHash (crash-retry safe)", () => {
    const l = new Ledger();
    const input = {
      personaId: "atlas",
      kind: "spend" as const,
      summary: "sent 1 USDC",
      authority: "agent",
      txHash: "ONCHAIN-HASH-1",
      meta: { height: 42 },
    };
    const first = l.recordOnchain(input);
    expect(first.created).toBe(true);
    const second = l.recordOnchain(input); // simulated reconcile after a crash
    expect(second.created).toBe(false);
    expect(second.entry.id).toBe(first.entry.id); // same row, no double-write
    expect(l.list({ personaId: "atlas" })).toHaveLength(1);
    l.close();
  });

  test("exposes no mutation API (append-only)", () => {
    const l = new Ledger();
    expect((l as unknown as Record<string, unknown>).update).toBeUndefined();
    expect((l as unknown as Record<string, unknown>).delete).toBeUndefined();
    l.close();
  });

  test("recordAgentRun sums a turn's metered cost + tokens", () => {
    const l = new Ledger();
    const e = l.recordAgentRun("atlas", "answered: what's my balance", [
      meter(0.0001, 120),
      meter(0.0003, 300),
    ]);
    expect(e.kind).toBe("message");
    expect(e.authority).toBe("agent");
    expect(e.costUsd).toBeCloseTo(0.0004, 9);
    expect(e.tokens).toBe(420);
    l.close();
  });

  test("list filters by persona + kind, newest first", () => {
    const l = new Ledger();
    l.record({
      personaId: "atlas",
      kind: "message",
      summary: "a1",
      authority: "agent",
    });
    l.record({
      personaId: "echo",
      kind: "message",
      summary: "e1",
      authority: "agent",
    });
    l.record({
      personaId: "atlas",
      kind: "tool_call",
      summary: "a-tool",
      authority: "agent",
    });

    expect(l.list({ personaId: "atlas" }).map((e) => e.summary)).toEqual([
      "a-tool",
      "a1",
    ]);
    expect(
      l.list({ personaId: "atlas", kind: "message" }).map((e) => e.summary),
    ).toEqual(["a1"]);
    expect(l.list({ limit: 1 })).toHaveLength(1);
    l.close();
  });

  test("summary aggregates totals + counts by kind, scoped per persona", () => {
    const l = new Ledger();
    l.record({
      personaId: "atlas",
      kind: "message",
      summary: "x",
      authority: "agent",
      costUsd: 0.01,
      tokens: 100,
    });
    l.record({
      personaId: "atlas",
      kind: "spend",
      summary: "y",
      authority: "human",
      costUsd: 0,
      tokens: 0,
    });
    l.record({
      personaId: "echo",
      kind: "message",
      summary: "z",
      authority: "agent",
      costUsd: 0.05,
      tokens: 500,
    });

    const atlas = l.summary("atlas");
    expect(atlas.entries).toBe(2);
    expect(atlas.totalCostUsd).toBeCloseTo(0.01, 9);
    expect(atlas.totalTokens).toBe(100);
    expect(atlas.byKind).toEqual({ message: 1, spend: 1 });

    const all = l.summary();
    expect(all.entries).toBe(3);
    expect(all.totalCostUsd).toBeCloseTo(0.06, 9);
    l.close();
  });
});
