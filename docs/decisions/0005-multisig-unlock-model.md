---
id: 5
title: "Multisig vaults are a one-time unlock, not per-transaction consent"
status: accepted
date: 2026-05-28
relates-to: ["0003-vault-gating-revamp", "0004-yolo-host-exec"]
---

## Context

Vault multisig (#45 slice 3) compiles to a single BitBadges `votingChallenge`
per vault (`proposalId: "vault-withdraw-vote"`). A code review of the agent's
`create_vault` exposure (#66 / MR !62) flagged HIGH: the sign-off is not bound
to a specific withdrawal — signers cast a vote on a generic vault-wide proposal,
the `/vote` page shows no amount/recipient, and once quorum exists the agent can
execute any withdrawal that fits the vault's other rules. The reviewer's implied
fix was a per-withdrawal proposal store so each sign-off approves one concrete
transfer.

That fix assumes the **intent** is per-transaction approval. It is not.

## Decision

Multisig is a **one-time unlock — an authorization to *operate* the vault**, not
approval of an individual transfer. N-of-M signers vote once to authorize the
agent; once quorum is reached the challenge **never resets**
(`resetAfterExecution: false`) and the agent withdraws freely thereafter, bounded
by whatever amount/time caps are also set on the vault. The model is "co-sign to
enable the agent," like a board authorizing a treasurer who then operates within
a mandate.

This composes with the other gating: a vault can be "2-of-3 unlock AND
≤50 USDC/week" — multisig governs *whether* the agent may operate the vault;
amount/time caps govern *how much* once unlocked.

The surfaces must state this honestly: the `/vote` page says it is a one-time
unlock that authorizes the agent to withdraw going forward, not approval of a
single payment.

## Consequences

- **Matches intent + simpler.** No proposal store, no per-withdrawal `/vote`
  routes, no execution-time proposal matching. The reusable challenge is correct.
- **The multisig does NOT constrain individual post-unlock transfers.** After
  quorum, a misbehaving or prompt-injected agent could move the vault's funds to
  any recipient. The *ongoing* bounds are (a) the amount/time caps, and (b) the
  human manager's revoke/drain kill-switch (#45 slice 4). This is consistent with
  the full-trust YOLO posture (ADR-0004): the agent holds the signing key anyway,
  so multisig is a human gate on *starting* to use an earmarked pool, not a
  per-payment control.
- **Rejected:** the per-withdrawal-proposal rework (filed as #68) — it
  contradicts this model and over-engineers a control we deliberately don't want.
  #68 is closed in favor of this ADR.
