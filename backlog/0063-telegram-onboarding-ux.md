---
id: 63
title: "Improve Telegram onboarding UX — guided setup with full instructions"
status: open
priority: medium
type: ux
source: review
created: 2026-05-28
updated: 2026-05-28
refs: ["0049-telegram-full-surface.md", "0019-install-onboarding-wizard.md", "0060-require-validate-openrouter-key.md"]
---

## Description
#49 wired Telegram onboarding, but both surfaces just expose a bare
`TELEGRAM_BOT_TOKEN` field — a user who has never made a Telegram bot has no idea
how to get a token, claim themselves as the owner, or what they can then do. The
onboarding should guide them end-to-end so enabling Telegram is self-serve.

Telegram is the remote entrypoint (the bot polls OUT; no daemon exposure — see
#49 reframe), so this is the on-ramp to "control Bolt from anywhere." It should
feel as guided as the OpenRouter-key step (#60).

## Acceptance criteria
- **How to get a token, inline.** Web (`SetupFlow` Telegram panel) + CLI wizard
  show the exact @BotFather flow as numbered steps:
  1. Open Telegram, message **@BotFather**.
  2. Send `/newbot`, pick a name + a `…_bot` username.
  3. Copy the token it returns (`123456:ABC-…`) and paste it here.
  (Link to https://t.me/BotFather where a link is possible.)
- **Validate the token** before saving (like the OpenRouter health check, #60):
  call Telegram `getMe`; on success show the bot's `@username` ("✓ connected as
  @your_bot"); on failure a clean inline error. Optional/skippable (Telegram is
  not required to run Bolt).
- **Claim ownership (principal), explained.** Tell the user how the principal
  allowlist works: either message the bot `/start` from your account to claim it
  (TOFU first-contact), or paste your `TELEGRAM_PRINCIPAL_CHAT_ID`. Explain *why*
  (so a stranger who finds the bot can't drive your agent).
- **"What you can do" cheatsheet** after enabling: the command surface
  (`/personas` `/switch` `/vaults` `/balance` `/ledger` `/spend` `/help`) so the
  user knows the bot is a full remote control, not just a notifier.
- **Runbook** `docs/runbooks/telegram-setup.md` — the same steps, durable, with
  the security notes (metadata-only logging, principal allowlist, `/spend` is
  capability-gated like the web).
- Keep it OPTIONAL + skippable on both surfaces; blank token writes nothing.

## Notes
Pure onboarding/UX + a token health check — no change to the #49 command surface
or the money gates. The token-validation mirrors the #60 OpenRouter pattern (a
`verifyTelegramToken` helper calling `getMe`, injectable for offline tests).
