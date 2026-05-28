---
id: 44
title: "Per-persona spend budgets — daily/weekly/monthly windows"
status: open
priority: medium
type: feature
source: planning
created: 2026-05-27
updated: 2026-05-27
refs: ["ARCHITECTURE.md", "0009-token-budgets.md", "0042-deep-observability-dashboard.md", "0040-persona-settings-framework.md"]
---

## Description
Generalizes the shipped LLM-spend budget (#9, a single rolling-24h $ cap) into
configurable **daily / weekly / monthly** limits, **per persona**, tracked over
the deep observability layer (#42) as the single source of spend truth.

This is the LLM/token *cost* budget (OpenRouter spend) — a cost guardrail, NOT a
USDC spending limit (those live only in vaults, per the earlier decision). Global
default limits + per-persona override (via #40); inherit otherwise.

## Acceptance criteria
- Configurable limits per window (daily, weekly, monthly) — any subset — per
  persona, with global defaults (#40)
- Spend computed from the observability event store (#42), windowed correctly
  (calendar vs rolling — pick + document)
- Enforcement: when a window's limit is hit, gate further LLM calls for that
  persona (clear message; mirrors today's budget-exceeded path) until the window
  resets or the human raises it
- Dashboard (#42): burn-down per window vs limit, with projection
- Tests: window accounting, limit enforcement at the boundary, inherit vs override
