---
id: 14
title: "PaymentRequest funding (Stripe-link style)"
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
Agent spins up a BitBadges PaymentRequest and generates a link; the human opens
it and signs to fund. Agent never pulls funds.

## Acceptance criteria
- Agent creates a PaymentRequest + link
- Human signs via the link; funds move
- Funding event lands in the ledger
