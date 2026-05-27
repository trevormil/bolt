import { freeformCap, llmBudget, type Engine } from "@vellum/engine";
import { env } from "@vellum/shared";

export interface CheckIn {
  personaId: string;
  lines: string[];
}

export interface CheckInOptions {
  budgetWarnRatio?: number; // warn when LLM spend ≥ this fraction of the cap
  freeformWarnHeadroomUsd?: number; // warn when free-form headroom ≤ this
}

/**
 * Per-persona check-in (0018): review the locally-derivable state — LLM budget,
 * free-form balance vs cap, unsettled txs — and surface a nudge worth the human's
 * attention. Returns null when nothing matters (quiet by default — a check-in
 * should be silent unless it has something useful to say).
 */
export async function checkIn(
  engine: Engine,
  personaId: string,
  opts: CheckInOptions = {},
): Promise<CheckIn | null> {
  const budgetWarnRatio = opts.budgetWarnRatio ?? 0.8;
  const freeformWarnHeadroomUsd = opts.freeformWarnHeadroomUsd ?? 5;
  const lines: string[] = [];

  // LLM spend approaching the rolling-window cap.
  const budget = llmBudget(engine.ledger, personaId);
  if (budget.capUsd > 0 && budget.spentUsd / budget.capUsd >= budgetWarnRatio) {
    lines.push(
      `LLM spend $${budget.spentUsd.toFixed(2)} of the $${budget.capUsd.toFixed(2)} daily cap ($${budget.remainingUsd.toFixed(2)} left).`,
    );
  }

  // Free-form (discretionary) balance near its cap — nudge toward a vault.
  const balances = await engine.wallets.balanceFor(personaId);
  const usdcMicro =
    balances.find((b) => b.denom === env.VELLUM_DENOM)?.amount ?? "0";
  const cap = freeformCap(usdcMicro);
  if (cap.balanceUsd > 0 && cap.headroomUsd <= freeformWarnHeadroomUsd) {
    lines.push(
      `Free-form balance $${cap.balanceUsd.toFixed(2)} is near the $${cap.capUsd} cap — consider moving funds into a vault.`,
    );
  }

  // Transactions still settling (pending/submitting) — surface so a stuck tx
  // isn't silently forgotten.
  const unsettled = engine.txManager.pending(personaId);
  if (unsettled.length > 0) {
    lines.push(
      `${unsettled.length} transaction${unsettled.length === 1 ? "" : "s"} still settling.`,
    );
  }

  return lines.length > 0 ? { personaId, lines } : null;
}

/** Render a check-in as a short Telegram-friendly message. */
export function formatCheckIn(ci: CheckIn, personaName = ci.personaId): string {
  return `🔔 ${personaName} check-in:\n• ${ci.lines.join("\n• ")}`;
}
