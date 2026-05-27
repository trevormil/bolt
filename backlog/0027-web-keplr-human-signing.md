---
id: 27
title: "Web: connect Keplr (human wallet) for user-signed txs"
status: open
priority: high
type: feature
source: planning
created: 2026-05-27
updated: 2026-05-27
prs: ["https://labs.gauntletai.com/trevormiller/vellum-project/-/merge_requests/20"]
refs: ["ARCHITECTURE.md", "0014-paymentrequest-link.md", "0016-web-vault-mgmt.md"]
---

## Description
In-site **Keplr** (and Keplr-compatible Cosmos wallet) connection so the
**principal/human** can sign transactions from their **own** address in the web
app. This is distinct from the agent's per-persona hot keys (server-derived from
the master mnemonic, ticket 0008) — the human wallet is browser-side and signing
happens client-side via the Keplr extension.

Underpins every human-signed flow:
- **Fund a persona** from the user's own wallet (alongside the devnet faucet).
- **Pay a PaymentRequest** the agent raised (0014) → funds land in the persona's
  global balance.
- **Sign manager actions** on a vault — the human is the manager (0012/0016);
  rule changes require the human's signature, never the agent's.

USDC-only (the `VELLUM_DENOM` IBC denom), consistent with the rest of Vellum.

## Acceptance criteria
- Connect / disconnect Keplr in the web app; suggest the BitBadges devnet chain
  (chain-id `bitbadges-1`, RPC/LCD from env, bech32 prefix `bb`) via
  `experimentalSuggestChain` if not present.
- Show the connected human `bb1` address + its USDC balance.
- Sign + broadcast at least one real tx from the human address (e.g. fund a
  persona wallet) end to end on devnet.
- Wired as the signing path for 0014 (pay PaymentRequest) and 0016 (manager sign).

## Build-time note: BitBadges pattern
Reference the **Meridian** repo first (`~/CompSci/gauntlet/meridian/apps/web/lib/chain/`
+ wallet connect components) for the exact Keplr suggest-chain + signing pattern
on this chain, **then confirm with Trevor** before finalizing chain-specific glue.
