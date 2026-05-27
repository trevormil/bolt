---
id: 28
title: "Vault manager rule-change signing (edit limits)"
status: open
priority: medium
type: feature
source: planning
created: 2026-05-27
updated: 2026-05-27
prs: []
refs: ["0016-web-vault-mgmt.md", "0027-keplr-human-wallet.md"]
---

## Description
Follow-up to #16. The vault UI ships list + create + human-signed escrow deposit,
but NOT editing an existing vault's rules. A manager (the human) should be able to
change a vault's daily-withdraw limit (and other guardrails) via a manager-signed
`MsgUniversalUpdateCollection`, signed with Keplr — never the agent.

Deferred at build time to avoid guessing the collection-update payload: reference
the Meridian repo's collection-update path, then confirm the exact pattern with
Trevor before writing the chain logic.

## Acceptance criteria
- Surface a vault's current rules (daily limit etc.) in the management UI
- Manager edits a rule → builds the manager-only update msg server-side
- Human signs the update with Keplr (coin type 118); agent cannot
- Change confirmed on devnet; reflected in the vault's on-chain approval
