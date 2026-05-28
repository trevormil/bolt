---
id: 26
title: "Web UI component library (Dusk design system)"
status: closed
priority: high
type: feature
source: planning
created: 2026-05-27
updated: 2026-05-27
prs: []
refs: ["ARCHITECTURE.md"]
---

## Description
Seed `@vellum/ui` — the component library the web app (0015-0017) builds on.
Cherry-picked + adapted from a Claude Design kit (the "Dusk" direction: dark base
+ electric-lime accent), re-implemented in our stack (React + TS + Tailwind),
themeable via CSS variables (dark default). The kit's "Sprig" branding + sample
data are dropped; tokens, icon set, and component styles are kept.

## Acceptance criteria
- Tailwind preset + themeable token CSS (Dusk palette via CSS vars)
- Ported icon set as a typed Icon component
- Base components: Button (variants), Card, Input, Badge, Avatar
- Components render (renderToStaticMarkup) with expected structure/classes — tested
- No "Sprig" branding or kit sample data carried over

## Phase
Web foundation (pre-0015) — consumed by the web-app tickets
