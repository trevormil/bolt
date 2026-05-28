---
id: 34
title: "Terminal CLI/TUI agent surface (the OpenClaw experience)"
status: closed
priority: high
type: feature
source: planning
created: 2026-05-27
updated: 2026-05-27
refs: ["ARCHITECTURE.md", "docs/decisions/0002-local-first-terminal-native.md"]
---

## Description
The **primary** surface (ADR-0002): an interactive, local terminal agent —
OpenClaw-class — driving the existing `@vellum/engine`. Chat in the terminal,
run tools (filesystem #35, MCP, scheduled tasks #36), manage personas/vaults,
see the ledger — all locally. The engine is already surface-agnostic; this is a
new thin client alongside web + Telegram.

## Acceptance criteria
- A `vellum` CLI: interactive REPL/TUI chat against a selected persona
- Streams the agent loop; renders tool calls + approvals inline (capability gates
  from #37 surface as terminal prompts)
- Subcommands for the non-chat ops (persona create/list, wallet/balance, vaults,
  ledger, schedule) so it's scriptable too
- Shares `~/.vellum` state with the daemon (#31) — no divergent state
- Works offline-of-cloud (only OpenRouter contacted)

## Closed 2026-05-28
Delivered in the squashed local-first build, merged to `main` via MR !40 (superseded per-ticket MRs !26–!39).
