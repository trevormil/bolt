---
id: 25
title: "Trust-UX adopts (breadcrumb, receipt, /ledger, plain-English, framing)"
status: closed
priority: medium
type: ux
source: audit
created: 2026-05-26
updated: 2026-05-28
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

## Note 2026-05-28 (reconciliation — stays in-progress)
Ledger/proof-of-action view + plain-English replies shipped (#11/#17). Remaining trust-UX polish (breadcrumb, per-action receipt) not yet built.

## Progress 2026-05-28 #2 (MR !50)
Shipped the behavior-shaping + onboarding slice:
- **"Quiet by default, loud when it matters"** proactivity rule baked into
  `renderSoul` — every persona carries it (act within limits, plain receipt for
  money/state changes, interrupt only when needed).
- **Personality card at creation** (`renderPersonaCard`) — `vellum new` + the
  install wizard show a name/role/voice/wallet card.
Already shipped elsewhere: `/ledger` Telegram command, plain-English sign page
(#45 slice 3), vault gating badges, plain-English replies + ledger view (#11/#17).
Remaining (lower-priority cross-cutting copy, not blocking): the breadcrumb
"here's what I did before asking" approval preamble, an explicit per-chain-op
receipt line with budget-remaining, and the Stripe/YNAB/1Password market-framing
copy in user-facing text. Persona "personality card" ✓.
