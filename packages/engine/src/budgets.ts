import { env } from "@vellum/shared";
import type { Ledger } from "@vellum/ledger";

const DAY_MS = 86_400_000;

export interface LlmBudget {
  spentUsd: number;
  capUsd: number;
  remainingUsd: number;
  ok: boolean; // false once the rolling-window spend reaches the cap
}

/**
 * Per-persona LLM-spend budget (0009): rolling 24h $ cap from the ledger's
 * OpenRouter-tracked cost. App-side guardrail (not on-chain) — a runaway agent
 * can't burn unbounded LLM spend on the principal's behalf.
 */
export function llmBudget(
  ledger: Ledger,
  personaId: string,
  capUsd = env.VELLUM_LLM_BUDGET_USD,
): LlmBudget {
  const spentUsd = ledger.spendSince(personaId, Date.now() - DAY_MS).costUsd;
  return {
    spentUsd,
    capUsd,
    remainingUsd: Math.max(0, capUsd - spentUsd),
    ok: spentUsd < capUsd,
  };
}

// NOTE: there is intentionally no free-form / discretionary USDC cap. Spending
// limits live exclusively in vaults (on-chain, protocol-enforced rules); the
// free-form x/bank balance is unconstrained. The LLM-spend budget above is a
// separate cost guardrail, not a limit on the user's money.
