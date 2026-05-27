---
id: 8
title: "One bb1 wallet per persona"
status: in-progress
priority: high
type: feature
source: planning
created: 2026-05-26
updated: 2026-05-27
prs: []
refs: ["ARCHITECTURE.md"]
---

## Description
Each persona gets its own BitBadges `bb1` wallet (own balance + vaults).
Agent holds the hot key; signs within budgets/rules.

## Acceptance criteria
- New persona => new bb1 wallet generated/derived
- Per-persona balance query
- Keys stored via env/secret store, never committed
