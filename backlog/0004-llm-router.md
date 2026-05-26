---
id: 4
title: "LLM provider router (cheap-default → escalate) + metering"
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
Route routine calls to a cheap model, escalate to frontier on complexity signals.
Emit per-call token/$ metering for the cost ledger.

## Acceptance criteria
- Pluggable providers, pinned + env-configured
- Heuristic routing cheap→frontier; override per call
- Each call emits a metering record
