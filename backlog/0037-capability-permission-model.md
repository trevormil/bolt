---
id: 37
title: "Local capability & permission model (FS, cron, tools, spend)"
status: open
priority: high
type: security
source: planning
created: 2026-05-27
updated: 2026-05-27
refs: ["ARCHITECTURE.md", "docs/decisions/0002-local-first-terminal-native.md"]
---

## Description
The trust spine for the local-first runtime (ADR-0002). Filesystem access (#35),
self-set cron (#36), MCP tools, and a long-running daemon are far more powerful
than a web wrapper — a unified capability/permission model is what makes them
safe. Must land *with* those capabilities, not after.

Trust-first: fail-closed, least-privilege, explicit scoped grants, approval gates
for high-stakes actions, everything in the proof-of-action ledger. This is the
local analog of the on-chain rules that already bound spend.

## Acceptance criteria
- Per-persona capability grants (e.g. `fs.read:<root>`, `fs.write:<root>`,
  `schedule`, `mcp:<server>`, `spend`) persisted in `~/.vellum`; default-deny
- A single enforcement point every tool invocation passes through (engine-level),
  not per-surface
- Approval gates: writes, spends, sensitive paths, and new task creation prompt
  the human (terminal/web) unless a standing grant covers them
- All grant changes + gated actions recorded in the ledger
- Tests: default-deny, grant scoping, approval prompts, ledger coverage
