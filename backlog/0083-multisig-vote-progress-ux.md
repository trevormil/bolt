---
id: 83
title: "Surface M-of-N multisig vote progress in the UX (X of N signed)"
status: closed
priority: medium
type: feature
source: trevor
created: 2026-05-29
updated: 2026-05-29
prs: ["https://labs.gauntletai.com/trevormiller/vellum-project/-/merge_requests/81"]
refs: ["0045-vault-revamp.md", "0063-vault-deposit-requests.md"]
---

## Description
Multisig vault gating is implemented via BitBadges `votingChallenges`
(`quorumThreshold` + voters + `resetAfterExecution`, #45 slice 3): a withdrawal
requires M of N configured signers to vote. But there's **no UX showing vote
progress** — a manager/signer can't see how many of the required signatures
have been collected toward the threshold.

Trevor: track the vote progress somewhere in the UX.

## Acceptance criteria
- For a multisig-gated vault, show **"X of N signed"** (or a progress bar)
  wherever the pending action lives — the vault card in `Vaults.tsx` and the
  shareable vote page (`VotePage`).
- Show who has signed / who is still outstanding (by address, where known), and
  the threshold.
- Reflect state transitions: votes accrue → threshold met → action
  executes/settles → resets (per `resetAfterExecution`).
- Pull the tally from the on-chain `votingChallenge` state (read path); add a
  backend route/derivation if one isn't already exposed
  (cf. `/api/vaults/:collectionId/signoff`).
- e2e / integration coverage of the progress display for a 2-of-3 vault.

## Notes
Source of truth is the on-chain votingChallenge, so the UI reads tally state
rather than tracking votes itself. Coordinate with the vote-link flow (#63) so
a signer following a `/vote` link sees the same progress. Decide whether to
also surface progress in Telegram (likely a follow-up; web first).

## Update (2026-05-29) — blocked on a chain-read spike
Investigated during the stacked-MR run. The vault card **already** shows the
`X-of-N multisig` badge + a share sign-off link (Vaults.tsx), and the VotePage
shows the threshold + signer set. The missing piece — the **live tally** ("how
many of N have signed so far" / yes-weight vs quorum) — lives in the on-chain
**voting-challenge tracker**, and `@vellum/chain` has **no** collection /
approval-tracker / challenge query today (only `getBalances` + tx). sdk.ts even
notes the devnet's BitBadges `/api/v0` indexer isn't wired.

Building this right needs a **verified** BitBadges challenge-tracker query
(correct LCD/indexer endpoint + schema), tested against the real Meridian
devnet. Guessing the endpoint/shape risks showing a **wrong** vote count, which
is unacceptable in a money/trust context — so this is deferred pending that
spike rather than shipped on a guess. Scope it as: (1) a chain-read helper for
the challenge tally, verified against devnet; (2) wire it into the signoff route
+ vault card + VotePage as "X of N signed". Bigger + riskier than the sibling
tickets; needs Trevor's go-ahead on the chain-read approach.

## Resolved (2026-05-29) — MR !81
Spike done + built. The chain read goes over the **existing public Tendermint
RPC** via cosmjs `QueryClient.queryAbci` to the tokenization `Query` service —
NO REST (it 301-collapses the blank collection-level approver), NO gRPC exposure.
Self-contained protobuf codec in `@vellum/chain/query.ts` (`getVotes`/`getApprovalTracker`)
+ pure `voteTally()`. Signoff route returns a live tally; VotePage + the vault
card show "X of N signed · quorum met/pending". **Verified live** on the Meridian
devnet (created vault 235, cast a vote, decoded the real VoteProof). Also fixed a
VotePage bug: it cast the signer's weight as `yesWeight` (a 0–100 percent) → a 1%
near-NO vote that never reached quorum; now casts 100. Remaining-allowance half
(getApprovalTracker → vault_details) is the #94 follow-on (helper built + tested).

