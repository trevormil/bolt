---
id: 126
title: "Sign-page plain-English decode: /vote multisig withdrawal sign-off"
status: closed
priority: high
type: feature
source: post-audit
created: 2026-06-04
closed: 2026-06-04
refs: ["0045-vault-revamp.md", "0068-multisig-vault-signoff.md", "0120-e2e-multisig-vote-page.md"]
---

## Description
Right now when a multisig signer opens `/vote/:collectionId/:approvalId` to
sign off on a withdrawal, the page shows the raw approval / proposal data
but does NOT translate it into "what am I actually authorizing". A signer
is expected to click "Approve" without seeing the consequences in real
terms — the riskiest cross-party UX in the product.

This ticket is the primary surface of the "sign-page plain-English decode"
audit item (one of the 3 BitBadges integrations pre-approved by Trevor;
the other two — USDC→vault funding (#TBD), atomic manager handoff (#TBD)
— are scoped separately).

### The translation we owe the signer

When a withdrawal proposal exists, the page should render a clear preamble
ABOVE the "Approve" / "Reject" buttons answering, in plain English:

1. **What** — "X USDC will move from vault Y to address Z" (resolve the
   collectionId → vault name, the destination → bb1… short address +
   optional human label).
2. **Who** — who proposed the withdrawal (the agent persona name, or
   "vellum agent — Atlas" rather than a raw bb1 address).
3. **Quorum state** — "3 of 5 yes votes needed; 2 already in". Pulls
   directly from the existing voteTally surface (#83 / #0083).
4. **What you sign means** — a single sentence: "Approving casts a yes
   vote with weight W; once 3/5 yes votes are in, the X USDC moves on
   chain — there is no recall."

The decoded view must be unambiguous to a non-technical signer (a
co-signer who isn't the agent's owner). Raw JSON / proto field names
must NOT appear in the primary path; an optional "Show raw tx" disclosure
keeps the structured detail one click away for the technical reader.

## Acceptance criteria

- `/vote/:collectionId/:approvalId` renders a plain-English summary card
  ABOVE the sign-off controls when a withdrawal proposal exists. The
  required fields: amount, destination, vault name, proposer, quorum
  progress, "what approval means" sentence.
- The card resolves bb1 addresses to short displays (first 6 + last 4)
  and, where available, persona/manager names from the server-side
  context already shipped via the `/signoff` route (#0068).
- The structured/raw view stays available behind a "Show details" toggle
  — same shape as today, no information removed.
- A Playwright e2e (extends `#0120`'s vote spec) asserts the summary card
  renders with the right amount + vault name + quorum text before the
  signer's Approve button is clickable.
- The decoded values come from a single shared decoder module
  (`packages/vote-decode/` or similar) so the same view-model can power
  the /pay and /deposit sign pages in the follow-up tickets without
  re-deriving it per surface.

## Notes

Implementation rule (CLAUDE.md): reference the Meridian repo's
`apps/web/lib/chain/` and `apps/web/lib/prediction-market/` for the proto
→ human decode patterns FIRST. **Do not guess the chain logic — sync with
Trevor on the exact pattern** before writing the decoder. Possible LCD
queries needed: the approval definition (for the destination + amount cap),
the withdrawal proposal state (for the actual µUSDC + recipient), the
voteTally (already wired for #0083).

Follow-ups (separate tickets, share the decoder):
- #0127 `/pay/:id` — payment-request page; decodes the MsgSend the funder
  is signing.
- #0128 `/deposit/:id` — vault deposit page; decodes the
  MsgTransferTokens the funder is signing.
