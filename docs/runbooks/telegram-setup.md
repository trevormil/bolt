---
title: Enable Telegram remote control for Bolt
last-verified: 2026-05-28
---

# Telegram remote control

Bolt's Telegram bot is the **remote entrypoint** — you drive your agent from
anywhere. The bot *polls out* to Telegram (long-poll), so **nothing is exposed
on your machine** (no inbound ports, no public daemon). See ADR/#49.

## 1. Create a bot + get a token

1. In Telegram, open a chat with **[@BotFather](https://t.me/BotFather)**.
2. Send `/newbot`. Pick a display name, then a username ending in `_bot`.
3. BotFather replies with a token like `123456:ABC-DEF…`. Copy it.

## 2. Give Bolt the token

Either surface validates the token via Telegram `getMe` before saving (a bad
token is rejected up front, not silently at the next boot):

- **Web — onboarding:** the *Set up Bolt* screen → "Control Bolt from Telegram".
- **Web — after onboarding:** *Settings → Telegram remote control* (set, rotate,
  or disable; shows the connected `@username`).
- **CLI:** the `bun run setup` wizard's Telegram step.

The token is written to `~/.vellum/.env` (`TELEGRAM_BOT_TOKEN`) and adopted into
the running daemon's env. **The poller attaches on the next daemon start** —
restart the daemon (or `launchctl kickstart` the service) to go live.

## 3. Claim ownership (so only you can drive it)

The bot only obeys its **principal**. Claim it one of two ways:

- Message your bot `/start` from your account — first contact claims it (TOFU);
  or
- Set `TELEGRAM_PRINCIPAL_CHAT_ID` (your numeric chat id) at setup.

This is why a stranger who finds your bot can't operate your agent.

## 4. What you can do

Message the bot in plain language (it routes to the same agent as the web chat),
or use commands:

```
/personas   list your personas
/switch     change the active persona
/new        create a persona
/vaults     list vaults
/balance    wallet + escrow balances
/ledger     recent activity + LLM spend
/spend      pay USDC from the wallet (capability-gated)
/help       this list
```

## Security notes

- **Metadata-only logging.** Message *contents* are never written to the
  activity timeline — only that a turn happened + its size.
- **Same gates as the app.** `/spend` (and every money move) goes through the
  same capability chokepoint as the web UI — Telegram is not a bypass.
- **Loopback-only config.** Setting/rotating the token is a loopback-only,
  authenticated action; the token never crosses a network boundary.
- **Rotate/disable** anytime in *Settings → Telegram remote control* (an empty
  token clears it).
