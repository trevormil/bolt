---
id: 65
title: "Agent + human spend parity — send USDC (MsgSend) from the persona wallet"
status: closed
priority: high
type: feature
source: trevor
created: 2026-05-28
updated: 2026-05-28
refs: ["0051-agent-money-autonomy.md", "0049-telegram-full-surface.md"]
prs: ["https://labs.gauntletai.com/trevormiller/vellum-project/-/merge_requests/61"]
---

## Description
The agent can `pay_from_vault` (vault → recipient, atomic, gated) but has **no
free-form MsgSend** from its own wallet — so "withdraw from a vault, then send
the USDC somewhere" can't be completed. The web UI also has no Send action
(only Telegram `/spend` moves funds today). Close both gaps through the one
gated chokepoint.

This **reverses the #51 "no free-form send" omission** per Trevor's direction:
limits are enforced at vault withdraw; funds already in the persona wallet
(post-withdraw or faucet) are sendable, gated by the `spend` capability and
ledgered.

## Acceptance criteria
- **Agent tool `send_usdc(to, amount)`** — MsgSend from the persona wallet via
  `engine.txManager.spend` (gated `spend` capability, ledgered). Validates `to`
  is a bb1 address and amount is a positive integer µUSDC (reuse `microOrNull`).
  Registered in the full (non-readOnly) tool set; revoking `spend` denies it.
- **Web Send UI** — a Send action in `WalletPanel` (recipient + amount), posting
  to a new `POST /api/agent/send` route that calls the same `txManager.spend`.
  Loopback + authed like `/api/agent/mnemonic`. Optimistic balance refresh.
- **Parity:** agent tool, web button, and Telegram `/spend` all converge on
  `txManager.spend` — one gate, one ledger entry shape, three surfaces.
- Tests: send happy-path, invalid recipient/amount rejected, revoked `spend`
  → denied, cross-origin/exposed `/api/agent/send` → 403.

## Notes
First of the 3-MR agent-money batch (stacked on feat/0064). No new capability
*kinds* — reuses `spend`. The "withdraw then send" chain is `withdraw_from_vault`
then `send_usdc`; `pay_from_vault` remains the atomic single-tx path.
