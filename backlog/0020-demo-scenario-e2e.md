---
id: 20
title: "E2E demo scenario proving the thesis"
status: open
priority: high
type: docs
source: planning
created: 2026-05-26
updated: 2026-05-26
prs: []
refs: ["ARCHITECTURE.md"]
---

## Description
Script the single end-to-end demo: persona with a vault + budget, agent does a
task that spends within rules, a PaymentRequest funds it, all shown in the ledger.

## Acceptance criteria
- Written demo script (steps + expected ledger output)
- Runs end-to-end on the Meridian devnet

## Audit refinement (2026-05-26)
**Pinned demo = Scenario C+A** (recurring payment + vault-creation moment), ~5-7
min live on the devnet. Full script: research/audit/04-new-ideas.md §Recommended
demo. Demo-day risks + mitigations: research/audit/03-failure-ops.md §Demo-day.
