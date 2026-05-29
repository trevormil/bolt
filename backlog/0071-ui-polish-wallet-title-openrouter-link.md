---
id: 71
title: "UI polish: dark-theme wallet title color + hyperlink the OpenRouter key link on onboarding"
status: closed
prs: ["https://labs.gauntletai.com/trevormiller/vellum-project/-/merge_requests/65"]
priority: low
type: ux
source: trevor
created: 2026-05-28
updated: 2026-05-28
refs: ["0053-frontend-design-revamp.md", "0019-install-onboarding-wizard.md"]
---

## Description
Two small frontend polish items from a test pass:

1. **Wallet title is black on the dark theme.** The "Wallet" heading in the
   right-bar `WalletPanel` renders near-black on the dark (Aurum) background —
   barely legible. Use a light foreground token (`text-fg` / the heading color
   the rest of the panels use) so it reads on dark.

2. **OpenRouter link isn't clickable.** Onboarding (`SetupFlow`) says "Get one
   at openrouter.ai/keys" as plain text. Make it a real `<a>` →
   `https://openrouter.ai/keys` (new tab, `rel="noopener noreferrer"`), styled
   as an accent link.

## Acceptance criteria
- Wallet panel title is clearly legible on the dark theme (matches the other
  section headings' contrast).
- The onboarding OpenRouter reference is a clickable link to openrouter.ai/keys.

## Notes
Pure CSS/markup — bundle both into one small MR.
