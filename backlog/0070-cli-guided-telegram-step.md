---
id: 70
title: "CLI wizard guided Telegram step — match the web onboarding guidance (#63 follow-up)"
status: closed
priority: low
type: ux
source: review
created: 2026-05-28
updated: 2026-05-28
prs: ["https://labs.gauntletai.com/trevormiller/vellum-project/-/merge_requests/70"]
refs: ["0063-telegram-onboarding-ux.md", "0049-telegram-full-surface.md", "0019-install-onboarding-wizard.md"]
---

## Description
#63 / MR !64 made the **web** Telegram onboarding guided — numbered @BotFather
steps, `getMe` token validation (`verifyTelegramToken`), claim-ownership
explainer, command cheatsheet — plus a Settings "Telegram remote control" panel.
The **CLI** wizard's Telegram step (`packages/cli/src/init-wizard.ts`) is still
bare: it just prompts for a token with no guidance or validation. Bring it to
parity so the terminal install is as self-serve as the browser one.

## Acceptance criteria
- The CLI Telegram prompt shows the @BotFather steps inline (open @BotFather →
  `/newbot` → pick a `…_bot` username → paste the token).
- **Validate the token** with `verifyTelegramToken` (already in `@vellum/shared`)
  before persisting; on success print "✓ connected as @your_bot", on failure a
  clean re-prompt/skip. Optional + skippable (Telegram isn't required).
- Explain claiming ownership (message the bot `/start`, or set the chat id) and
  why (principal allowlist).
- Print the "what you can do" command cheatsheet
  (`/personas /switch /vaults /balance /ledger /spend /help`) after enabling.

## Notes
The only deferred slice of #63 (web + Settings shipped in !64). The chat-id
*validation* bug was already fixed in !63 (`runSetup` rejects non-integers).
Pure CLI UX — no new backend; reuse the existing `verifyTelegramToken` helper.
