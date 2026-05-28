---
id: 54
title: "Wallet UX: black-on-dark text contrast bug"
status: open
priority: medium
type: bug
source: review
created: 2026-05-28
updated: 2026-05-28
refs: ["0053-frontend-design-revamp.md"]
---

## Description
On the Aurum (dark) theme, something in the Wallet area renders **dark text on
the dark background** — unreadable. Likely a leftover element that sets a dark
text color (or inherits one) instead of a theme token, or a native `<select>` /
input whose option/placeholder color isn't themed.

## Acceptance criteria
- Audit the Wallet panel + Keplr connect chip + any `bg-accent`/`bg-gold`
  elements: every text color resolves from a theme token (`text-fg` / `text-muted`
  / `text-accent` / `text-accent-fg`), never a hardcoded/inherited dark.
- Fix the offending element(s) so all wallet text meets AA contrast on the dark
  surface.
- Spot-check native `<select>`/option rendering (model dropdown in Settings) —
  style options or accept the OS default explicitly.

## Notes
Caught during the #53 revamp. Quick fix; folded into the revamp polish.
