---
id: 17
title: "Web: budgets/ledger views + streamlined sign pages"
status: open
priority: high
type: feature
source: planning
created: 2026-05-26
updated: 2026-05-26
prs: []
refs: ["ARCHITECTURE.md"]
---

## Description
Budgets + cost/trust ledger views, and the streamlined sign/approve pages that the
agent's links target (BitBadges UI as deep-dive fallback).

## Acceptance criteria
- Per-persona budget + ledger views
- Streamlined sign page handles a PaymentRequest/approval link
- Falls back to BitBadges UI for deep dives

## Build-time note: BitBadges pattern
Confirmed feasible by Trevor. **Reference the Meridian repo first** (`~/CompSci/gauntlet/meridian`: `apps/web/lib/chain/` + `lib/prediction-market/`, `apps/aggregator/src/chain/`), **then ASK TREVOR for the exact implementation pattern** before writing chain logic — do not guess.
