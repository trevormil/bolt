---
id: 114
title: "Documentation refresh: README + CLAUDE.md + runbook branding + ADR alignment"
status: open
priority: low
type: docs
source: audit-2026-05-29
created: 2026-05-29
refs: []
---

## Description
Top-level docs are stuck in pre-build state and the brand name drifts across
files. Audit-flagged items:

### 1. Root `README.md` (`/Users/trevormiller/CompSci/gauntlet/vellum-project/README.md:7-11`)
- Says "**Status:** early / pre-architecture", "No product or architecture
  decisions have been made yet". Layout table references only `research/` +
  `backlog/`. Nothing about the 23 shipped packages, working CLI / daemon /
  web / Telegram surfaces, ADRs, or runbooks.
- Action: rewrite Status / Quickstart / Layout to match reality. Point at
  `ARCHITECTURE.md`, `docs/decisions/`, and `docs/runbooks/install-from-
  scratch.md` as canonical install. Keep the PRD verbatim; trim or move the
  "early / pre-architecture" prose to the historical-decisions section.

### 2. Root `CLAUDE.md` (`/Users/trevormiller/CompSci/gauntlet/vellum-project/CLAUDE.md:6-12`)
- Status block tells agents "Ready to build" with order
  "0001 scaffold → 0002 signer→devnet (CRITICAL, validate a real tx day 1)."
  Every one of those has shipped. Live agent guidance pointing at retired
  work is worse than no guidance.
- Action: replace the Status block with current state (shipped surfaces,
  what's gated next). Keep the `/ticket flow` + Meridian-SDK reference rules.

### 3. Brand drift: Vellum vs. Bolt (HIGH)
- Runbooks (`docs/runbooks/install-from-scratch.md`, `schedule-with-cron.md`,
  `telegram-setup.md`) use "Bolt"; root README + CLAUDE.md use "Vellum";
  `BrandLogo.tsx` resolves to "Bolt." Three names for one product across
  docs+code is a continual papercut.
- Action: pick one (the user-facing brand is "Bolt"). Sweep README + CLAUDE.md
  + remaining `Vellum`-named docs to "Bolt" where user-facing; keep "Vellum"
  only for infra identifiers (package name, env vars, internal paths). State
  the canonical name in README §1 + CLAUDE.md §1.

### 4. ADR ↔ implementation alignment (LOW)
- ADR-0003 / 0005 / 0007 all align with current code (audit confirmed). No
  drift to fix. Action: just add a `last-verified: 2026-05-29` line to each
  ADR's frontmatter so future audits can spot drift fast.

### 5. Polish
- `scripts/demo.ts` undocumented (root `package.json:15` exposes `demo`). Add
  one-line header comment + a row to README's scripts table OR delete.
- Telegram TODO at `packages/telegram/src/attach.ts:39` references an internal
  id `T-06` — replace with a real backlog ticket (file one for second-channel
  high-value-spend approval, or drop the comment).

## Acceptance criteria
- README + root CLAUDE.md describe post-merge reality.
- One canonical brand name across user-facing docs (cross-package grep
  confirms).
- ADR frontmatter carries `last-verified`.
- `scripts/demo.ts` documented or removed.

## Notes
Maintainability findings #2, #3, #16, #19, #23. Pure docs MR — no code change.
