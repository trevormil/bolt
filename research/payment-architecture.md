---
title: "Payment & Wallet Architecture"
subject: payment-architecture
date: 2026-05-26
status: direction
note: >
  Refines the payment-first half of differentiators.md into concrete wallet,
  balance, funding, and swap decisions. BitBadges-only for now; cross-chain is a
  documented future extension. Pre-build; open questions listed at the end.
---

# Payment & Wallet Architecture

The payment-first differentiator ([differentiators.md](./differentiators.md)),
made concrete. Everything here runs on **BitBadges only** (the
[Meridian devnet](../docs/runbooks/meridian-devnet.md) for now); cross-chain is
deferred to an extension (below).

## Wallet — Cosmos only

The agent holds **one wallet**: a **Cosmos** (`bb1...`) account on BitBadges.
That's the whole identity. **Ethereum and Solana are scrapped** — no cross-chain
wallets, no EVM-side assets. (BitBadges technically derives an EVM `0x` address
from the same key, but we don't use or expose it.) Single chain, single key,
single signer — the simplest possible footprint.

## Balance tiers

The agent's funds live in two tiers — a discretionary balance and rule-bound
vaults:

### 1. Free-form `x/bank` balance
Plain Cosmos `x/bank` holdings (`ubadge`, USDC, etc.) with **no vault rules** —
the agent's discretionary "petty cash." Free-form spend within whatever global
budget applies. *(Open: cap this for trust — significant value should live in
rule-bound vaults, not here.)*

### 2. Smart vaults — **the main feature**
A **smart vault** is a BitBadges token collection **1:1 backed by USDC** with
**vault rules** layered on top (the collection's approvals: daily caps, recipient
allowlists, time gates, 2FA thresholds — protocol-enforced, non-bypassable). See
[bitbadges-integration.md §4](./bitbadges-integration.md) and the BitBadges docs
(smart-token skill + the "E2E: AI Agent with USDC Vault" tutorial).

- The agent can **spin up an unlimited number** of vaults — one per purpose
  (e.g. `subscriptions`, `groceries`, `trading`, a per-persona vault).
- Each vault's rules are enforced by the chain, so even a compromised agent can't
  exceed them.
- This is the headline payment capability and the demo centerpiece.

## Core principle — agent does the chain logic; human verifies/approves

The agent handles **all** the BitBadges machinery behind the scenes — creating
vaults, configuring approval rules, building payment requests, signing within its
limits. The human is the **verify/approve layer**: they don't touch BitBadges
internals, they just click a link and approve (or reject). This is the trust
thesis made tangible.

## Funding — PaymentRequest (Stripe-link style)

The agent **never autonomously pulls funds.** When it needs money it spins up a
BitBadges **PaymentRequest** ([bitbadges-integration.md §5.2](./bitbadges-integration.md))
and generates a **link** (Stripe-payment-link style): agent creates the request →
generates the BitBadges link → user opens it and **signs**. We'll ship our own
streamlined UI for the common flows; the full BitBadges UI is available for deep
dives. This HITL gate is the trust boundary on inflows; vault rules are the trust
boundary on outflows.

## Vaults — agent creates, human manages

The agent **creates** vaults autonomously (it can spin up unlimited per-purpose
vaults), but sets the **human as the collection manager** — so only the human can
update a vault's rules afterward, while the agent operates within them. One `bb1`
**wallet per persona**; each persona's vaults hang off its own wallet.

## Swaps — DEFERRED

Swaps are **out of v1**. (`x/gamm` pools exist on the devnet and could be seeded
as needed, but swaps add scope without serving the core demo.) Local-to-local
BitBadges swaps, cross-chain swaps, and ETH/Solana wallets are **all deferred
together** to a later extension — TBD.

## Dropped: BB-402

BB-402 (BitBadges' token-ownership-gated HTTP 402) is **descoped** — judged
overengineering for our needs. **Standard auth** (API keys / OAuth / SIWE-style
signed sessions) is sufficient for gating the agent's endpoints.

## Extension (future — not wired now)

**Cross-chain: Ethereum + Solana wallets and Skip:Go swaps.** All deferred.
Skip:Go ([docs.skip.build](https://docs.skip.build/go/general/supported-ecosystems-and-bridges))
spans 120+ chains and does fast EVM↔Cosmos bridging + USDC bridging to/from Solana
— but **can't be wired to the Meridian devnet** (no IBC/Skip integrations), and
has **no Solana DEX swaps yet**. So multi-chain wallets (ETH/SOL) and cross-chain
swaps are a **post-devnet extension**, added once we're on a Skip-connected
environment. For now the agent is **single-chain (BitBadges/Cosmos) only**.
Trevor is sitting on this design; revisit later.

## Open questions

1. **Vault manager key / rule immutability** — when the agent spins up a vault,
   does it hold the manager key (could change rules → undermines fail-closed) or
   are rules **locked at creation** via permissions (and/or the human is
   manager)? The trust thesis argues for locked-at-creation or human-managed.
2. **Free-form balance cap** — how much discretionary `x/bank` value is the agent
   trusted with before everything routes through rule-bound vaults?
3. **Local swaps** — exact `api.bitbadges.io` swap-estimate route; are `x/gamm`
   pools seeded on the Meridian devnet so local-to-local swaps actually execute
   there (vs. quote-only)?
4. **Per-persona vs per-purpose vaults** — do vaults map onto the compartment
   personas, onto purposes, or both?

## Sources

- [differentiators.md](./differentiators.md) · [bitbadges-integration.md](./bitbadges-integration.md) · [meridian-devnet runbook](../docs/runbooks/meridian-devnet.md)
- [Skip:Go supported ecosystems](https://docs.skip.build/go/general/supported-ecosystems-and-bridges) (extension reference)
