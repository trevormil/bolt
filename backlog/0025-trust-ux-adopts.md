---
id: 25
title: "Trust-UX adopts (breadcrumb, receipt, /ledger, plain-English, framing)"
status: open
priority: medium
type: ux
source: audit
created: 2026-05-26
updated: 2026-05-26
prs: []
refs: ["ARCHITECTURE.md", "research/audit/00-summary.md"]
---

## Description
Cheap, high-leverage UX that makes the trust thesis visceral (audit 04 Top Adopts).
Mostly copy/framing + small handlers. Sprinkle into the surface tickets; this
ticket tracks the set.

## Acceptance criteria
- Breadcrumb approval message: show what the agent did autonomously before the ask
- Receipt message after every chain op (tx hash + budget remaining) — anti-hallucination
- `/ledger` Telegram command (last 5 actions, link to web)
- Plain-English vault rules + sign page (never raw hex)
- Stripe-link / YNAB-envelope / 1Password copy framing in user-facing text
- Persona "personality card" at creation
- "Quiet by default, loud when it matters" proactivity rule in the persona SOUL

## Phase
Cross-cutting polish (a few are MVP: breadcrumb, receipt, plain-English sign)
