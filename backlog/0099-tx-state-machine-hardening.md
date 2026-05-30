---
id: 99
title: "TX state-machine hardening: kill substring 'rejected' classifier + submitting-row recovery + stuck-pending caps"
status: open
priority: critical
type: bug
source: audit-2026-05-29
created: 2026-05-29
refs: ["0085-hardening-onboarding.md", "0081-vault-withdrawal-stuck-pending.md"]
---

## Description
Three related TxManager defects surfaced in the post-merge audit. Together they
form a path where money can move on-chain while the local system thinks it
didn't, plus failure modes that freeze a persona's wallet until manual DB edit.

## Findings

### 1. Substring-`/rejected/` classifier misclassifies network errors as CheckTx rejections (CRITICAL)
- Where: `packages/tx/src/tx.ts:282-293`, `packages/chain/src/sdk.ts:142-152`, `packages/web/src/app/keplr.ts:364-366`.
- A spend errors mid-broadcast; the error message contains the substring `rejected`
  (TLS interceptor `"connection rejected by peer"`, corporate proxy `"rejected: SNI
  mismatch"`, browser extension `"request rejected"`). TxManager treats it as a
  definitive CheckTx revert → marks the row `failed`, releases the mutex, **never
  confirms the hash**. If the tx actually committed on-chain, money moved with no
  ledger entry.
- Fix: stop classifying by string. `sdk.ts:151` throws a typed
  `BroadcastRejectedError` only when the response carried a `tx_response` with
  `code !== 0` AND a `txhash`; otherwise leave the intent `submitting` for
  reconcile to retry.

### 2. `reconcile()` skips `submitting` rows → a crash mid-broadcast freezes the persona forever (HIGH)
- Where: `packages/tx/src/tx.ts:397-402,411-418` (skips rows with `status !==
  "pending"` or no hash). The durable per-persona guard at `:246` includes
  submitting rows, so the wallet is locked.
- A SIGKILL between the `submitting` insert (`:251`) and `setHash(:295)` leaves a
  row that reconcile can't drive; the only recovery is sqlite editing.
- Fix: add a `recoverStuckSubmitting()` boot-time pass — query the chain for
  recent broadcasts from the persona's address; reconcile by hash if found.
  Otherwise, after N reconcile-stale retries, mark `failed` with an
  `unreconciled` flag so the wallet unblocks.

### 3. Auto-reconcile unbounded retries on stuck-pending → permanent freeze (MEDIUM)
- Where: `packages/tx/src/tx.ts:430-446` (`startAutoReconcile`), `:411-418`.
- An LCD reorg / fork where a tx never canonically commits → `confirmTx` timeouts
  loop forever every 15s. The pending row never resolves; persona is locked
  indefinitely on mainnet.
- Fix: cap retries (~100 → ~25 min) then mark `failed` with `unreconciled` and
  release the persona; surface in the dashboard for manual review.

## Acceptance criteria
- TxManager classifies a broadcast outcome only on structured signals (`code !==
  0 && txhash` → reject; otherwise leave submitting). Add test: `signAndBroadcast`
  throws `new Error("network rejected by intermediary")` → row stays submitting +
  reconcile re-drives it (does NOT mark failed).
- A `submitting` row left behind by a crash is reconciled on boot from chain
  state; if unreconcilable after N tries, marked `failed` with `unreconciled:
  true` so the per-persona guard releases.
- Auto-reconcile bounded with explicit retry cap + observability emit when the
  cap fires.

## Notes
Surfaced jointly by the adversarial-money-path review (finding #1, #13, #14) and
the security review. None has a regression test today — see #106 for the
coverage backfill ticket.

## Status (2026-05-30) — partial via MR-1
- §1 substring classifier → **shipped**. `BroadcastRejectedError` typed class
  in `@vellum/chain` thrown ONLY when `tx_response.code !== 0 && txhash`.
  TxManager now checks `instanceof BroadcastRejectedError` instead of regex.
  Regression: `"a network error whose message contains 'rejected' leaves the
  row SUBMITTING — not failed (#99)"` in `packages/tx/src/tx.test.ts`.
- §2 `recoverStuckSubmitting()` boot pass → **deferred** (next MR — requires
  a chain query helper + integration into engine boot).
- §3 auto-reconcile retry cap → **deferred** (next MR).
