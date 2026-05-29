---
id: 66
title: "Agent vault creation with full gating criteria (cap/period, time window, multisig)"
status: closed
priority: high
type: feature
source: trevor
created: 2026-05-28
updated: 2026-05-28
refs: ["0045-vault-revamp-gating-multisig.md", "0051-agent-money-autonomy.md"]
prs: ["https://labs.gauntletai.com/trevormiller/vellum-project/-/merge_requests/62"]
---

## Description
The agent's `create_vault` tool only exposes a `dailyWithdrawLimit`, but
`VaultService.create` already accepts the full `VaultGating` shape the human
*New vault* form uses (#45/#55):
```ts
VaultGating = {
  amount?:   { limitUsd, period: "daily"|"weekly"|"monthly" };
  time?:     { unlockAt?, expiresAt? };          // epoch ms window
  multisig?: { signers: {address, weight?}[], threshold };
}
```
So an agent asked to "spin up a vault that releases at most 50 USDC/week,
unlocks next Monday, and needs 2-of-3 sign-off" can't — it can only set a daily
cap. Bring the tool to parity with the human form.

## Acceptance criteria
- `create_vault` accepts the full gating: amount cap + period, an optional
  unlock/expiry window (accept friendly inputs — ISO date or relative like
  "next monday" / "+7d" — and normalize to epoch ms), and optional multisig
  (signer bb1 addresses + threshold). All fields optional; omitting them = an
  ungated vault, as today.
- Validation at the tool boundary: bad period, non-bb1 signer, threshold >
  signer count, or threshold < 1 → a clean tool error (not a chain failure).
- Keep `dailyWithdrawLimit` working as a shorthand (maps to
  `amount: { limitUsd, period: "daily" }`) so existing prompts don't break.
- Tests: each gating dimension maps to the right `VaultGating`; the shorthand
  still works; invalid criteria rejected at the boundary.

## Notes
Second of the 3-MR agent-money batch (stacked on #0065). Pure tool-surface
widening — the service + on-chain path already support every field; no new
capability or chain work.
