---
id: 88
title: "Audit the agent's tool/capability coverage — can it do everything money/vault/chain-wise it should?"
status: closed
priority: medium
type: feature
source: trevor
created: 2026-05-29
updated: 2026-05-29
prs: ["https://labs.gauntletai.com/trevormiller/vellum-project/-/merge_requests/76"]
refs: ["0067-agent-request-tools.md", "0062-agent-pay-from-vault.md", "0065-agent-spend-parity.md", "0066-agent-vault-criteria.md"]
---

## Description
Confirm the agent has every tool it needs to act on the user's behalf and to
**reason about state**, and fill any gaps. Today's agent tool set (from
`agent-tools.ts`) already covers the actions:
`create_vault`, `list_vaults`, `withdraw_from_vault`, `pay_from_vault`,
`send_usdc`, `request_funds`, `request_vault_deposit`, `request_vote`,
`check_balance`, plus `fs_*` / `run_command`.

The likely gaps are **read/awareness** tools — the agent can *do* actions but may
not be able to *see* enough to decide well.

## Acceptance criteria
- Audit action coverage against the intended surface: spin up vaults, withdraw
  within rules, pay from vault, send base USDC, request a payment, request vault
  funding, request a multisig vote. Confirm each is wired and reachable.
- Audit **read/awareness** coverage and add what's missing, likely:
  - the persona's **ledger / recent activity** (so it can answer "what have I
    spent / done?");
  - a **vault detail** read (escrow balance, the gating rule, remaining
    allowance for the period) so it can reason about limits before acting;
  - **pending request status** (payment / deposit / vote) so it can follow up.
- Confirm it has the **chain reads** it needs (balances it already has via
  `check_balance`; add a tx/confirmation status read if it can't currently tell
  whether its last action settled — ties to #81's tx-status route).
- Each newly-added tool is capability-gated consistently (#37) and has a test;
  document the final tool inventory.

## Notes
Frame as: "the agent can act; can it *perceive*?" Most write-path tools exist —
the value is closing read/awareness gaps so the agent doesn't act blind (e.g.
withdrawing without knowing the remaining weekly allowance, or claiming it sent
funds before confirmation). Keep additions minimal + gated; don't add tools
without a real need (§2). Pairs with #85 (the agent should surface limit/budget
failures it can now see).
