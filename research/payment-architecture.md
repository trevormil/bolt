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

## Wallets — dual (Cosmos + Ethereum), necessary

The agent holds **two wallets**:
- **Cosmos** (`bb1...`) — the primary chain identity on BitBadges.
- **Ethereum** (`0x...`) — required for EVM-side assets/auth.

BitBadges derives both address formats; key management TBD (shared secp256k1 key
→ both addresses, vs. separate keys — see open questions). **Solana is scrapped**
(deferred with the Skip:Go extension).

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

## Funding — PaymentRequest (human-in-the-loop)

The agent **never autonomously pulls funds.** When it needs money it issues a
BitBadges **PaymentRequest** (the payment-request standard:
[bitbadges-integration.md §5.2](./bitbadges-integration.md)) to the human. The
human reviews and funds it (signs → coins move). This HITL gate is the trust
boundary on inflows; the vault rules are the trust boundary on outflows.

## Swaps — BitBadges API swap-estimate endpoint (ETH + Cosmos)

Swaps use the **BitBadges-exposed swap-estimate endpoint** (`api.bitbadges.io`),
which covers **Ethereum + Cosmos** assets. We do **not** use Skip:Go for swaps
now. *(Verify the exact route at build time; confirm whether it operates against
the Meridian devnet or only mainnet-scoped assets — see open questions.)*

## Dropped: BB-402

BB-402 (BitBadges' token-ownership-gated HTTP 402) is **descoped** — judged
overengineering for our needs. **Standard auth** (API keys / OAuth / SIWE-style
signed sessions) is sufficient for gating the agent's endpoints.

## Extension (future — not wired now)

**Skip:Go cross-chain swaps + Solana.** Skip:Go ([docs.skip.build](https://docs.skip.build/go/general/supported-ecosystems-and-bridges))
spans 120+ chains, does fast EVM↔Cosmos bridging (Hyperlane intents) and USDC
bridging to/from Solana — but **can't be wired to the Meridian devnet**, which
has no IBC connections or Skip integrations. It also has **no Solana DEX swaps
yet** (bridging only). So cross-chain swaps and a Solana wallet are a
**post-devnet extension**, added once we're on a Skip-connected environment.
Trevor is sitting on this design; revisit later.

## Open questions

1. **Vault manager key / rule immutability** — when the agent spins up a vault,
   does it hold the manager key (could change rules → undermines fail-closed) or
   are rules **locked at creation** via permissions (and/or the human is
   manager)? The trust thesis argues for locked-at-creation or human-managed.
2. **Free-form balance cap** — how much discretionary `x/bank` value is the agent
   trusted with before everything routes through rule-bound vaults?
3. **Swap-estimate endpoint** — exact `api.bitbadges.io` route; does it work
   against the standalone devnet or is it mainnet-asset-scoped?
4. **Dual-wallet key management** — one secp256k1 key for both `bb1`+`0x`, or
   separate keys per chain? Affects the signer design.
5. **Per-persona vs per-purpose vaults** — do vaults map onto the compartment
   personas, onto purposes, or both?

## Sources

- [differentiators.md](./differentiators.md) · [bitbadges-integration.md](./bitbadges-integration.md) · [meridian-devnet runbook](../docs/runbooks/meridian-devnet.md)
- [Skip:Go supported ecosystems](https://docs.skip.build/go/general/supported-ecosystems-and-bridges) (extension reference)
