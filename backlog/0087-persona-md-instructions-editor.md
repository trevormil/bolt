---
id: 87
title: "Revamp per-persona customization → a PERSONA.md instructions doc appended to every request"
status: closed
priority: high
type: feature
source: trevor
created: 2026-05-29
updated: 2026-05-29
prs: ["https://labs.gauntletai.com/trevormiller/vellum-project/-/merge_requests/75"]
refs: ["0053-frontend-design-revamp.md", "0019-install-onboarding-wizard.md"]
---

## Description
Replace the structured per-persona `Soul` fields (tone / role / voice /
description) with a single freeform **PERSONA.md** — a markdown instructions doc
that gets appended to **every** request for that persona, exactly like a
`CLAUDE.md`. Simpler, more expressive, and the mental model people already know.

## Acceptance criteria
- **Data model:** each persona has a freeform `instructions` markdown field (the
  PERSONA.md) instead of (or superseding) the `Soul` tone/role/voice/description
  fields. Plan a migration for existing personas (fold their current soul fields
  into a generated PERSONA.md so nothing is lost).
- **Prompt assembly:** the orchestrator's `buildContext()` appends the persona's
  PERSONA.md to the system prompt on every turn (web + Telegram). It composes
  with the existing walled per-persona memory and the connected-wallet context
  (#73) — order + precedence defined and documented.
- **Editor in Settings:** a markdown editor to view/edit the active persona's
  PERSONA.md, saved server-side.
- **On new persona creation:** the create flow (web `PersonaForm` + onboarding +
  CLI) collects the PERSONA.md (with a sensible default/template) instead of the
  tone/voice inputs.
- Tests: persona CRUD with `instructions`; buildContext includes it; the
  migration produces a valid PERSONA.md from legacy soul fields.

## Notes
Substantial — touches the persona store, the system-prompt assembly, the create
UI on every surface, and Settings; needs a migration for existing personas. Keep
it its own MR for reviewability. Open design calls: do we drop the `Soul` type
entirely or keep `name` (still needed as a label) + replace the rest? Is there a
length cap on the doc (it rides every request → token cost)? Default template
content for a fresh persona? Decide these up front.
