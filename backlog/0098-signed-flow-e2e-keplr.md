---
id: 98
title: "Signed-flow e2e via the Keplr mock — land the LCD route interception"
status: closed
prs: ["https://labs.gauntletai.com/trevormiller/vellum-project/-/merge_requests/89"]
priority: medium
type: testing
source: observed
created: 2026-05-29
refs: ["0090-ci-eval-test-gating-initiative.md", "0083-multisig-vote-progress-ux.md"]
---

## Description
The Keplr mock harness (`e2e/support/keplr.ts`, MR !86) has a **verified connect
tier** (vault create works offline). Its **sign+broadcast tier** is scaffolded but
not yet covered by a passing test, so the human-signed flows have no e2e:
- WalletPanel "From my wallet" send (human → agent) + "Send USDC".
- Escrow funding (Vaults `fundFromKeplr`).
- Multisig vote sign-off (`VotePage`, `castVoteMsg`).
- Deposit (`DepositPage`), pay (`PayPage`).

## What's already done (don't redo)
- The window.keplr mock includes a `getOfflineSigner` whose `signDirect` returns a
  canned `DirectSignResponse`.
- **Solved:** `getKey` must return `pubKey` + `address` (Uint8Array) + `algo`, or
  the bitbadges SDK's `GenericCosmosAdapter.fromKeplr` throws "argument must be …
  Buffer … Received undefined" deep in signing. The mock now returns the full Key.

## The blocker to crack
`signAndBroadcast` (packages/web/src/app/keplr.ts) fetches the LCD directly:
`fetchAccount` (`GET {lcd}/cosmos/auth/v1beta1/accounts/{addr}`) → if null it
throws "unregistered on-chain", then `POST {lcd}/cosmos/tx/v1beta1/txs`, then
`confirmTx` polls `GET .../txs/{hash}`. The harness registers
`page.route("**/cosmos/...")` stubs for all three, but they are **not catching the
cross-origin LCD calls** — `signAndBroadcast` still reaches the real LCD and the
flow aborts "unregistered".

Likely fixes to try:
- Verify the exact request URL the SDK / keplr.ts issues (the `lcd` from
  `/api/config` is the real meridian origin) and confirm the glob matches it.
- Use `context.route` (BrowserContext) instead of `page.route`, or route by the
  concrete origin pulled from `/api/config`, in case page-scoped routing misses
  the dynamically-imported SDK's requests.
- Confirm the dynamic `import("bitbadges")` chunk loads in the offline test build
  (it's same-origin, served by the test-server) and that its account/broadcast
  calls go through `fetch` (interceptable) not a worker.

## Acceptance criteria
- An account/broadcast/tx-query stub reliably intercepts the LCD so
  `signAndBroadcast` resolves with the stubbed txhash offline.
- At least one signed-flow spec passes deterministically: human send (simplest),
  then ideally escrow fund + multisig vote.
- Full e2e green fresh; no reliance on retries for these.

## Notes
MEDIUM — unblocks the money-path + multisig e2e coverage under #90. Pairs with the
#0083 vote-tally work (the VotePage flow). The connect-tier coverage (vault
create) already shipped in MR !86, so this is purely the signed half.
