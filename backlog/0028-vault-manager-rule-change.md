---
id: 28
title: "Vault manager rule-change signing (edit limits)"
status: closed
priority: medium
type: feature
source: planning
created: 2026-05-27
updated: 2026-05-28
prs: []
refs: ["0016-web-vault-mgmt.md", "0027-keplr-human-wallet.md", "0045-vault-revamp.md"]
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

---

**Closed 2026-05-28 — superseded by design (#45 slice 4).** Trevor's call:
"we don't need any MsgSetIsArchived or MsgUniversalUpdateCollection." Instead of
editing a live vault's rules, the manager exercises two human-signed admin
approvals — unlimited drain + forceful revocation of the agent's tokens
(`overridesFromOutgoingApprovals` + `overridesToIncomingApprovals`) — which
effectively archives the vault. The agent then re-creates a vault with the new
rules. Rule mutation in place is intentionally not supported.
