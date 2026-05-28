---
id: 49
title: "Telegram: onboarding setup + full remote-control surface"
status: open
priority: medium
type: feature
source: planning
created: 2026-05-28
updated: 2026-05-28
refs: ["0003-telegram-bot-skeleton.md", "0019-install-onboarding-wizard.md", "0024-security-hardening-premainnet.md", "0018-proactive-checkins.md"]
---

## Description
OpenClaw-parity goal: Telegram as a first-class remote surface, not just a
notifier. Today `attachTelegram` runs a long-poll bot with `/start`, `/balance`,
`/ledger`, free-text chat, a principal allowlist (TOFU / `TELEGRAM_PRINCIPAL_CHAT_ID`),
and proactive delivery (check-ins + tasks). It's wired into the daemon when
`TELEGRAM_BOT_TOKEN` is set — but the install wizard never sets that token, and
the command surface is thin.

## Acceptance criteria
- **Onboarding sets it up**: the install wizard (#19) optionally collects
  `TELEGRAM_BOT_TOKEN` (+ principal chat id, or TOFU first-contact) and writes
  them to `.env`, so a from-scratch user can enable Telegram without hand-editing.
- **Per-persona routing**: a chat can select/switch the active persona
  (`/switch <id>`, `/personas`) so one operator drives multiple compartments —
  today chat is pinned to a single resolved persona.
- **Expanded command surface**: `/personas`, `/switch`, `/vaults`, `/new`,
  `/spend` (gated), `/tasks`, `/help` — parity with the CLI/web actions, each
  routed through the same capability gates (#37) and ledgered.
- **Approval over Telegram**: wire the second-channel high-value-spend confirm
  (#24 T-06) to a Telegram yes/no prompt — the agent's natural remote approver.
- **Webhook mode (optional)**: support webhook delivery (vs long-poll) for the
  exposed-gateway deployment (pairs with #48); long-poll stays the local default.

## Notes
Keep metadata-only logging (never raw message bodies) and the principal allowlist
intact. Telegram + the web external gateway (#48) are the two concrete remote
surfaces; #50 is the optional unifying channel abstraction if a third arrives.
