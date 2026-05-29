---
id: 51
title: "Agent money autonomy: in-loop send/pay + pay-from-vault-to-recipient + balance context"
status: closed
prs: ["https://labs.gauntletai.com/trevormiller/vellum-project/-/merge_requests/58"]
priority: high
type: feature
source: planning
created: 2026-05-28
updated: 2026-05-28
refs: ["0013-vault-spend.md", "0010-freeform-balance.md", "0037-capability-permission-model.md", "0024-security-hardening-premainnet.md", "0045-vault-revamp.md"]
---

## Description
The "payment-first personal agent" can't actually move money on its own yet.
Today the agent loop (chat) exposes only `create_vault`, `list_vaults`, and
`withdraw_from_vault` — and `withdraw_from_vault` only un-escrows to the vault's
**backing address** (`to: v.backingAddress`), never to a recipient. There is **no
agent tool to send/pay USDC to an arbitrary address**, and **no tool to read its
own wallet balance or per-vault escrow**, so the agent is blind to its funds and
can't pay anyone. Every real spend is human/API-only (`POST /api/personas/:id/spend`).
#13 closed at withdraw-to-backing; #10 (free-form capped balance) closed and the
free-form cap was later dropped (limits live in vaults). The autonomy itself is
the gap.

This is the highest-risk capability in the system, so it must ship WITH the
guardrails, not before them.

## Acceptance criteria
- **Balance / escrow context tool** (read-only): the agent can read its own
  wallet USDC + per-vault escrow in-loop, so it knows what it has before acting.
- **Pay-from-vault**: `withdraw_from_vault` (or a new `pay_from_vault`) accepts a
  recipient and moves funds to them **within the vault's on-chain gating** (amount
  caps, time locks, multisig) — money moves through the rule-bound path, not just
  un-escrow. Over-limit is rejected at CheckTx.
- **Guarded free-form send** (if kept): a `send_usdc(to, amount)` tool routed
  through the spend chokepoint (`TxManager.submit` → capability gate #37);
  default-deny, requires an explicit grant, ledgered + on the timeline. Per the
  project's "limits live in vaults" stance, this may be intentionally omitted in
  favor of pay-from-vault only — decide explicitly.
- **Read-only / proactive runs withhold the send/pay tools** (T-13 symmetry with
  the existing vault-tool withholding).
- **High-value sends route through the second-channel confirm** (#24 T-06) once
  that lands.
- Tests: send/pay denied without the grant; over-cap rejected; pay-from-vault
  respects amount/time/multisig gating; read-only run has no pay tool.

## Notes
Trust-critical (global CLAUDE.md §11 + the clinical-trust posture): gate hard,
default-deny, deterministic limits, everything ledgered. This is the core thesis
deliverable — but it's deliberately sequenced AFTER the guardrails (#37 capability
model ✓, #45 vault gating ✓, #24 T-06 confirm pending) are solid.
