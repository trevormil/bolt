---
id: 62
title: "Shareable vault deposit-request page (the 'fund this vault' flow)"
status: in-progress
priority: medium
type: feature
source: review
created: 2026-05-28
updated: 2026-05-28
refs: ["0014-payment-request-links.md", "0045-vault-revamp-gating-multisig.md"]
---

## Description
The shareable "fund this vault" flow — the deposit analog of payment requests
(#14). The agent/user raises a one-time deposit request for a specific vault;
anyone the link is shared with opens `/deposit/:id`, connects Keplr, and signs
`vaultDepositMsg` to fund the vault's escrow from their own wallet. Mirrors the
PaymentRequest pattern (#14) closely — same store/route/page structure and trust
posture — but the on-chain action is a vault deposit instead of a bank send.

## Acceptance criteria
- `DepositRequests` sqlite store mirroring `PaymentRequests`: a row = a pending
  deposit request; deleted on fulfilment/dismissal.
- Routes mirroring the payment-request ones: `POST /api/personas/:id/deposit-requests`,
  `GET` list, public `GET /api/deposit-requests/:reqId`, `POST .../confirm`
  (light: delete-by-id after the sign), `DELETE` dismiss.
- `/deposit/:id` public page (in `isPublicRoute`): "Fund <symbol> vault —
  <amount> USDC", connect Keplr, sign `vaultDepositMsg` → confirm/delete.
- Vaults panel: per-vault "Request deposit" action (amount + optional memo →
  shareable `/deposit/:id` link with copy button) + a pending-deposit-requests
  list with dismiss, mirroring `PendingRequests` in `WalletPanel`.
- `api.ts` client methods: `createDepositRequest`, `listDepositRequests`,
  `getDepositRequest`, `dismissDepositRequest`.
- Tests mirroring the payment-request route tests (create → list → public get →
  dismiss; the public GET is reachable without auth).

## Notes
Confirm is intentionally LIGHT — delete-by-id after the funder's sign (no deep
escrow verification, unlike the payment-request confirm which verifies the
on-chain credit). A premature delete only removes a UI prompt; no funds are at
risk because the deposit IS the funder's own on-chain tx. Stacked on #61/#62
(agent-pay-from-vault).
