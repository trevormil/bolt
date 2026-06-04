---
id: 106
title: "Test coverage backfill: signed-flow error branches, public SPA pages, signoff route, settings writes, onboarding e2e"
status: closed
priority: high
type: testing
source: audit-2026-05-29
created: 2026-05-29
updated: 2026-06-04
prs: ["merged via feat/0106-coverage-backfill @ ef7c289"]
refs: ["0090-ci-eval-test-gating-initiative.md", "0098-signed-flow-e2e-keplr.md"]
---

## Description
The audit found five large coverage gaps in critical surfaces. They share a
test-server seam pattern so grouping into one MR keeps the harness consistent.

### 1. `keplr.ts:signAndBroadcast` error branches unit-uncovered (CRITICAL)
- Where: `packages/web/src/app/keplr.ts:312-396`.
- Only the happy path is exercised (the wallet e2e + same-origin LCD stub).
  Five error throws (`unregistered`, `no hash`, `broadcast rejected (code N)`,
  `tx not committed within Ns`, `tx reverted on chain`) — every one of which
  the UI shows to the user — are unasserted.
- Action: factor the LCD POST + confirm loop into a function that takes a
  `fetch` seam (or stand up test-server LCD with route-specific failure
  modes); assert each branch throws with a recognizable message.

### 2. Public SPA pages have zero e2e (CRITICAL)
- Where: `e2e/` — no specs for `/pay/:id`, `/deposit/:id`, `/vote/:collectionId/:approvalId`.
- These are the unauthenticated entry points strangers (with the link) touch.
  The Keplr mock now supports same-origin LCD → the full multisig vote and
  human deposit can be driven end-to-end. Add three specs.

### 3. `/api/vaults/:collectionId/signoff` has 0 tests (HIGH)
- Where: `packages/web/src/server.ts:976-1007`.
- Three branches: 404 (no multisig vault), success with live tally, success
  with `tallyError:true` (chain read throws). If `getVotes` schema drifts the
  signer page silently shows "0/3 signed" forever.

### 4. Settings WRITE flows zero e2e + onboarding wizard zero e2e (HIGH)
- `e2e/settings.spec.ts` only asserts panel headings render. The rotate-key /
  set-Telegram / reveal-seed wiring is untested through the SPA. Onboarding
  walks the only path every user touches exactly once, also unexercised (the
  test-server pre-seeds a wallet to skip first-run).
- Action: add a settings-write spec + a no-wallet test-server variant for the
  onboarding spec.

### 5. Tightening on existing coverage (MEDIUM cluster)
- `chat()` budget-exceeded path and `LlmAuthError` recovery branch don't
  assert the conversation append or the `chat_out` event meta — covered for
  the reply, not for the side effects.
- `/api/payment-requests/:id/confirm` branches — see #0101.
- `auth` middleware classification matrix gaps: `OPTIONS` preflight on a
  protected route, host-header `1.2.3.4` (not just `evil.example`), IPv6
  loopback, empty Host header (the rebind guard short-circuits, finding from
  security review).
- Replace the 50ms `setTimeout` in `server.test.ts:299` with the `waitFor`
  pattern `tx.test.ts` already uses.

## Acceptance criteria
- Each `signAndBroadcast` throw path has a unit test asserting the message.
- Three new e2e specs: `e2e/pay.spec.ts`, `e2e/deposit.spec.ts`,
  `e2e/vote.spec.ts` (the multisig vote — extends the Keplr mock if needed).
- `/api/vaults/:collectionId/signoff` 3-branch coverage; assertion on tally
  shape, not just status.
- `e2e/settings-write.spec.ts` (rotate / set-Telegram / reveal-seed); new
  `test-server-no-wallet.ts` + `e2e/onboarding.spec.ts`.
- `chat.test`/`server.test` budget+LlmAuth paths assert the conversation entry
  is appended AND the `chat_out` event records `ok:false` + the right meta.
- `auth.test` parametrizes cross-site guard with `evil.com`/`1.2.3.4`/IPv6 +
  adds an `OPTIONS` preflight test on a protected route.

## Notes
Test review findings #1, #2, #3, #4, #5, #11, #12, #13, #15, #16. Pairs with
the eval expansion ticket #107 (different layer).

## Status (2026-05-29) — e2e items split into per-flow tickets
The e2e gaps in this ticket are now tracked individually so each can ship
as one focused MR:
- §2 (public SPA pages) → #0120 (vote — folds in §3), #0121 (pay),
  #0122 (deposit)
- §4 (settings WRITE + onboarding) → #0123 (settings), #0124 (onboarding)
This ticket retains §1 (`signAndBroadcast` unit branches) and §5 (misc
tightening — chat budget/LlmAuth side-effects, auth-classification
matrix gaps, `setTimeout` → `waitFor`). §3 (signoff route) is folded
into #0120's e2e walk.
Adjacent new e2e coverage filed separately: #0117 (in-app vault deposit),
#0118 (vault withdraw UI), #0119 (manager drain + revoke), #0125 (chat
money path).
