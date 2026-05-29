---
id: 74
title: "Telegram seamlessness — auto-register commands (setMyCommands) + hot-attach on token set + bot-token-only"
status: closed
priority: medium
type: ux
source: trevor
created: 2026-05-28
updated: 2026-05-28
prs: ["https://labs.gauntletai.com/trevormiller/vellum-project/-/merge_requests/67"]
refs: ["0049-telegram-full-surface.md", "0063-telegram-onboarding-ux.md", "0070-cli-guided-telegram-step.md"]
---

## Description
Telegram setup should be **bot-token-and-done** — everything else handled
automatically. From a test pass, three gaps:

1. **Auto-register the command menu (like OpenClaw).** Call Telegram
   `setMyCommands` on bot startup so `/personas /switch /new /vaults /balance
   /ledger /spend /help` show up in Telegram's command menu (the "/" autocomplete
   + the menu button). Today users can't discover the commands in the TG client.
2. **Hot-attach on token set.** Setting/rotating the token via web `/api/setup`
   or Settings currently only takes effect on the next daemon start (the poller
   reads env at boot). Hot-attach the long-poller when the token is set/validated
   so the bot connects immediately — no restart. (Detach on clear/rotate.)
3. **Bot-token-only.** Confirm the only required input is the bot token: chat-id
   is optional (TOFU on first `/start` already claims the principal — verified),
   and nothing else should be needed. Tighten/clarify the flow so that's obvious.

## Acceptance criteria
- On bot online, `setMyCommands` registers the full command surface; the commands
  appear in the Telegram client's menu.
- Setting a valid token in the web (setup or Settings) attaches the poller live
  (bot responds without a daemon restart); clearing/rotating re-attaches cleanly.
- Onboarding/Settings copy makes clear the bot token is the only required field.

## Notes
Builds on #63 (web onboarding UX, shipped) + #70 (CLI guided step). The
hot-attach piece is the "everything else handled" ask — surfaced when a token set
via the web server/Settings didn't connect until the full daemon restarted.
setMyCommands is the OpenClaw-style discoverability ask.
