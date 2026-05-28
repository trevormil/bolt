---
id: 53
title: "Full frontend design + UX revamp (Dusk 2.0)"
status: in-progress
priority: medium
type: ux
source: planning
created: 2026-05-28
updated: 2026-05-28
prs: ["https://labs.gauntletai.com/trevormiller/vellum-project/-/merge_requests/51"]
refs: ["0026-ui-component-library.md", "0047-frontend-surfaces.md", "0038-installable-pwa.md", "0025-trust-ux-adopts.md"]
---

## Description
The web app has a working foundation — React + Tailwind + the `@vellum/ui`
"Dusk" component library (#26: Avatar/Badge/Button/Card/Icon/Input + theme/token
CSS), every feature surface wired (#47), and an installable PWA (#38). But it
grew surface-by-surface; it now needs a cohesive, intentional design + UX pass so
it feels like one polished product rather than a sum of screens. This is a
holistic revamp, not a new feature.

## Acceptance criteria
- **Design language (Dusk 2.0)**: a refreshed, documented visual system extending
  the existing tokens — typography scale, spacing rhythm, color/elevation/motion
  tokens, both light + dark `data-theme`s polished.
- **Per-surface UX pass**: Chat, Vaults, Ledger, Activity, Settings, WalletPanel,
  Welcome/Onboarding, and the public Vote + Pay pages — each reviewed for visual
  hierarchy, density, primary-action clarity, and complete **empty / loading /
  skeleton / error** states (today many are bare).
- **Responsive + mobile**: first-class phone widths (the PWA is installable);
  layouts adapt, touch targets sized, the sidebar/nav works on small screens.
- **Accessibility**: visible focus states, keyboard navigation, ARIA on
  interactive components, AA contrast, `prefers-reduced-motion` respected.
- **Trust-forward UX**: make the trust thesis visible — per-action receipts,
  gating badges, capability/permission states, "what the agent did" breadcrumbs —
  so money + permissions are legible at a glance (ties to #25, and #51/#52 when
  they land).
- **Motion + feedback**: tasteful transitions, optimistic UI where safe, toast /
  inline feedback for every action.
- **Component-library decision**: keep + extend `@vellum/ui` vs. adopt shadcn —
  decided in this ticket, not drifted into.

## Notes
A design epic — slice into per-surface PRs, iterate against real screenshots. Use
the Anthropic **`frontend-design`** skill (global CLAUDE.md §9) for the heavy UI
work; Tailwind defaults. **Preserve agent-native parity** (#agent-native): a
visual revamp must not break the API/tool symmetry — any action the user gains in
the UI, the agent keeps via tools. Pairs naturally with the trust-UX items (#25).
