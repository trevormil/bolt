---
id: 14
title: "PaymentRequest funding (Stripe-link style)"
status: closed
priority: high
type: feature
source: planning
created: 2026-05-26
updated: 2026-05-26
prs: ["https://labs.gauntletai.com/trevormiller/vellum-project/-/merge_requests/20"]
refs: ["ARCHITECTURE.md"]
---

## Description
Agent spins up a BitBadges PaymentRequest and generates a link; the human opens
it and signs to fund. Agent never pulls funds.

## Acceptance criteria
- Agent creates a PaymentRequest + link
- Human signs via the link; funds move
- Funding event lands in the ledger

## Build-time note: BitBadges pattern
Confirmed feasible by Trevor. **Reference the Meridian repo first** (`~/CompSci/gauntlet/meridian`: `apps/web/lib/chain/` + `lib/prediction-market/`, `apps/aggregator/src/chain/`), **then ASK TREVOR for the exact implementation pattern** before writing chain logic — do not guess.

## Closed 2026-05-28 (backlog reconciliation)
Delivered in the merged local-first build (MR !40). Verified present in the merged code.
