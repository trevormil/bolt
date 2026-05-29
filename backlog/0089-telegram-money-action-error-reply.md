---
id: 89
title: "Telegram money actions fail silently — catch TxRejectedError in /pay, /spend, withdraw handlers"
status: closed
priority: high
type: bug
source: audit
created: 2026-05-29
updated: 2026-05-29
prs: ["https://labs.gauntletai.com/trevormiller/vellum-project/-/merge_requests/77"]
refs: ["0085-harden-edge-and-failure-cases.md", "0049-telegram-full-surface.md", "0065-agent-spend-parity.md"]
---

## Description
The web hardening from #85 returns a clean 422 + message for an over-limit /
insufficient spend or vault withdraw. The **Telegram** surface was missed: the
`/pay` and `/spend` handlers (`packages/telegram/src/handlers.ts`) only catch
`CapabilityDeniedError`; a `TxRejectedError` (over the vault cap, outside the
time window, missing multisig sign-off, or insufficient funds — thrown by
`TxManager`/`vaults.withdraw` since #85) propagates out of the handler. The
`guarded` wrapper in `buildBot` (`bot.ts`) has no try/catch, so grammY's default
handler swallows it and the user gets **no reply at all** — a silent no-op on a
money action.

## Acceptance criteria
- TG money handlers (`/pay`, `/spend`, and any vault withdraw path) catch
  `TxRejectedError` and reply with a plain-English reason ("that's over your
  weekly limit", "insufficient USDC", "needs sign-off", etc. — surface the
  rejection reason).
- `CapabilityDeniedError` keeps its existing clean reply.
- A generic catch-all so an unexpected error still yields *some* reply rather
  than a silent drop (don't crash the poller).
- Handler test(s) asserting an over-limit / insufficient TG spend produces a
  user-facing reply (not a silent no-op).

## Notes
Trust-critical: a silent failure on the remote-control money path is worse than
the web 500 #85 fixed — the user can't tell if the payment happened. Small,
contained change in `packages/telegram/src/handlers.ts` (+ maybe a shared catch
in `bot.ts`'s `guarded`). `TxRejectedError` is exported from `@vellum/tx`.
