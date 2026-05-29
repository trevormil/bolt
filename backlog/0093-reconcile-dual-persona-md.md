---
id: 93
title: "Reconcile the two PERSONA.md systems into one coherent model (file-based #41 vs DB soul.instructions #87)"
status: closed
prs: ["https://labs.gauntletai.com/trevormiller/vellum-project/-/merge_requests/78"]
priority: medium
type: feature
source: audit
created: 2026-05-29
updated: 2026-05-29
refs: ["0041-persona-markdown-directory.md", "0087-persona-md-instructions-editor.md", "0091-cli-persona-md-parity.md"]
---

## Description
Two independent "PERSONA.md" mechanisms both inject into the system prompt every
turn, with no defined precedence:
1. **#41 file-based** — `packages/persona/markdown.ts`, composed by the
   orchestrator (`orchestrator.ts:~229`) global → per-persona → conversation,
   read fresh per turn.
2. **#87 DB-stored** — `soul.instructions` (web/CLI-editable), injected via
   `renderSoul`.

Result: overlapping sources of truth; a reader can't tell which doc wins, and
both append to the prompt. Now that we're going all-in on PERSONA.md (#91), pick
ONE coherent model and document it.

## Acceptance criteria
- **Decide + document the canonical model.** Recommended: the DB
  `soul.instructions` (#87) is the editable PERSONA.md (the single customization
  surface); the file-based system (#41) is repurposed for *referenceable* docs
  loaded **on demand**, not always-on — OR is removed if redundant. Capture the
  decision in an ADR.
- **One injection path:** the system prompt has a single, clearly-ordered
  PERSONA.md contribution (no silent double-append). If both layers survive,
  define + test their precedence.
- **On-demand persona-doc read tool** (the unmet #41 criterion): `listPersonaDocs`
  exists but is only referenced by its own test — expose a capability-gated agent
  tool to list + read referenceable `.md` docs on demand, instead of injecting
  everything always-on.
- **Large-doc guard:** a token-budget warning (log/UI) when an always-on
  PERSONA.md is large, since it rides every request (cost).
- Tests for the chosen precedence + the doc-read tool.

## Notes
This is architectural coherence, not a user-facing bug — but it directly
finishes the "all PERSONA.md" commitment (#91). Audit (2026-05-29) confirmed
both systems fire today. Prefer deleting the redundant path over keeping two
(§2 simplicity); only keep both if on-demand referenceable docs are genuinely
wanted alongside the always-on instructions.
