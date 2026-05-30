---
id: 101
title: "Payment-request /confirm: untested branches, txHash SSRF, and unrelated-tx replay"
status: closed
priority: critical
type: security
source: audit-2026-05-29
created: 2026-05-29
refs: ["0062-vault-deposit-request-page.md"]
---

## Description
The public, unauthenticated `/api/payment-requests/:id/confirm` route is the
share-link funding entry point. The audit found three problems on this one
route.

### 1. txHash injected verbatim into LCD URLs (HIGH — SSRF lever)
- Where: `packages/web/src/server.ts:1158-1205`, `packages/chain/src/client.ts:195-233`.
- Body `txHash` is `.trim()`-only then concatenated into
  `${BITBADGES_LCD}/cosmos/tx/v1beta1/txs/${hash}` (twice: confirmTx and
  verifyCredit). No hex/length validation. An anonymous remote caller can drive
  LCD path-traversal probes, control-char attacks, and 15s-blocking long-polls
  through the daemon's egress. On a non-loopback bind this is externally
  reachable.
- Fix: validate `/^[0-9A-Fa-f]{64}$/` at the route boundary AND in
  `chain/client.ts:confirmTx` (defense in depth).

### 2. verifyCredit accepts unrelated funder's tx hash as confirming the request (HIGH — replay)
- Where: `packages/web/src/server.ts:88-115,1170-1179`.
- The check is `creditedAmount(events, toAddress, denom) >= minMicro`. If Alice
  raises a $10 request and Bob (unrelated funder) coincidentally sends $10 to
  the persona, an attacker who learns Bob's tx hash POSTs it to Alice's request
  → request gets marked filled and deleted. Alice's funder is told "link
  consumed" and never pays. The `recordOnchain(txHash)` dedup blocks the
  *second* replay; it doesn't tie request → tx.
- Fix: at request creation, store the persona's address-of-record in the request
  + include the request id in the agent-minted memo (`memo: "vellum funding
  <reqId>"`); `verifyCredit` requires the tx memo to match.

### 3. Every branch except "missing txHash" is untested through the route (CRITICAL)
- Where: `packages/web/src/server.test.ts:1071-1098`.
- The route has 4 money-moving branches: confirmTx throws, verifyCredit returns
  false, recordOnchain returns `{created:false}` → 409, happy path → ledger +
  delete. Only the `400 missing txHash` precondition is exercised.
- Fix: add 4 route tests with seamed `confirmTx`/`verifyCredit`/`ledger`
  injection. The same shape applies to `/api/deposit-requests/:id/confirm`.

## Acceptance criteria
- The `txHash` body param is hex+length validated at the HTTP boundary AND in
  `chain/client.ts:confirmTx`. A test asserts a non-hex hash returns 400 before
  any LCD call fires.
- A payment request stores its target address + memo at creation time and the
  confirm route asserts both before marking filled. Test: a tx that credits the
  persona but lacks the request memo → 400, request stays open.
- Route coverage: confirmTx throw / verifyCredit false / dedup 409 / happy path
  → 4 new tests; same for deposit-requests.

## Notes
Security findings #3, #7 + test review #1. All three should be in one MR — the
SSRF and replay fixes need the test scaffolding the coverage backfill creates.

## Status (2026-05-30) — shipped via MR-3
- §1 SSRF via txHash → **shipped**. `@vellum/chain` exports `isTxHash`
  (`/^[0-9A-Fa-f]{64}$/`); the route gates at the HTTP boundary AND
  `confirmTx` re-validates. Test-server harness emits 64-hex hashes per call
  (was display-only `E2EHUMANTX`) so the chain client + route validators see
  conformant inputs in e2e; the dependent e2e specs + LCD GET stub updated.
- §2 unrelated-tx replay → **shipped**. Payment requests now bind to a
  canonical tx-memo `vellum funding <reqId>` via exported
  `paymentRequestTxMemo(reqId)`. `verifyCredit` asserts `tx.body.memo` equals
  that string before accepting the tx; the PayPage signs with the canonical
  memo. Test asserts an unrelated funder's tx doesn't consume the request.
- §3 route coverage → **shipped**. Five new tests covering the route's
  branches (non-hex hash → 400 before LCD; confirmTx reverts → 400;
  verifyCredit memo mismatch → 400 + request stays open; happy path → 200 +
  request consumed; dedup with same txHash → 409 + second request stays open).
