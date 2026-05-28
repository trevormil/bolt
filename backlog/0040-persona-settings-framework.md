---
id: 40
title: "Per-persona settings framework (global defaults + override + inherit)"
status: open
priority: high
type: feature
source: planning
created: 2026-05-27
updated: 2026-05-27
refs: ["ARCHITECTURE.md", "docs/decisions/0002-local-first-terminal-native.md", "0039-local-data-dir.md"]
---

## Description
Surfaced while planning the customizable settings (#41–#44): they all share one
pattern — a **global default** that each **persona can override**, otherwise it
**inherits**. Build that mechanism once so each setting layers on it instead of
reinventing resolution + storage + editing.

Settings live in `~/.vellum` (#39): a global `config` + a per-persona override
set. Resolution is `persona value ?? global value ?? built-in default`. Editable
from the CLI (#34) and the web app, surfaced in onboarding (#19).

## Acceptance criteria
- Typed settings schema (zod) with global defaults; per-persona partial overrides
- `resolveSetting(persona, key)` → effective value, with provenance (which layer
  it came from) for the UI ("inherited from global" vs "overridden")
- Persisted in `~/.vellum` (global + per-persona); hot-reload or cheap re-read
- Read/write API + CLI + web controls; reset-to-inherit per key
- Settings changes recorded in the observability layer (#42)
- The four initial settings (#41 markdown, #42 observability prefs, #43 model,
  #44 budget) consume this — no bespoke per-setting config plumbing
