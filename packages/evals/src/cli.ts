import { createEngine } from "@vellum/engine";
import { createLogger } from "@vellum/shared";
import {
  goldenSet,
  runCase,
  runSuite,
  type EvalResult,
  type SuiteSummary,
} from "./index.ts";

// Real-LLM eval runner. Each case gets a fresh in-memory engine so state never
// leaks between cases or into the user's real DB. Single-case for iteration;
// `--all` for the gated full suite (CI runs it as a manual/scheduled job — see
// .gitlab-ci.yml — not on every commit, since real runs cost money).
const log = createLogger("evals-cli");
const makeEngine = () => createEngine({ dbPath: ":memory:" });

function line(r: EvalResult): string {
  const judge = r.judge
    ? ` · judge ${r.judge.score}/100 (${r.judge.verdict})`
    : "";
  const oracles = r.oracles
    .map((o) => `${o.ok ? "✓" : "✗"} ${o.detail}`)
    .join("; ");
  return `${r.pass ? "PASS" : "FAIL"}  ${r.caseId} [${r.category}] $${r.costUsd.toFixed(4)}${judge}\n        ${oracles}${r.judge ? `\n        judge: ${r.judge.reason}` : ""}`;
}

function printSummary(s: SuiteSummary): void {
  for (const r of s.results) console.log(line(r));
  const cats = Object.entries(s.byCategory)
    .map(([c, b]) => `${c} ${b.passed}/${b.total}`)
    .join(" · ");
  console.log(
    `\n${s.passed}/${s.total} passed · $${s.costUsd.toFixed(4)} · ${cats}`,
  );
}

const arg = process.argv[2];

if (!arg) {
  console.log(
    "usage:\n  bun run dev <caseId>   run one case (cheap, for iteration)\n  bun run dev --all      run the full gated suite (real-LLM $)\n\ncases:",
  );
  for (const c of goldenSet) console.log(`  ${c.id}  [${c.category}]`);
  process.exit(0);
}

if (arg === "--all") {
  log.warn("running the FULL suite against the live LLM — this costs money");
  const summary = await runSuite(makeEngine, goldenSet);
  printSummary(summary);
  process.exit(summary.passed === summary.total ? 0 : 1);
}

const found = goldenSet.find((c) => c.id === arg);
if (!found) {
  log.error(`no case "${arg}" — run with no args to list cases`);
  process.exit(2);
}
const result = await runCase(makeEngine(), found);
console.log(line(result));
process.exit(result.pass ? 0 : 1);
