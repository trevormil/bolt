---
id: 104
title: "Vault details & escrow chain-read truth: surface 'unknown' not '0', subtract pending withdraws"
status: open
priority: high
type: bug
source: audit-2026-05-29
created: 2026-05-29
refs: ["0094-agent-read-awareness-round2.md"]
---

## Description
Two related read-side bugs that mislead the agent (and through it, the user)
about vault state.

### 1. `fetchTokenBalance` silently returns "0" on any LCD failure (HIGH)
- Where: `packages/engine/src/vaults.ts:102-123` (`defaultFetchTokenBalance`).
- An LCD hiccup → try/catch returns `"0"` → `vault_details` reports `0 USDC
  escrowed` for a fully-funded vault. The agent — convinced the vault is empty
  — reaches for `request_vault_deposit` and asks the human to top up. A
  trusting human deposits again. Funds duplicated into escrow that the agent
  will withdraw within its cap.
- Failure-mode parallel to the "clinical trust" memory: silent degradation to
  wrong-but-plausible data that the agent acts on.
- Fix: when the LCD read fails, return `null` (or throw) and surface "escrow
  unknown" to the agent + UI; never silently coerce to `"0"`.

### 2. `vault_details` "remaining allowance" is read-before-confirm (HIGH)
- Where: `packages/engine/src/agent-tools.ts:436-461`.
- The agent broadcasts a withdraw; the on-chain `withdrawal-<period>` tracker
  hasn't incremented yet (tx still in-flight). Same-turn or parallel-surface
  `vault_details` reads the old tracker → reports "you still have $10/day."
  The chain *will* reject the second withdraw (on-chain cap holds), but the
  agent's report to the user was wrong, and a social-engineered user can be
  walked through a flurry of CheckTx-rejecting attempts.
- Fix: when a same-period pending withdraw exists in the local `tx` DB, subtract
  its `amount` from the displayed remainingMicro. Locally-displayed becomes a
  lower bound on what the tracker will show post-confirm.

### 3. Tracker-read failure same-pattern as #1 (MEDIUM)
- Where: `packages/engine/src/agent-tools.ts:444-460` — the `vault_details`
  catch silently omits the on-chain tracker on failure.
- Fix: same as #1 — distinguish "no usage yet" from "chain unreachable" and
  surface the latter to the agent + UI.

## Acceptance criteria
- `defaultFetchTokenBalance` and the `vault_details` tracker read return a
  discriminated result (`{ ok: true, amount } | { ok: false, reason }`); the
  agent surfaces "escrow unknown — chain unreachable" rather than "0".
- `vault_details` subtracts in-flight withdraws (same period, persona, vault)
  from the displayed remaining allowance. Test asserts an agent that withdrew
  $5 of a $10 daily cap and immediately calls `vault_details` sees `$5 left`
  not `$10 left`.

## Notes
Money path findings #6, #7 — both are honest-trust regressions in chain-read
plumbing rather than money-loss bugs, but they degrade the agent's reasoning in
ways the user trusts.

## Status (2026-05-30) — shipped via MR-4
- §1 `fetchTokenBalance` null on LCD failure → **shipped**. Return type now
  `Promise<string | null>`; the silent "0" fallback is gone. `vault_details`
  surfaces "escrow unknown — chain unreachable" and the SPA Vaults row shows
  the same. The agent no longer tells a trusting user to top up a fully-funded
  vault.
- §2 in-flight subtraction in `vault_details` → **shipped**. The tool now
  subtracts unsettled `vault_op` rows for the same persona + vault from the
  on-chain confirmed-used and reports a lower-bound remaining. UI string
  includes "(N USDC of withdraws still confirming)" so the user understands
  the figure is a lower bound during the confirm window.
- §3 tracker-read failure → **shipped**. The catch now surfaces "Remaining cap
  unknown — chain unreachable" instead of silently omitting the line.

Regressions: 3 new tests in `agent-tools.test.ts` (one per fix).
