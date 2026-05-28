---
id: 13
title: "Agent spends from a vault within rules"
status: closed
priority: high
type: feature
source: planning
created: 2026-05-26
updated: 2026-05-27
prs: ["https://labs.gauntletai.com/trevormiller/vellum-project/-/merge_requests/14"]
refs: ["ARCHITECTURE.md"]
---

## Description
Agent withdraws/spends from a vault within its protocol-enforced rules; reflected
in the ledger.

## Acceptance criteria
- In-rule spend succeeds and is signed by the agent
- Out-of-rule spend rejected by the chain
- Ledger entry created

## Build-time note: BitBadges pattern
Confirmed feasible by Trevor. **Reference the Meridian repo first** (`~/CompSci/gauntlet/meridian`: `apps/web/lib/chain/` + `lib/prediction-market/`, `apps/aggregator/src/chain/`), **then ASK TREVOR for the exact implementation pattern** before writing chain logic — do not guess.

## Closed 2026-05-28 (backlog reconciliation)
Delivered in the merged local-first build (MR !40). Verified present in the merged code.
