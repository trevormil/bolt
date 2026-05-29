---
id: 118
title: "e2e: Vault withdraw — agent within-cap + pending→confirmed UI status"
status: in-progress
priority: high
type: testing
source: trevor
created: 2026-05-29
updated: 2026-05-29
refs: ["0106-test-coverage-backfill.md", "0099-tx-state-machine-hardening.md", "0081-vault-withdrawal-stuck-pending.md"]
---

## Description
`pay-from-vault` is well-covered at the engine layer (gating math, escrow
tracking, approval tracker) but no e2e walks the UI through the
**pending → confirmed** status transition that TxManager surfaces. If the
activity row freezes at "pending" the user has no signal that the move
actually settled — exactly the symptom flagged in #0081.

## Acceptance criteria
- `e2e/vault-withdraw.spec.ts`: trigger an in-cap withdraw (chat-issued
  `pay_from_vault` or UI button) → activity feed shows a pending row →
  poll- or event-driven update to confirmed → balances reflect the move.
- Asserts the **status transition** (pending → confirmed), not just the
  final balance.
- Covers the agent-initiated within-cap path only. Over-cap rejection is
  already unit-tested in `pay-from-vault.test.ts`.

## Notes
The TxManager reconcile loop is the seam under test; re-verify after #0099
/ #0100 land (they may adjust the chokepoint locking).
