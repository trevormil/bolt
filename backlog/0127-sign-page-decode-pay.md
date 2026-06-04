---
id: 127
title: "Sign-page plain-English decode: /pay payment-request fund page"
status: open
priority: medium
type: feature
source: post-audit
created: 2026-06-04
refs: ["0067-agent-request-tools.md", "0121-e2e-payment-request-pay-page.md", "0126-sign-page-decode-vote.md"]
---

## Description

Companion to #0126. When someone opens `/pay/:id` (the share-link a Vellum
user sends to get paid), they're about to sign a MsgSend with their Keplr
wallet. Today they see the request's amount + memo, but not a clear "you
are about to authorize this exact transfer" preamble — same risk shape as
the vote page, slightly lower stakes because the funder controls the
source wallet directly.

### Translation we owe the funder

1. "You are about to send **X USDC** to **bb1…(name if known)** as
   payment for **[memo]**."
2. "Your wallet **bb1…(your address)** will be charged X USDC + chain
   fees."
3. Optional: the recipient's recent activity tier ("first-time recipient"
   vs "you've paid this address before") — defensible heuristic against
   address-swap injection.

## Acceptance criteria

- `/pay/:id` renders the decoded summary above the Keplr "Pay now"
  control, using the shared decoder module landed in #0126.
- bb1 addresses are resolved (short display + label when available).
- The structured raw view stays one click away.
- E2e extends #0121's pay-page spec to assert the summary text renders
  with the right amount + recipient short address.

## Notes

Depends on #0126's decoder module. Same Meridian-reference + ASK TREVOR
rule applies. The MsgSend decode is simpler than the multisig-withdrawal
case (no proposal / quorum state) — straightforward source/destination/
amount/denom.
