---
id: 17
title: "Web: budgets/ledger views + streamlined sign pages"
status: closed
priority: high
type: feature
source: planning
created: 2026-05-26
updated: 2026-05-27
prs: ["https://labs.gauntletai.com/trevormiller/vellum-project/-/merge_requests/11"]
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

## Closed 2026-05-28 (backlog reconciliation)
Delivered in the merged local-first build (MR !40). Verified present in the merged code.
