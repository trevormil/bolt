---
id: 7
title: "Orchestrator routes messages to personas (bounded)"
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
Route each inbound message to the right persona sub-agent; bounded + depth-limited;
no cross-compartment leakage; routing decision itself must not read persona memory.

## Acceptance criteria
- Message routed to correct persona
- No cross-compartment memory access during routing
- Depth/spawn bounds enforced

## Audit refinement (2026-05-26)
Routing is **deterministic** — DB lookup / explicit `/switch`, NEVER LLM-inferred
from message body (compartment-leak + misroute-charges-wrong-wallet vector, audit
M5/T-07/T-08/F-11). Enforce isolation with a test: inject persona A context into B
→ assert absent. v1 = manual switch only.
