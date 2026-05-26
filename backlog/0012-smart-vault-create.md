---
id: 12
title: "Smart vault create — agent creates, human is manager"
status: open
priority: critical
type: feature
source: planning
created: 2026-05-26
updated: 2026-05-26
prs: []
refs: ["ARCHITECTURE.md"]
---

## Description
Agent creates a 1:1 USDC-backed smart-token vault with rules (caps/allowlists/time
gates) in its approvals, and sets the HUMAN as collection manager. See
research/payment-architecture.md + research/bitbadges-integration.md.

## Acceptance criteria
- Agent creates a vault collection autonomously
- Human set as manager (only human can update rules)
- Rules enforced by the chain (non-bypassable)
- Agent can create multiple vaults (per purpose)

## Audit refinement (2026-05-26)
- **Atomic manager handoff (M3/T-09/F-09):** create -> set human as manager ->
  lock manager-update perms -> VERIFY agent has zero manager capability, as ONE
  tested primitive. No window where the agent is manager.
- **GATE (M2):** verify the devnet USDC->backing-address funding path works
  (BitBadges Q) BEFORE building this. Pre-fund the demo vault from alice.
- Cap demo at 2-3 vaults; "unlimited" is a future claim (F-09).

## Build-time note: BitBadges pattern
Confirmed feasible by Trevor. **Reference the Meridian repo first** (`~/CompSci/gauntlet/meridian`: `apps/web/lib/chain/` + `lib/prediction-market/`, `apps/aggregator/src/chain/`), **then ASK TREVOR for the exact implementation pattern** before writing chain logic — do not guess.
