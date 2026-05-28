---
id: 10
title: "Free-form x/bank balance (capped)"
status: closed
priority: medium
type: feature
source: planning
created: 2026-05-26
updated: 2026-05-27
prs: ["https://labs.gauntletai.com/trevormiller/vellum-project/-/merge_requests/15"]
refs: ["ARCHITECTURE.md"]
---

## Description
A small discretionary x/bank tier per persona for free-form spend; capped so
significant value routes through vaults.

## Acceptance criteria
- Persona holds a discretionary balance
- Configurable cap enforced

## Audit refinement (2026-05-26)
**Hard ceiling ≤ $25/persona**, enforced by never funding above it (audit
M4/T-01/T-05) — this tier has no on-chain rule enforcement. Surface the balance
every turn. (Deferred from MVP, but the cap is mandatory whenever it ships.)

## Closed 2026-05-28 (backlog reconciliation)
Superseded — the free-form USDC cap was removed by product decision. Uncapped x/bank balance shipped; spending limits live ONLY in vaults.
