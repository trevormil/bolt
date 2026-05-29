---
id: 68
title: "Multisig vault sign-off must bind to a specific withdrawal proposal (not vault-wide)"
status: closed
priority: high
type: security
source: review
created: 2026-05-28
updated: 2026-05-28
refs: ["0045-vault-revamp-gating-multisig.md", "0066-agent-vault-criteria.md", "0067-agent-request-tools.md"]
---

> **CLOSED 2026-05-28 — superseded by ADR-0005 (multisig one-time-unlock model).**
> The premise here (per-withdrawal consent) was wrong: by design multisig is a
> one-time *authorization to operate* the vault, not approval of each transfer.
> The fix landed in !62 — `resetAfterExecution: false` + honest `/vote` copy +
> full signer validation + ADR-0005. The per-withdrawal-proposal rework is
> explicitly rejected, not deferred.

## Description
The multisig withdrawal gate uses ONE deterministic `VAULT_WITHDRAW_PROPOSAL_ID`
per vault (a reusable votingChallenge, `resetAfterExecution`). The `/vote/:id`
page + `/api/vaults/:collectionId/signoff` expose only vault-level data (name,
symbol, threshold) — **no amount, recipient, memo, or expiry**. So signers
approve "a withdrawal" generically, and once a quorum exists the agent can submit
*any* `withdraw_from_vault` / `pay_from_vault` that fits the vault's other rules.
The signers never approved that specific amount/recipient — a broken money-control
boundary for a security feature whose entire purpose is per-transaction consent.

Pre-existing #45 slice 3 design; surfaced by the !62 (#66) review because #66
lets the **agent** configure multisig, and #67's `request_vote` shares the
`/vote` link. It affects human-created multisig vaults (#55) just as much.

## Reproduction
1. Create a multisig vault (2 signers, threshold 2).
2. Both signers open `/vote/:collectionId` and cast `proposalId: "vault-withdraw-vote"` — the page shows only vault name/symbol/threshold.
3. After quorum, ask the agent to `pay_from_vault` to an arbitrary recipient/amount within the amount/time caps. The chain challenge is vault-wide, so it executes — the signers never saw that recipient/amount.

## Acceptance criteria
- A **proposal store** keyed by opaque id: `{ personaId, collectionId, action ("withdraw" | "pay"), amountMicro, recipient/backingAddress, memo, expiry, status, votes[] }`.
- `/api/vaults/:collectionId/signoff` and `/vote/:collectionId` become **proposal-id** routes (`/vote/:proposalId`) that show the signer the EXACT withdrawal details (amount, recipient, memo, expiry).
- `castVoteMsg` uses a `proposalId` derived from the stored proposal (not the single reusable vault-wide id).
- Withdrawal execution (`engine.vaults.withdraw` / `.pay`) **verifies** the proposal is approved AND matches the amount/recipient being executed before broadcasting.
- The agent raises a proposal (a new/extended `request_vote` that creates a proposal for a specific intended withdrawal) and shares its `/vote/:proposalId` link.
- Tests: two different withdrawals on the same vault require distinct proposal ids; approval for one amount/recipient cannot execute a different one; `proposalId` is included in the vote message and differs per intent.

## Notes
Security-critical money path — full multi-pass rigor (see clinical-trust ethos).
This is the correct home for the multisig redesign; #66/#67 should not try to
fix it inline. Decide whether to gate #66's agent multisig exposure on this
landing first, or ship #66 amount/time gating now and add agent multisig with
this rework.
