---
id: 36
title: "Agent-settable scheduled tasks (local cron)"
status: closed
priority: high
type: feature
source: planning
created: 2026-05-27
updated: 2026-05-27
refs: ["ARCHITECTURE.md", "docs/decisions/0002-local-first-terminal-native.md", "0018-scheduled-check-ins.md"]
---

## Description
OpenClaw-style scheduling: the agent (or the user) can register recurring/one-off
**tasks** that run agent work on a schedule, locally. Generalizes the per-persona
check-in scheduler (#18) from one hardcoded job to arbitrary user/agent-defined
tasks, run by the local daemon (#31).

## Acceptance criteria
- A persisted task store in `~/.vellum`: { persona, schedule (cron/interval),
  prompt/action, enabled }
- Agent tool + CLI/web to create / list / pause / delete tasks
- Daemon runs due tasks through the engine; output delivered to the persona's
  channel (Telegram/web) + ledger
- **Setting/editing a task is capability-gated (#37)** and reviewable; a task that
  spends or touches the FS still hits those approval gates at run time
- Tests: schedule fires the task (fake clock), pause/delete, survives restart

## Closed 2026-05-28
Delivered in the squashed local-first build, merged to `main` via MR !40 (superseded per-ticket MRs !26–!39).
