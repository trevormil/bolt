import { env } from "@vellum/shared";
import type { Ledger } from "@vellum/ledger";

const DAY_MS = 86_400_000;
const USDC = 1e6;

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

export interface FreeformCap {
  balanceUsd: number;
  capUsd: number;
  headroomUsd: number;
  atCap: boolean; // true once the discretionary balance reaches the ceiling
}

/**
 * Free-form USDC cap (0010): the discretionary x/bank tier has no on-chain rule
 * enforcement, so it's bounded by never funding above the ceiling. `balanceMicro`
 * is base µUSDC.
 */
export function freeformCap(
  balanceMicro: string,
  capUsd = env.VELLUM_FREEFORM_CAP_USD,
): FreeformCap {
  const balanceUsd = Number(balanceMicro) / USDC;
  return {
    balanceUsd,
    capUsd,
    headroomUsd: Math.max(0, capUsd - balanceUsd),
    atCap: balanceUsd >= capUsd,
  };
}
