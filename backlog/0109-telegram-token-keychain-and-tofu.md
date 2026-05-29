---
id: 109
title: "Telegram: bot token → OS keychain + TOFU concurrency hardening + bot.test secrets allowlist"
status: open
priority: medium
type: security
source: audit-2026-05-29
created: 2026-05-29
refs: ["0049-telegram-full-surface.md", "0096-agent-key-at-rest-keychain.md"]
---

## Description
Three related Telegram-surface issues from the audit.

### 1. Bot token persisted in plaintext `.env` (MEDIUM)
- Where: `packages/shared/src/env.ts:23` (`TELEGRAM_BOT_TOKEN: z.string().optional()`),
  written via `upsertEnvFile` from `server.ts:528-534` and `cli/src/setup.ts:84-93`.
- ADR-0007 moved the *signing seed* into the keychain — but the bot token
  stayed in `.env`. With the token, an attacker who exfils `.env` can post
  messages *as* the bot to the principal chat (social engineering: "Hey, please
  /switch evil-persona and /spend bb1evil 100"). The `authorizeChat`
  allowlist blocks command intake from a fresh chat, but the attacker can
  spam the principal with bot-authored messages that look authoritative.
- Fix: extend the `SecretBackend` interface (or a sibling abstraction) to
  store the Telegram token; the daemon resolves it at boot. Migration command:
  `vellum keys migrate-telegram` (mirrors the existing seed migrate).

### 2. `/start` TOFU claim has no concurrency test → race possible (HIGH)
- Where: `packages/telegram/src/attach.ts:24-32`.
- `authorizeChat` reads `principal()` then `record(chatId)` non-atomically.
  Two updates arriving in the same event-loop tick could both pass the check
  before the first `record` commits. The principal allowlist is the bot's
  only auth.
- Fix: collapse the read+write into a single `INSERT ... ON CONFLICT DO
  NOTHING` (SQLite atomic), and add a concurrency test that hammers
  `authorizeChat` with `Promise.all([authorizeChat(101), authorizeChat(202)])`
  on an empty Recipients → exactly one wins.

### 3. `bot.test` console-shadowing only catches secrets that ride through console (LOW)
- Where: `packages/telegram/src/bot.test.ts` shadows `console.log/error` to
  assert no secrets leak — only catches secrets logged via console. A future
  logger that writes to `process.stdout.write` directly passes vacuously.
- Fix: assert against the `createLogger`-emitted output (which is the project
  convention), and parametrize across the secret-typed env vars (not just the
  seed). Pairs with the eval expansion in #0107.

## Acceptance criteria
- Telegram bot token resolves from the OS keychain on macOS (env-first
  fallback for CI/dev), same shape as the signer seed. Migration command +
  setup wizard updated.
- `authorizeChat` is atomic-by-construction; concurrency test asserts the
  invariant.
- `bot.test` secret-leak assertion routes through the project logger + covers
  all secret-class env vars.

## Notes
Security findings #9, test review #10, joint logging concern.
