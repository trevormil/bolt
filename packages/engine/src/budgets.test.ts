import { describe, expect, test } from "bun:test";
import { Ledger } from "@vellum/ledger";
import { llmBudget } from "./budgets.ts";

describe("llmBudget (0009 — rolling LLM-spend cap)", () => {
  test("ok until the rolling-window spend reaches the cap", () => {
    const l = new Ledger();
    l.recordAgentRun("a", "x", [
      {
        model: "m",
        tier: "cheap",
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 100,
        costUsd: 0.4,
        ms: 0,
      },
    ]);
    expect(llmBudget(l, "a", 1).ok).toBe(true);
    expect(llmBudget(l, "a", 1).remainingUsd).toBeCloseTo(0.6, 6);

    l.recordAgentRun("a", "y", [
      {
        model: "m",
        tier: "cheap",
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 100,
        costUsd: 0.7,
        ms: 0,
      },
    ]);
    const b = llmBudget(l, "a", 1);
    expect(b.spentUsd).toBeCloseTo(1.1, 6);
    expect(b.ok).toBe(false);
    expect(b.remainingUsd).toBe(0);
    // scoped per persona
    expect(llmBudget(l, "b", 1).ok).toBe(true);
    l.close();
  });
});
