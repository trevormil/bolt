---
id: 91
title: "Go all-in on PERSONA.md — CLI persona creation collects it; retire the role/voice inputs"
status: closed
prs: ["https://labs.gauntletai.com/trevormiller/vellum-project/-/merge_requests/78"]
priority: medium
type: feature
source: trevor
created: 2026-05-29
updated: 2026-05-29
refs: ["0087-persona-md-instructions-editor.md", "0019-install-onboarding-wizard.md", "0034-cli-terminal-surface.md"]
---

## Description
#87 made the **web** persona surfaces PERSONA.md-first (create-flow textarea +
Settings editor + buildContext injection). Finish the commitment everywhere: the
**CLI** persona-creation paths still hardcode legacy `role`/`voice` and don't
collect a PERSONA.md — `init-wizard.ts`, `setup.ts`, `commands.ts`, `repl.ts`.

## Acceptance criteria
- CLI persona creation (install wizard + `vellum` new-persona path) collects a
  PERSONA.md (a sensible default template if blank), same as the web form.
- `runSetup` / the create paths pass `instructions` through instead of
  hardcoding `role`/`voice`.
- Go **all PERSONA.md**: the user-facing role/voice inputs are gone on every
  surface; `renderSoul` already prefers `instructions` when set. The legacy
  `role`/`voice` fields may remain on the type for back-compat rendering of any
  existing local personas, but nothing new should collect them.
- A test that a CLI-created persona carries its `instructions`.

## Notes
**Migration is explicitly out of scope / optional** — this is local-only with no
real users yet (Trevor, 2026-05-29). Existing local personas can be recreated;
no soul→PERSONA.md backfill is needed. If a migration is ever wanted (real
users), file separately. Keep it small: the value is CLI parity + removing the
dual role/voice input path so PERSONA.md is the single customization surface.
