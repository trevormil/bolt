---
id: 122
title: "e2e: Deposit request — /deposit/:id public fund page"
status: in-progress
prs: ["https://labs.gauntletai.com/trevormiller/vellum-project/-/merge_requests/101"]
priority: high
type: testing
source: audit-2026-05-29
created: 2026-05-29
updated: 2026-05-29
refs: ["0106-test-coverage-backfill.md", "0067-agent-request-tools.md"]
---

## Description
Split from #0106 §2. Mirror of #0121 for the deposit-request flow — the
public page that drops USDC into a vault's escrow via link share. Zero e2e
today.

## Acceptance criteria
- `e2e/deposit.spec.ts`: open `/deposit/:id` → Keplr mock signs MsgSend to
  the vault's escrow address → broadcast → success UI + agent-side request
  state flips to `funded`.
- Covers both the multisig-vault case (deposit doesn't need sign-off —
  escrow funding is open) and the simple cap-gated vault case.
- Negative path mirroring #0121 (expired / already-funded).

## Notes
Shares the test-server LCD seam from #0098. Pairs with #0117 (in-app
deposit affordance).
