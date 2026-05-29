---
id: 49
title: "Telegram: onboarding setup + full remote-control surface"
status: closed
prs: ["https://labs.gauntletai.com/trevormiller/vellum-project/-/merge_requests/60"]
priority: high
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

## Reframe (2026-05-28) — Telegram IS the remote-access strategy
Telegram is now THE way to reach the agent from anywhere (not one of two
surfaces). Because the bot polls OUT to Telegram, "from anywhere" needs **no
daemon exposure** — the daemon stays loopback-only, the web UI is local-only, and
there is no inbound surface / TLS / tunnel to manage. Bumped to high.
- DROP the "webhook mode for the exposed gateway" item — #48 is iceboxed;
  long-poll is the model.
- KEEP: onboarding collects TELEGRAM_BOT_TOKEN; per-persona /switch + expanded
  command surface (parity with CLI/web, capability-gated + ledgered); the
  second-channel high-value-spend approval (#24 T-06) as a Telegram yes/no.
