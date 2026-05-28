---
id: 45
title: "Vault revamp — configurable gating (time + multi-sig voting), escrow tracking, manager admin, third-party sign-off page"
status: open
priority: high
type: feature
source: planning
created: 2026-05-27
updated: 2026-05-27
refs: ["ARCHITECTURE.md", "0016-web-vault-mgmt.md", "0028-vault-manager-rule-change.md", "0012-vaults.md", "project_vellum_bitbadges_model"]
---

## Description
A complete revamp of vaults. Today a vault is a 1:1 USDC-backed collection with a
flat daily-withdraw limit and the human as manager. That's the floor — this
ticket makes vaults a first-class, **configurable, rule-gated** primitive with
real admin separation and multi-party control.

The two gating dimensions to support (a vault may use neither, one, or both):

1. **Time-gating** — withdrawals/actions only valid within (or after) a time
   window: unlock dates, cooldowns between withdrawals, rolling-period caps.
2. **Voting / challenge gating (multi-sig)** — a withdrawal is a *proposal* that
   requires N-of-M sign-offs (or survives a challenge window) before it
   executes. Signers may be external third parties, not just the manager.

The create/edit inputs must adapt to the selected gating: a vault with no gating
keeps today's simple form; a time-gated vault exposes window/cooldown inputs; a
multi-sig vault exposes the signer set + threshold + challenge window.

## Acceptance criteria

### Gating model
- Vault config supports an explicit, typed **gating policy**: `none`,
  `time` (window/cooldown/period-cap), `multisig` (signers[], threshold,
  challenge window), or a composition of time + multisig.
- Identify + document the full criteria set we gate by (start with time +
  multisig voting; leave the model open for more). Map each to the on-chain
  enforcement primitive (BitBadges approval rules / DynamicStore) vs app-side.
- Create/edit UI customizes inputs per selected gating; some vaults gate, some
  don't — the form must degrade to the simple case cleanly.

### Multi-sig / third-party sign-off
- A gated withdrawal becomes a **proposal** with state
  (pending → approved/rejected/expired → executed).
- **Separate page** for managing multi-sig vaults (proposal list, who's signed,
  thresholds, challenge windows).
- For vaults with **external** multi-sigs, a **shareable page link** where
  third parties sign off on a specific proposal (analogous to the /pay/:id
  pattern — opaque id, no auth beyond the link + their wallet signature).

### Escrow + admin
- **Track + display escrowed balances** per vault (what's actually locked vs
  the cap), with provenance (deposits/withdrawals).
- **Manager gets complete admin privileges** — NOT the agent. The agent can
  *propose*/operate within rules; the human manager can override, freeze,
  change rules, force-execute, and reassign. Make the agent↔manager authority
  split explicit and enforced (ties into the #37 capability model + the
  on-chain manager role).

### Cross-cutting
- Trust-critical: every gating rule enforced deterministically (prefer on-chain
  / verifiable over app-side trust). Tests for each gating path + the
  agent-cannot-bypass-manager invariant.
- Reuse the #37 authorizer chokepoint; multi-sig proposals are a new authority
  source alongside grant/human.

## Notes
This is large — expect to split into sub-MRs (gating model + escrow tracking +
proposal/sign-off page are natural seams). Audit `@vellum/tokenization` and the
BitBadges approval engine / DynamicStore FIRST (see learning
"audit_xtokenization_first") — much of time + multisig gating may already be
expressible as approval criteria rather than new modules.
