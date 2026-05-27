import { chat, type Engine } from "@vellum/engine";
import { complete } from "@vellum/llm";
import { createLogger } from "@vellum/shared";

const log = createLogger("evals");

export type EvalCategory = "single-step" | "multi-step" | "long-horizon";

// What a case produced — oracles inspect this + the live engine (ledger, etc.).
export interface CaseContext {
  reply: string;
  costUsd: number;
  tokens: number;
  budgetExceeded: boolean;
  engine: Engine;
  personaId: string;
}
export interface OracleResult {
  ok: boolean;
  detail: string;
}
export type Oracle = (ctx: CaseContext) => OracleResult;

export interface JudgeScore {
  score: number; // 0–100
  verdict: "pass" | "fail";
  reason: string;
}
export type Judge = (reply: string, rubric: string) => Promise<JudgeScore>;

export interface GoldenCase {
  id: string;
  category: EvalCategory;
  persona: {
    id: string;
    name: string;
    soul: { name: string; role: string; voice: string; values?: string[] };
  };
  setup?: (engine: Engine) => Promise<void>; // seed memory / other personas
  message: string;
  oracles?: Oracle[]; // deterministic checks (cheap, exact)
  judge?: string; // optional LLM-as-judge rubric (open-ended)
}

export interface EvalResult {
  caseId: string;
  category: EvalCategory;
  pass: boolean;
  oracles: OracleResult[];
  judge?: JudgeScore;
  costUsd: number;
}

// Deterministic oracle constructors — exact, free, preferred over the judge.
export const oracle = {
  budgetUnder:
    (maxUsd: number): Oracle =>
    (ctx) => ({
      ok: ctx.costUsd <= maxUsd,
      detail: `cost $${ctx.costUsd.toFixed(4)} ≤ $${maxUsd}`,
    }),
  ledgerHasKind:
    (kind: string): Oracle =>
    (ctx) => ({
      ok: ctx.engine.ledger
        .list({ personaId: ctx.personaId })
        .some((e) => e.kind === kind),
      detail: `ledger has a "${kind}" entry`,
    }),
  replyExcludes:
    (needle: string): Oracle =>
    (ctx) => ({
      ok: !ctx.reply.toLowerCase().includes(needle.toLowerCase()),
      detail: `reply excludes "${needle}"`,
    }),
  replyMatches:
    (re: RegExp): Oracle =>
    (ctx) => ({ ok: re.test(ctx.reply), detail: `reply matches ${re}` }),
};

// LLM-as-judge for open-ended output. Strict JSON contract; defensive parse.
export const llmJudge: Judge = async (reply, rubric) => {
  const { text } = await complete(
    [
      {
        role: "system",
        content:
          'You are a strict evaluator. Score 0-100 how well RESPONSE meets RUBRIC. Reply ONLY as JSON: {"score": <0-100>, "verdict": "pass" | "fail", "reason": "<short>"}.',
      },
      { role: "user", content: `RUBRIC:\n${rubric}\n\nRESPONSE:\n${reply}` },
    ],
    { complexity: "high", maxTokens: 300 },
  );
  try {
    const j = JSON.parse(
      text.match(/\{[\s\S]*\}/)?.[0] ?? "{}",
    ) as Partial<JudgeScore>;
    return {
      score: Number(j.score) || 0,
      verdict: j.verdict === "pass" ? "pass" : "fail",
      reason: j.reason ?? "",
    };
  } catch {
    return { score: 0, verdict: "fail", reason: "unparseable judge output" };
  }
};

export interface RunOptions {
  judge?: Judge; // injectable (default llmJudge) — tests pass a fake
  judgeThreshold?: number; // min score to pass (default 70)
}

/** Run one golden case end to end against a live engine. */
export async function runCase(
  engine: Engine,
  c: GoldenCase,
  opts: RunOptions = {},
): Promise<EvalResult> {
  const judge = opts.judge ?? llmJudge;
  const threshold = opts.judgeThreshold ?? 70;
  if (!engine.store.getPersona(c.persona.id)) {
    engine.store.createPersona(c.persona.id, c.persona.name, c.persona.soul);
    await engine.wallets.ensureWallet(c.persona.id);
  }
  await c.setup?.(engine);

  const r = await chat(engine, {
    conversationId: `eval:${c.id}`,
    personaId: c.persona.id,
    message: c.message,
  });
  const ctx: CaseContext = {
    reply: r.reply,
    costUsd: r.costUsd,
    tokens: r.tokens,
    budgetExceeded: r.budgetExceeded,
    engine,
    personaId: c.persona.id,
  };
  const oracles = (c.oracles ?? []).map((o) => o(ctx));
  const judgeRes = c.judge ? await judge(r.reply, c.judge) : undefined;
  const pass =
    oracles.every((o) => o.ok) && (!judgeRes || judgeRes.score >= threshold);
  log.info(
    `case ${c.id} · ${pass ? "PASS" : "FAIL"} · $${r.costUsd.toFixed(4)}`,
  );
  return {
    caseId: c.id,
    category: c.category,
    pass,
    oracles,
    judge: judgeRes,
    costUsd: r.costUsd,
  };
}

export interface SuiteSummary {
  total: number;
  passed: number;
  costUsd: number;
  byCategory: Record<string, { passed: number; total: number }>;
  results: EvalResult[];
}

/** Run a set of cases (gated/full). Each case gets a fresh engine state. */
export async function runSuite(
  makeEngine: () => Engine,
  cases: GoldenCase[],
  opts: RunOptions = {},
): Promise<SuiteSummary> {
  const results: EvalResult[] = [];
  for (const c of cases) {
    const engine = makeEngine();
    results.push(await runCase(engine, c, opts));
  }
  const byCategory: SuiteSummary["byCategory"] = {};
  for (const r of results) {
    const b = (byCategory[r.category] ??= { passed: 0, total: 0 });
    b.total++;
    if (r.pass) b.passed++;
  }
  return {
    total: results.length,
    passed: results.filter((r) => r.pass).length,
    costUsd: results.reduce((n, r) => n + r.costUsd, 0),
    byCategory,
    results,
  };
}
