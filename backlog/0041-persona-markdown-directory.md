---
id: 41
title: "Persona markdown directory — PERSONA.md (always-on) + referenceable docs"
status: open
priority: high
type: feature
source: planning
created: 2026-05-27
updated: 2026-05-27
refs: ["ARCHITECTURE.md", "0006-persona-compartment-core.md", "0040-persona-settings-framework.md", "0039-local-data-dir.md"]
---

## Description
A per-persona markdown directory (the OpenClaw/`CLAUDE.md` pattern), local under
`~/.vellum/personas/<id>/`:

- **`PERSONA.md`** — a core instructions file **appended to EVERY request** for
  that persona, in addition to Vellum's system prompt. The user-editable steering
  layer on top of the structured SOUL (#6).
- **Other markdown files** in the directory — **referenceable** as per-persona
  memory/skills: NOT injected every turn, but retrieved on demand (by name, or via
  the memory/RAG layer) when relevant. The agent can also list/read them as
  skills.

Global pattern (per #40): an optional **global `PERSONA.md`** appended to ALL
personas (a shared house-style/instructions), with the per-persona `PERSONA.md`
appended after it. Persona inherits the global unless it has its own; both can
apply (global + persona) — make the compose order explicit.

## Acceptance criteria
- `~/.vellum/personas/<id>/PERSONA.md` is read fresh and appended to every request
  for that persona (after the system prompt); empty/missing = no-op
- A global `PERSONA.md` appended to all personas; documented compose order
  (system prompt → global PERSONA.md → persona PERSONA.md → conversation)
- Other `.md` files in the dir are discoverable + loadable on demand (a skill/
  reference tool + memory-layer ingestion), NOT auto-injected
- Editable from CLI + web; live-reloaded (next turn picks up edits)
- Token-budget aware: always-on PERSONA.md counts toward context; warn if large
