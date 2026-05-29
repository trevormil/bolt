---
id: 92
title: "Frontend polish pass — accessibility, responsive layout, loading/skeleton states (#53 follow-on)"
status: closed
prs: ["https://labs.gauntletai.com/trevormiller/vellum-project/-/merge_requests/80"]
priority: medium
type: ux
source: audit
created: 2026-05-29
updated: 2026-05-29
refs: ["0053-frontend-design-revamp.md", "0026-ui-component-library.md", "0047-frontend-surfaces.md"]
---

## Description
The Aurum revamp (#53) delivered the visual design but three of its acceptance
criteria are essentially uncovered across `packages/web/src/app/*.tsx`:
- **Accessibility: none.** No `aria-*` / `role=` / `focus-visible` /
  `prefers-reduced-motion` anywhere.
- **Responsive:** breakpoints in only ~1 of ~15 surfaces (Activity.tsx).
- **Loading states:** no skeleton/spinner affordances during async loads
  (persona list, conversations, balances, vaults, ledger).

## Acceptance criteria
Likely sliced into a few PRs:
- **Accessibility:** semantic roles + `aria-label`s on icon-only buttons,
  visible `focus-visible` rings on all interactive elements, `aria-live` for
  async status (chat "thinking", save toasts), and `prefers-reduced-motion`
  honored for the gold/glow animations. Keyboard-navigable rails/menus.
- **Responsive:** the core surfaces (Chat + session rail, Vaults, Settings,
  WalletPanel, onboarding) hold up on narrow + wide viewports; the session rail
  / panels collapse sensibly on small screens.
- **Loading states:** skeleton/spinner placeholders for the main async reads so
  panels don't flash empty then pop.
- Extend the e2e/a11y checks where cheap (axe-style assertions are a stretch).

## Notes
Polish-class, not functional/trust — the app works and looks good; this is
inclusivity + cross-screen robustness + perceived quality, which matter for a
hiring-partner demo (especially a11y if anyone inspects the DOM). Lower-stakes
than the money-path (#89) and testing (#90) gaps, so sequence after those.
Base the a11y patterns in `@vellum/ui` primitives so every surface inherits
them. Slice as makes sense rather than one mega-MR.

## Progress 2026-05-29 (slice 1 — MR !80, stays in-progress)
Shipped the **a11y foundation** (propagating): focus-visible rings on the
`@vellum/ui` Button + Input primitives, a global `prefers-reduced-motion` block
in `theme.css`, and aria-labels on the Chat headline surface's icon-only buttons
+ message input. **Remaining (need browser-iteration QA):** responsive layout
across the ~15 surfaces, skeleton/loading states for async reads, and the full
aria-label sweep of the other surfaces (WalletPanel, Vaults, Settings, …).
