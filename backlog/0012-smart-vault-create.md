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
