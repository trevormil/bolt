---
id: 67
title: "Agent request tools — request funds / vault deposit / vote cast (shareable links)"
status: closed
priority: high
type: feature
source: trevor
created: 2026-05-28
updated: 2026-05-28
refs: ["0051-agent-money-autonomy.md", "0049-telegram-full-surface.md", "0045-vault-revamp-gating-multisig.md"]
prs: ["https://labs.gauntletai.com/trevormiller/vellum-project/-/merge_requests/63"]
---

## Description
The human UI can raise every kind of request — a global payment request
(`/pay/:id`), a vault deposit request (`/deposit/:id`, #62), and a multisig
sign-off link (`/vote/:id`). The **agent can raise none of them**. Give the
agent parity so it can, from chat or Telegram, mint a fundable/signable link
and hand it back to the user (or a third party). These tools create state and
return links — the human still signs, so no new money risk.

## Architecture (the enabler)
`PaymentRequests` and `DepositRequests` are SQLite-backed stores that currently
live in `packages/web`, which the engine can't import *up* from. Move both
stores **down into `packages/engine`** so web routes, agent tools, and Telegram
share one instance (agent-native parity). Web imports them back from
`@vellum/engine`; the daemon constructs them once and both layers use that
instance.

## Acceptance criteria
- **Store relocation:** `PaymentRequests` + `DepositRequests` move to
  `packages/engine`; `packages/web` imports them from `@vellum/engine`; a single
  instance is shared (no duplicate DBs). Existing web routes + tests still pass.
- **`request_funds(amount, memo?)`** → creates a PaymentRequest, returns the
  `/pay/:id` link.
- **`request_vault_deposit(collectionId, amount, memo?)`** → creates a
  DepositRequest, returns the `/deposit/:id` link.
- **`request_vote(collectionId)`** → returns the `/vote/:collectionId` sign-off
  link (validates the vault is multisig; includes threshold/pending context).
- **Link config:** a `VELLUM_PUBLIC_URL` env builds absolute links when set;
  otherwise return the relative path with a note (daemon is loopback-only, so a
  bare path is honest for local use). Validate amounts (`microOrNull`).
- Tests: each tool persists the right request + returns the right link; absolute
  vs. path-fallback; invalid inputs rejected; one shared store instance.

## Notes
Third of the 3-MR agent-money batch (stacked on #0066). The request tools are
low-risk (they mint links; a human signs) — keep them in the full tool set but
no new capability gate is required beyond what creating local state implies.
