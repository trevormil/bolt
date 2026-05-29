---
id: 55
title: "Streamline the vault-creation UX"
status: closed
priority: medium
type: ux
source: review
created: 2026-05-28
updated: 2026-05-28
prs: ["https://labs.gauntletai.com/trevormiller/vellum-project/-/merge_requests/54"]
refs: ["0045-vault-revamp.md", "0053-frontend-design-revamp.md"]
---

## Description
The vault-creation flow (adaptive form: name/symbol + amount cap + period +
unlock date + multisig signers + threshold) is functional but feels heavy. It
needs streamlining so creating a vault is quick + obvious.

## Acceptance criteria
- Simplify the create form: sensible defaults, progressive disclosure (gating is
  optional/advanced), clearer grouping of amount / time / multisig.
- Plain-English preview of the rule being created ("≤ 25 USDC per week, unlocks
  Jun 1, 2-of-3 sign-off") before submit.
- Inline validation (e.g. unreachable multisig threshold) surfaced in the form,
  not just a 400.
- On the Aurum system (gold accents, USDC mark, mono amounts).

## Notes
Pairs with #53. Keep the on-chain gating semantics from #45 intact — this is a
form/flow polish, not a rules change.
