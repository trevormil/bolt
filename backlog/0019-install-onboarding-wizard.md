---
id: 19
title: "Install + onboarding wizard (sub-minute, local-first)"
status: closed
priority: high
type: dx
source: planning
created: 2026-05-26
updated: 2026-05-28
prs: ["https://labs.gauntletai.com/trevormiller/vellum-project/-/merge_requests/51"]
refs: ["ARCHITECTURE.md", "docs/decisions/0002-local-first-terminal-native.md"]
---

## Description
One command, zero → a running **local** agent in under a minute (the PRD bar),
through a polished wizard. Per ADR-0002 this is a headline feature, not a
footnote: the install IS the first impression.

The basic `bun run setup` (install + serve) shipped in !21; this elevates it to a
full local-first onboarding wizard (terminal + web halves over the same flow).

## Acceptance criteria
- Single command installs + launches; time-to-first-interaction < 60s on a clean
  machine (bun present)
- Wizard collects/sets up: OpenRouter API key; agent signer wallet (generate new
  or import mnemonic); first persona; permission defaults (#37); the API token if
  the user wants the daemon exposed
- Creates the local data dir `~/.vellum` (#39) and registers the background daemon
  (#31)
- Nothing hosted — only OpenRouter is contacted; works fully offline-of-cloud
- Terminal wizard + matching web onboarding screen, both driving the same setup

## Note 2026-05-28 (reconciliation — stays open)
quickstart.sh + daemon:install (#31) + PWA (#38) + onboarding flow (#15) landed. A single polished sub-minute install wizard remains.
