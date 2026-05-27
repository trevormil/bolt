// @vellum/evals — a budget-aware eval harness for the agent (0022). Golden cases
// carry deterministic oracles (exact: cost, tx fired, leak check) and an optional
// LLM-as-judge for open-ended output. runCase is cheap-enough for iteration;
// runSuite is gated in CI (real-LLM runs cost money — see cli.ts).
export {
  runCase,
  runSuite,
  oracle,
  llmJudge,
  type EvalCategory,
  type GoldenCase,
  type EvalResult,
  type SuiteSummary,
  type CaseContext,
  type Oracle,
  type OracleResult,
  type Judge,
  type JudgeScore,
  type RunOptions,
} from "./evals.ts";
export { goldenSet } from "./golden.ts";
