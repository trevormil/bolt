---
id: 58
title: "Unify persona-creation UX (onboarding == add-persona)"
status: in-progress
priority: medium
type: ux
source: review
created: 2026-05-28
updated: 2026-05-28
prs: ["https://labs.gauntletai.com/trevormiller/vellum-project/-/merge_requests/52"]
refs: ["0019-install-onboarding-wizard.md", "0053-frontend-design-revamp.md"]
---

## Description
Trevor's call (2026-05-28): creating a persona happens in two different places
with two different UIs — the first-run web onboarding (`SetupFlow` persona step)
and the later "add persona" flow (`Welcome` / `Onboarding`). It feels scattered.
A new persona should go through the **same** UX as the onboarding persona step.

## Acceptance criteria
- One shared persona-creation component used by BOTH first-run setup and the
  "+ new persona" action — same fields, same styling (Aurum), same validation.
- The first-run flow composes it (after key+wallet); the in-app "add persona"
  reuses it directly (modal or dedicated view).
- Remove the now-duplicated `Welcome` / `Onboarding` persona UI (or fold it into
  the shared component) so there's a single source of truth.
- Agent-native parity preserved: persona creation already has an agent path —
  keep it; this is UI consolidation only.

## Notes
Caught during the #19/#53 review. Pure UI consolidation — no API change. Pairs
with the onboarding work; stack on top of it.
