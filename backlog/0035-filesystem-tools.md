---
id: 35
title: "Local filesystem tools (scoped, human-approved)"
status: closed
priority: high
type: feature
source: planning
created: 2026-05-27
updated: 2026-05-27
refs: ["ARCHITECTURE.md", "docs/decisions/0002-local-first-terminal-native.md", "0037-capability-permission-model.md"]
---

## Description
Give the agent OpenClaw-style filesystem access — read/write the user's local
files — as persona-scoped tools, gated by the capability/permission model (#37).
This is a major capability and a major risk surface, so it ships *with* its
guardrails.

## Acceptance criteria
- Tools: read file, write/edit file, list dir, search — exposed to the agent loop
- **Scoped to granted roots** per persona (no access outside; path-escape /
  symlink traversal blocked)
- **Writes + sensitive paths require human approval** (terminal prompt / web
  approve); reads of granted roots may be auto-allowed per policy
- Every FS action recorded in the proof-of-action ledger (path, op, persona,
  authority)
- Tests: sandbox enforcement (escape attempts denied), approval gating, ledger entries

## Closed 2026-05-28
Delivered in the squashed local-first build, merged to `main` via MR !40 (superseded per-ticket MRs !26–!39).
