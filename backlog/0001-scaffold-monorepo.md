---
id: 1
title: "Scaffold bun/TS monorepo (agent · telegram · web · shared)"
status: in-progress
priority: critical
type: dx
source: planning
created: 2026-05-26
updated: 2026-05-26
prs: []
refs: ["ARCHITECTURE.md"]
---

## Description
Stand up the monorepo skeleton with bun workspaces and a zod-parsed env config.

## Acceptance criteria
- bun workspace with `agent/`, `telegram/`, `web/`, `shared/` packages
- env parsed through zod on startup; `.env.example` documents required vars
- `bun run dev` boots without errors

## Phase
0 — Foundation
