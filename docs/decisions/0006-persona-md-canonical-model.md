---
id: 6
title: "Canonical PERSONA.md model — DB soul.instructions is the per-persona source"
status: accepted
date: 2026-05-29
---

## Context

Two independent "PERSONA.md" mechanisms had grown up and both injected into the
system prompt every turn (#93, found in the full-backlog audit):

1. **File-based (#41)** — `~/.vellum/PERSONA.md` (global) + `~/.vellum/personas/<id>/PERSONA.md`
   (per-persona), composed by the orchestrator and read fresh each turn, plus
   `personas/<id>/*.md` referenceable docs.
2. **DB-stored (#87)** — `soul.instructions`, a freeform per-persona doc editable
   from the web Settings + the create flow, rendered by `renderSoul`.

The **per-persona layer was duplicated**: a persona's file `PERSONA.md` and its DB
`soul.instructions` both appended to the prompt, with no defined precedence — two
sources of truth for the same thing.

## Decision

- **The DB `soul.instructions` is the canonical per-persona PERSONA.md.** It's the
  single editable per-persona steering doc (web Settings + the create flow on
  every surface, #87/#91), rendered into the system prompt by `renderSoul`.
- **The file layer keeps only the GLOBAL doc** (`~/.vellum/PERSONA.md`,
  cross-persona) — `readPersonaMarkdown` now reads *only* that file, so nothing
  double-injects. Compose order: `renderSoul` (incl. per-persona instructions) →
  global PERSONA.md → connected-wallet context → recalled memory.
- **`personas/<id>/*.md` remain referenceable on-demand docs** (`listPersonaDocs`),
  NOT auto-injected. An on-demand read tool to load them is a follow-on (#93,
  remaining scope — not in this change).
- **Go all-in on PERSONA.md (#91):** every new persona gets a default PERSONA.md
  template (web + CLI) instead of the legacy structured role/voice; `role`/`voice`
  remain on the type for back-compat rendering of legacy personas but are no
  longer collected from any UI.
- A **size warning** fires when a PERSONA.md is large (it rides every request).

## Consequences

- One per-persona source of truth; no silent double-append.
- Global cross-persona steering is preserved (the one genuinely-unique file layer).
- Existing local personas with a per-persona *file* PERSONA.md will stop having it
  auto-injected — acceptable: local-only, no real users, and they can paste it
  into the DB instructions (web Settings). No migration shipped (see #91/#93).
- Remaining follow-on: the on-demand referenceable-doc read tool (#41 criterion).
