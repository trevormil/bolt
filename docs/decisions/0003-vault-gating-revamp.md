---
id: 3
title: Vault revamp — configurable gating, escrow tracking, manager admin, sign-off
status: accepted
date: 2026-05-27
---

## Context

Today a vault (#12/#16) is a 1:1 USDC-backed Smart Token collection with a flat
`dailyWithdrawLimit`, a frozen human manager (`canUpdateManager` forbidden — the
agent has zero manager capability), plus optional `require2fa` and
`emergencyRecovery`. Ticket #45 asks for a complete revamp: **configurable
gating (time + multi-sig voting), escrow-balance tracking, complete manager
admin (manager ≠ agent), and a third-party sign-off page**.

Per the "audit x/tokenization first" rule, we inspected what the BitBadges
approval engine already expresses (`buildVault` → withdrawal-tier
`approvalCriteria`). Findings:

- **Amount + rolling-period gating** → `approvalAmounts` +
  `resetTimeIntervals` (this is exactly today's `dailyWithdrawLimit`, daily
  reset). Generalizes to weekly/monthly and per-period caps by changing
  `intervalLength`.
- **Time-gating (unlock date / cooldown / validity window)** → the approval's
  `transferTimes` window (currently `FOREVER`); a future-dated start = unlock
  date; `resetTimeIntervals` = cooldown.
- **Multi-sig / voting gating** → `mustOwnTokens` against a dedicated **signer
  collection**: the withdrawal initiator must hold ≥N tokens from the signer
  collection (`amountRange.start = N`) — i.e. N-of-M where third parties
  "sign" by holding/issuing a signer token. A challenge window is a
  `transferTimes` delay before the approval activates.
- **Emergency recovery** → a separate approval to a recovery address
  (overrides outgoing/incoming) — already supported.

So the gating dimensions in #45 are largely **already expressible on-chain via
approvalCriteria** — no new chain modules. The new work is app-side:
configuration, escrow read, the proposal/sign-off orchestration, and surfacing
the manager↔agent authority split.

## Decision

1. **Typed gating policy** (config layer) that compiles to `buildVault`
   approvalCriteria:
   - `none` — open (no withdraw cap).
   - `amount` — per-period cap (`{ limit, period: daily|weekly|monthly }`) →
     `approvalAmounts` + `resetTimeIntervals`.
   - `time` — `{ unlockAt?, cooldownMs? }` → `transferTimes` + reset intervals.
   - `multisig` — `{ signerCollectionId, threshold, challengeWindowMs? }` →
     `mustOwnTokens` (threshold via `amountRange.start`) + optional challenge
     `transferTimes`.
   - Compositions allowed (amount + multisig, etc.). Create/edit UI shows only
     the inputs for the selected policy; the simple case stays a single field.

2. **Escrow tracking** (slice 1, this ADR's first MR): read the backing
   address's on-chain USDC balance = the locked escrow. Deterministic, app-side,
   no new gating. Displayed per vault with provenance from the ledger
   (deposits/withdrawals already recorded as `vault_op`).

3. **Manager = complete admin, never the agent.** The human manager is already
   frozen on-chain (the trust anchor). We surface manager-only operations
   (freeze, rule change via a new collection version, force emergency
   migration, reassign is permanently forbidden) as a **manager** surface
   distinct from the agent's propose/withdraw-within-rules. The agent NEVER
   receives manager capability; the #37 authorizer continues to gate the
   agent's `vault.create`/`vault.withdraw`, and multi-sig proposals become a new
   authority source alongside grant/human.

4. **Proposal + third-party sign-off** (later slice): a gated withdrawal becomes
   a **proposal** with state (pending → approved/rejected/expired → executed),
   surfaced on a **shareable opaque-id page** (the `/pay/:id` pattern) where
   external signers approve with their own wallet. Enforcement stays on-chain
   (`mustOwnTokens`); the app orchestrates collecting the signer tokens /
   endorsements and only broadcasts the withdrawal once the threshold is met.

## Slices

1. **Escrow tracking** — read + display locked balance per vault. *(this MR)*
2. **Gating-policy config + compiler + create/edit form** — typed policy →
   approvalCriteria; UI adapts to the selected policy.
3. **Multi-sig proposal store + third-party sign-off page** — proposal
   lifecycle + shareable signing page.
4. **Manager admin surface** — manager-only ops, agent/manager split made
   explicit in the UI + authorizer.

## Consequences

- Leans entirely on the existing approval engine for enforcement — no new chain
  modules (consistent with the compliance-zone audit). Lower risk, less code.
- The sign-off orchestration is the main new app-side surface; it must never let
  the agent self-approve (the threshold tokens are issued by third parties /
  the manager, not the agent).
- Escrow display is read-only truth from chain — it never gates; gating is the
  approvalCriteria. Keeps the trust boundary deterministic.
