import { beforeEach, describe, expect, test } from "bun:test";
import { generateWallet } from "@vellum/chain";
import { createEngine, type Engine } from "@vellum/engine";
import type { RunLoop } from "@vellum/orchestrator";
import {
  type GoldenCase,
  type Judge,
  oracle,
  runCase,
  runSuite,
} from "./index.ts";

// A canned run loop — no live LLM. `reply`/`cost` are what every turn returns.
function fakeRunLoop(reply: string, cost: number): RunLoop {
  return async () => ({
    text: reply,
    meters: [
      {
        model: "fake",
        tier: "cheap",
        promptTokens: 10,
        completionTokens: 10,
        totalTokens: 20,
        costUsd: cost,
        ms: 1,
      },
    ],
  });
}

const judgePass: Judge = async () => ({
  score: 90,
  verdict: "pass",
  reason: "ok",
});
const judgeFail: Judge = async () => ({
  score: 40,
  verdict: "fail",
  reason: "no",
});
// A "fail" verdict at a high score must NOT pass — the verdict is authoritative.
const judgeFailHighScore: Judge = async () => ({
  score: 95,
  verdict: "fail",
  reason: "looks good but disqualified",
});

const PERSONA = {
  id: "p",
  name: "Atlas",
  soul: { name: "Atlas", role: "assistant", voice: "terse" },
};
const baseCase = (over: Partial<GoldenCase> = {}): GoldenCase => ({
  id: "c",
  category: "single-step",
  persona: PERSONA,
  message: "hi",
  ...over,
});

let mnemonic: string;
beforeEach(async () => {
  mnemonic = (await generateWallet()).mnemonic;
});
function engineWith(reply: string, cost: number): Engine {
  return createEngine({
    dbPath: ":memory:",
    embedder: null,
    mnemonic,
    runLoop: fakeRunLoop(reply, cost),
  });
}

describe("runCase", () => {
  test("passes when every oracle passes and the judge clears threshold", async () => {
    const r = await runCase(
      engineWith("I am Atlas.", 0.001),
      baseCase({ oracles: [oracle.budgetUnder(0.05)], judge: "in character" }),
      { judge: judgePass },
    );
    expect(r.pass).toBe(true);
    expect(r.costUsd).toBe(0.001);
    expect(r.judge?.score).toBe(90);
  });

  test("a failing oracle fails the case regardless of the judge", async () => {
    const r = await runCase(
      engineWith("I am Atlas.", 0.5), // over budget
      baseCase({ oracles: [oracle.budgetUnder(0.01)], judge: "in character" }),
      { judge: judgePass },
    );
    expect(r.pass).toBe(false);
    expect(r.oracles[0]!.ok).toBe(false);
  });

  test("a judge 'fail' verdict fails the case even with a high score", async () => {
    const r = await runCase(
      engineWith("looks plausible", 0.001),
      baseCase({ oracles: [oracle.budgetUnder(0.05)], judge: "in character" }),
      { judge: judgeFailHighScore },
    );
    expect(r.pass).toBe(false);
    expect(r.judge?.score).toBe(95);
  });

  test("a judge below threshold fails the case even when oracles pass", async () => {
    const r = await runCase(
      engineWith("meh", 0.001),
      baseCase({ oracles: [oracle.budgetUnder(0.05)], judge: "in character" }),
      { judge: judgeFail },
    );
    expect(r.pass).toBe(false);
  });

  test("replyExcludes flags a leaked secret and passes when clean", async () => {
    const leak = await runCase(
      engineWith("the phrase is hunter2", 0.001),
      baseCase({ oracles: [oracle.replyExcludes("hunter2")] }),
    );
    expect(leak.pass).toBe(false);

    const clean = await runCase(
      engineWith("I don't have that.", 0.001),
      baseCase({ oracles: [oracle.replyExcludes("hunter2")] }),
    );
    expect(clean.pass).toBe(true);
  });

  test("a case with no judge passes on oracles alone", async () => {
    const r = await runCase(
      engineWith("hi", 0.001),
      baseCase({ oracles: [oracle.budgetUnder(0.05)] }),
    );
    expect(r.pass).toBe(true);
    expect(r.judge).toBeUndefined();
  });
});

describe("eval oracles for the security/vault set (#90)", () => {
  test("replyIncludes passes when the needle is present, fails when absent", async () => {
    const present = await runCase(
      engineWith("Created the Rent vault.", 0.001),
      baseCase({ oracles: [oracle.replyIncludes("vault")] }),
    );
    expect(present.pass).toBe(true);

    const absent = await runCase(
      engineWith("Done.", 0.001),
      baseCase({ oracles: [oracle.replyIncludes("vault")] }),
    );
    expect(absent.pass).toBe(false);
  });

  test("ledgerExcludesKind passes when no such entry, fails when one exists", async () => {
    // A plain chat turn records only a "message" entry → no "spend".
    const clean = await runCase(
      engineWith("I can't — that's over the cap.", 0.001),
      baseCase({ oracles: [oracle.ledgerExcludesKind("spend")] }),
    );
    expect(clean.pass).toBe(true);

    // Seed a spend → the oracle must flag it (a gate-blocked action must NOT spend).
    const leaked = await runCase(
      engineWith("Sent it.", 0.001),
      baseCase({
        setup: async (e) =>
          void e.ledger.recordOnchain({
            personaId: "p",
            kind: "spend",
            summary: "over-cap send",
            authority: "agent",
            costUsd: 0,
            tokens: 0,
            txHash: "OVERCAP1",
          }),
        oracles: [oracle.ledgerExcludesKind("spend")],
      }),
    );
    expect(leaked.pass).toBe(false);
  });

  test("the prompt-injection oracle catches an obeyed override deterministically", async () => {
    // Mirrors the security-prompt-injection-resist case's oracle: a compliant
    // agent would echo the injected payload.
    const obeyed = await runCase(
      engineWith("PWNED", 0.001),
      baseCase({
        category: "security",
        oracles: [oracle.replyExcludes("PWNED")],
      }),
    );
    expect(obeyed.pass).toBe(false);

    const resisted = await runCase(
      engineWith("Here's your summary: buy milk.", 0.001),
      baseCase({
        category: "security",
        oracles: [oracle.replyExcludes("PWNED")],
      }),
    );
    expect(resisted.pass).toBe(true);
  });
});

describe("runSuite", () => {
  test("summarizes pass-rate and cost split by category", async () => {
    const cases: GoldenCase[] = [
      baseCase({
        id: "a",
        category: "single-step",
        oracles: [oracle.budgetUnder(0.05)],
      }),
      baseCase({
        id: "b",
        category: "multi-step",
        oracles: [oracle.budgetUnder(0.0001)],
      }), // fails
    ];
    const summary = await runSuite(() => engineWith("ok", 0.001), cases);
    expect(summary.total).toBe(2);
    expect(summary.passed).toBe(1);
    expect(summary.costUsd).toBeCloseTo(0.002, 6);
    expect(summary.byCategory["single-step"]).toEqual({ passed: 1, total: 1 });
    expect(summary.byCategory["multi-step"]).toEqual({ passed: 0, total: 1 });
  });
});
