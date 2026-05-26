---
id: 13
title: "Agent spends from a vault within rules"
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
Agent withdraws/spends from a vault within its protocol-enforced rules; reflected
in the ledger.

## Acceptance criteria
- In-rule spend succeeds and is signed by the agent
- Out-of-rule spend rejected by the chain
- Ledger entry created
