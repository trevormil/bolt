---
id: 49
title: "Telegram: onboarding setup + full remote-control surface"
status: in-progress
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
surfaces). Because the bot polls OUT to Telegram, "from anywhere" needs no daemon
exposure — the daemon stays loopback-only, the web UI is local-only, no inbound
surface / TLS / tunnel to manage.
- DROP the "webhook mode for the exposed gateway" item — #48 is iceboxed;
  long-poll is the model.
- KEEP: onboarding collects TELEGRAM_BOT_TOKEN; per-persona /switch + expanded
  command surface (parity with CLI/web, capability-gated + ledgered); the
  second-channel high-value-spend approval (#24 T-06) as a Telegram yes/no.

## Progress (branch feat/0064-telegram-surface)
Built the reframed scope:
- Onboarding collects `TELEGRAM_BOT_TOKEN` (+ optional principal chat id) —
  OPTIONAL/skippable — in BOTH the CLI wizard and web onboarding; written to `.env`.
- Per-chat persona selection: `/personas`, `/switch <id>`, persisted per chat id
  in a new `tg_sessions` table (one operator drives multiple compartments).
- Expanded command surface with CLI/web parity: `/personas`, `/switch`, `/new`,
  `/vaults`, `/balance`, `/ledger`, `/spend`, `/help`. Free-text → `engine.chat`.
- `/spend` and the agent's vault tools route through the EXISTING engine
  capability chokepoints (TxManager / VaultService, #37) + ledger — no new
  ungated money path. A revoked `spend` grant blocks `/spend` (proven by test).
- Metadata-only logging + principal allowlist (TOFU / `TELEGRAM_PRINCIPAL_CHAT_ID`)
  preserved unchanged.

### DEFERRED — #24 T-06 second-channel high-value-spend approval
NOT built. T-06 (the "ask"/threshold policy + the engine `approve` wiring it
fires) does not exist yet, so there is intentionally no Telegram yes/no approver
injected. A `TODO(#24 T-06)` marks the wiring point in
`packages/telegram/src/attach.ts`. Wiring a prompt now would fake a confirmation
flow nothing emits.
