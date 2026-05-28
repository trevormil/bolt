---
id: 9
title: "Per-persona token budgets via the approval engine"
status: closed
priority: high
type: feature
source: planning
created: 2026-05-26
updated: 2026-05-27
prs: ["https://labs.gauntletai.com/trevormiller/vellum-project/-/merge_requests/15"]
refs: ["ARCHITECTURE.md"]
---

## Description
Encode per-persona spend caps using BitBadges approvals (maxNumTransfers /
approvalAmounts per address, ResetTimeIntervals, transferTimes). Protocol-enforced.

## Acceptance criteria
- Set a per-persona spend cap on-chain
- Spend within cap succeeds; over-cap is rejected by the chain
- Rolling-window reset works

## Closed 2026-05-28 (backlog reconciliation)
Superseded by #44 (per-persona daily/weekly/monthly LLM-cost budgets, app-side). The approval-engine framing was dropped.
