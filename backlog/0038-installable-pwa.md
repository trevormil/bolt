---
id: 38
title: "Installable PWA web entrypoint"
status: closed
priority: low
type: feature
source: planning
created: 2026-05-27
updated: 2026-05-27
refs: ["ARCHITECTURE.md", "docs/decisions/0002-local-first-terminal-native.md"]
---

## Description
Make the local web app installable as a **PWA** so the entrypoint feels like a
native app while still talking only to localhost (ADR-0002: web is the nice
entrypoint, terminal is primary). No hosting — the service worker shells a
localhost SPA.

## Acceptance criteria
- Web manifest (name, icons, theme) + service worker; app is installable
- App shell loads offline-of-cloud; API calls hit the local daemon
- Connect/fund/vault/pay flows work in the installed PWA
- Pairs with bundle code-splitting (#32) so first load is snappy

## Closed 2026-05-28
Delivered in the squashed local-first build, merged to `main` via MR !40 (superseded per-ticket MRs !26–!39).
