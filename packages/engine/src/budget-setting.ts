import { z } from "zod";
import { env } from "@vellum/shared";
import { defineSetting } from "@vellum/settings";
import type { Engine } from "./engine.ts";

/**
 * Per-persona LLM-cost budget limits across rolling windows (#44). Extends the
 * shipped single-cap #9 into configurable daily / weekly / monthly USD caps.
 * Any subset may be set; an absent limit means "no cap for that window". This is
 * a COST guardrail on OpenRouter spend, NOT a USDC spending limit — discretionary
 * USDC spend has no free-form cap (those live only in vaults).
 *
 * "Rolling" windows: daily = last 24h, weekly = last 7d, monthly = last 30d.
 * Calendar windows are messier (variable month length) and the rolling shape
 * matches the existing #9 budget so the upgrade is uniform.
 */
export const BudgetLimitsSchema = z
  .object({
    dailyUsd: z.number().positive().optional(),
    weeklyUsd: z.number().positive().optional(),
    monthlyUsd: z.number().positive().optional(),
  })
  .strict();
export type BudgetLimits = z.infer<typeof BudgetLimitsSchema>;

// Preserve the shipped behavior: when nothing is set, the daily cap is the env
// default (so #44 ships transparently for existing personas).
export const BudgetLimits = defineSetting<BudgetLimits>(
  "budget-limits",
  BudgetLimitsSchema,
  { dailyUsd: env.VELLUM_LLM_BUDGET_USD },
);

const DAY_MS = 86_400_000;
const WINDOWS: { name: "daily" | "weekly" | "monthly"; ms: number }[] = [
  { name: "daily", ms: DAY_MS },
  { name: "weekly", ms: 7 * DAY_MS },
  { name: "monthly", ms: 30 * DAY_MS },
];

export interface BudgetWindow {
  spentUsd: number;
  capUsd: number;
  remainingUsd: number;
  ok: boolean;
}
export interface BudgetEvaluation {
  windows: Partial<Record<"daily" | "weekly" | "monthly", BudgetWindow>>;
  ok: boolean; // false iff any window with a cap is breached
  breached?: "daily" | "weekly" | "monthly"; // first breach (smallest window)
}

/**
 * Evaluate the persona's LLM-cost budget across all configured windows.
 * `ok = false` as soon as any one window is breached — chat() turns this into
 * a user-visible "budget exhausted" reply naming the breached window.
 */
export function evaluateBudget(
  engine: Engine,
  personaId: string,
  now: number = Date.now(),
): BudgetEvaluation {
  const { value: limits } = BudgetLimits.get(engine.settings, personaId);
  const out: BudgetEvaluation = { windows: {}, ok: true };
  for (const w of WINDOWS) {
    const cap =
      w.name === "daily"
        ? limits.dailyUsd
        : w.name === "weekly"
          ? limits.weeklyUsd
          : limits.monthlyUsd;
    if (cap === undefined) continue;
    const spent = engine.ledger.spendSince(personaId, now - w.ms).costUsd;
    const ok = spent < cap;
    out.windows[w.name] = {
      spentUsd: spent,
      capUsd: cap,
      remainingUsd: Math.max(0, cap - spent),
      ok,
    };
    // Smallest window listed first — first breach reported is the tightest one.
    if (!ok && out.ok) {
      out.ok = false;
      out.breached = w.name;
    }
  }
  return out;
}
