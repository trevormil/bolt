---
id: 86
title: "Show Telegram setup by default in onboarding — not hidden behind a click"
status: closed
priority: medium
type: ux
source: trevor
created: 2026-05-29
updated: 2026-05-29
prs: ["https://labs.gauntletai.com/trevormiller/vellum-project/-/merge_requests/74"]
refs: ["0080-drop-telegram-chat-id-field.md", "0074-telegram-seamless-onboarding-commands.md", "0063-telegram-onboarding-ux.md", "0019-install-onboarding-wizard.md"]
---

## Description
The web onboarding Telegram step is currently collapsed behind a
"Control Bolt from Telegram (optional)" toggle in `SetupFlow.tsx` — a click most
users won't make, so Telegram (a headline feature) goes unnoticed. Trevor wants
it **shown by default**, not hidden: either surfaced expanded in the onboarding
flow, or made a non-optional step.

## Acceptance criteria
- The Telegram panel (bot-token field + the guided @BotFather steps) renders
  **expanded by default** in onboarding — no click required to discover it.
- Still **skippable**: leaving the token blank proceeds (forcing every user to
  create a bot would be wrong — "not optional" here means "not hidden", surfaced
  prominently as a first-class step, with a clear "skip for now" affordance).
- Keep it consistent with #80 (no chat-id field — first `/start` claims
  ownership) and the CLI wizard's guided step (#70) so all surfaces match.

## Notes
Builds directly on the #80 SetupFlow change (same Telegram section) — sequence
after it to avoid a conflict, or fold together. Mostly flipping the default
`showTelegram` state + light layout so the expanded panel reads as a normal
step rather than an advanced opt-in. Confirm the "skip" path stays obvious so
onboarding isn't gated on a Telegram bot.
