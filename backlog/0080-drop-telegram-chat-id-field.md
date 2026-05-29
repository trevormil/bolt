---
id: 80
title: "Drop the manual Telegram chat-id field — first-/start claims ownership (TOFU)"
status: closed
priority: low
type: ux
source: trevor
created: 2026-05-29
updated: 2026-05-29
prs: ["https://labs.gauntletai.com/trevormiller/vellum-project/-/merge_requests/71"]
refs: ["0028-telegram-principal-allowlist.md", "0074-telegram-seamless-onboarding-commands.md", "0070-cli-guided-telegram-step.md", "0063-telegram-onboarding-ux.md"]
---

## Description
Confirmed: the Telegram **chat-id is already optional and auto-claimed**. When
unset, the first chat to message the bot claims ownership (first-contact TOFU,
#28) and becomes the principal. Yet both onboarding surfaces still prompt for
it:
- Web `SetupFlow.tsx` — a "your chat id (optional — else first chat claims
  it)" input under the Telegram panel.
- CLI `init-wizard.ts` — a "your Telegram chat id [blank = first chat claims
  it]" prompt.

Trevor: since it's auto, **get rid of it.** The bot token alone should be all
the user provides; ownership is claimed by the first `/start`.

## Acceptance criteria
- Remove the chat-id input from the web onboarding Telegram panel and from the
  CLI wizard's Telegram step. Bot token is the only field.
- Keep the explainer that the first `/start` claims ownership so a stranger
  can't drive the agent (the security property is unchanged — only the manual
  override field is dropped).
- `TELEGRAM_PRINCIPAL_CHAT_ID` stays supported as an **advanced/env-only**
  setting (hardened single-owner deployments may still pin it via `.env`); it
  just isn't surfaced in the guided flows.
- Update the `/api/setup` + Settings paths so they don't require/expect the
  field from the UI; existing validation logic for an env-provided value stays.
- Update onboarding e2e to reflect the simpler flow (no chat-id step).

## Notes
This is purely removing friction — the principal-allowlist security model (#28)
is intact because TOFU still gates the first claimant. Bundle with #78/#79 as
one Telegram-polish MR.
