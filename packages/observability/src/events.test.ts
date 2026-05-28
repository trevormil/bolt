import { describe, expect, test } from "bun:test";
import { EventStore } from "./events.ts";

describe("EventStore (#42)", () => {
  test("emit + recent: newest-first, scoped per persona", () => {
    const s = new EventStore();
    s.emit({ personaId: "a", kind: "chat_in", summary: "msg" });
    s.emit({
      personaId: "a",
      kind: "chat_out",
      summary: "reply",
      latencyMs: 1234,
      costUsd: 0.0021,
      tokens: 423,
      ok: true,
    });
    s.emit({ personaId: "b", kind: "tool_call", summary: "tool" });
    const aOnly = s.recent("a");
    expect(aOnly.map((e) => e.kind)).toEqual(["chat_out", "chat_in"]);
    expect(aOnly[0]?.costUsd).toBeCloseTo(0.0021);
    expect(aOnly[0]?.latencyMs).toBe(1234);
    expect(s.recent("b").length).toBe(1);
    s.close();
  });

  test("summary aggregates by kind + windows + counts ok=false as errors", () => {
    const s = new EventStore();
    s.emit({ personaId: "a", kind: "chat_in", summary: "msg" });
    s.emit({
      personaId: "a",
      kind: "chat_out",
      summary: "reply",
      costUsd: 0.01,
      tokens: 100,
      ok: true,
    });
    s.emit({
      personaId: "a",
      kind: "tool_call",
      summary: "fs_write fail",
      ok: false,
    });
    const sum = s.summary("a");
    expect(sum.byKind).toEqual({ chat_in: 1, chat_out: 1, tool_call: 1 });
    expect(sum.last24h.events).toBe(3);
    expect(sum.last24h.errors).toBe(1);
    expect(sum.last24h.costUsd).toBeCloseTo(0.01);
    expect(sum.last24h.tokens).toBe(100);
    s.close();
  });

  test("recent() respects the limit", () => {
    const s = new EventStore();
    for (let i = 0; i < 50; i++)
      s.emit({ personaId: "a", kind: "chat_in", summary: `m${i}` });
    expect(s.recent("a", 10).length).toBe(10);
    s.close();
  });
});
