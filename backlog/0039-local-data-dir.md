---
id: 39
title: "Local data dir + config (~/.vellum, XDG-aware)"
status: closed
priority: medium
type: dx
source: planning
created: 2026-05-27
updated: 2026-05-27
refs: ["ARCHITECTURE.md", "docs/decisions/0002-local-first-terminal-native.md"]
---

## Description
Formalize local-first persistence (ADR-0002). Today state lives at a cwd-relative
`./vellum.db`, which breaks when launched from different dirs (bit us already with
the `--filter` cwd trap). Move all local state under a single app data dir
`~/.vellum` (XDG `$XDG_DATA_HOME`/`$XDG_CONFIG_HOME` aware), so the CLI (#34),
daemon (#31), and web all share one location regardless of cwd.

## Acceptance criteria
- Resolve a stable data dir: `$VELLUM_HOME` → XDG → `~/.vellum` (created on first run)
- DBs, persona memory, wallet index, scheduled tasks (#36), logs all under it
- Config file (OpenRouter key ref, chain endpoints, permission defaults) co-located
- `VELLUM_DB_PATH` etc. still honored as overrides (back-compat)
- One-time migration of an existing `./vellum.db` if found

## Closed 2026-05-28
Delivered in the squashed local-first build, merged to `main` via MR !40 (superseded per-ticket MRs !26–!39).
