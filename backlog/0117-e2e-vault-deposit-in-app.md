---
id: 117
title: "e2e: Vault deposit — in-app human funds escrow via Keplr"
status: open
priority: high
type: testing
source: trevor
created: 2026-05-29
refs: ["0106-test-coverage-backfill.md", "0098-signed-flow-e2e-keplr.md"]
---

## Description
The deposit-to-vault flow — human signs a `MsgSend` that funds the vault's
escrow address — has unit coverage on the engine side but no e2e walk. The
Keplr mock + same-origin LCD seam from #0098 make this driveable end-to-end.

Scope: the authenticated **in-app** deposit affordance (vault detail page).
The `/deposit/:id` public-link variant is split out as #0122.

## Acceptance criteria
- `e2e/vault-deposit.spec.ts`: open vault detail → click Deposit → enter
  amount → Keplr mock signs MsgSend to escrow → broadcast → UI reflects new
  escrow balance.
- Asserts on the success affordance AND an escrow-balance read (chain query
  seam or activity event), not just the toast.
- Reuses the existing `mockKeplr` + test-server LCD setup; no new harness.

## Notes
Pairs with #0118 (withdraw e2e). Extension of #0098's signed-flow harness.
