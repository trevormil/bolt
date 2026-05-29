---
id: 81
title: "Vault withdrawal stays pending for a long time — investigate + surface settle/fail clearly"
status: closed
priority: high
type: bug
source: trevor
created: 2026-05-29
updated: 2026-05-29
prs: ["https://labs.gauntletai.com/trevormiller/vellum-project/-/merge_requests/72"]
refs: ["0062-agent-pay-from-vault.md", "0045-vault-revamp.md", "0014-payment-requests.md"]
---

## Description
Trevor observed that a **vault withdrawal stays pending for a while** —
possibly never settling. Withdrawals run through
`engine.vaults.withdraw(...)` → `TxManager` async confirmation (the demo's
`awaitSettled` polls `txManager.get(id).status` with a 30s timeout). If the tx
lingers in `pending`, either chain confirmation is slow, the background
reconcile isn't advancing it, or the withdrawal genuinely failed without a
clear surfaced error.

## Acceptance criteria
- Reproduce: create a vault, deposit escrow, withdraw within the rule, and time
  how long `txManager.get(id).status` takes to reach `confirmed` (or `failed`).
- Root-cause why it stays `pending`: chain latency vs. a stuck/missing
  confirmation poll vs. `txManager.reconcile()` not picking it up vs. an
  on-chain rejection swallowed as pending.
- Fix so a withdrawal **reliably settles** within a reasonable window, or
  **fails loudly** with a surfaced reason (no silent indefinite pending).
- UX: show withdrawal progress/state in `Vaults.tsx` (pending → confirming →
  done/failed) with the tx hash, instead of an action that appears to hang.
- Regression test covering the confirm/fail transition for a vault withdrawal.

## Notes
This is a money-path correctness issue, so it's high priority — a withdrawal
that appears stuck erodes trust even if it eventually lands. Check whether the
daemon's startup `txManager.reconcile()` (daemon.ts) and the ongoing
confirmation loop both cover vault withdrawals, and whether the Meridian devnet
block time / RPC is the bottleneck. Confirm against a real devnet run, not just
a mock.
