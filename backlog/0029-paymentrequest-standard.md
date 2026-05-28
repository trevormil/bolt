---
id: 29
title: "Adopt the on-chain BitBadges PaymentRequest standard"
status: icebox
priority: low
type: feature
source: planning
created: 2026-05-27
updated: 2026-05-27
prs: []
refs: ["0014-paymentrequest-link.md"]
---

## Description
Follow-up to #14. PaymentRequests currently ship as a faithful pragmatic
realization: a server-issued one-time link, paid by a human-signed USDC transfer
to the persona (funds → global balance, agent never pulls, funding verified +
recorded in the ledger). This does NOT use the on-chain BitBadges PaymentRequest
*standard* (approval-engine facilitation) — there is no SDK builder for it.

If/when the standard's builder is available (or worth hand-rolling), adopt it so
requests are first-class on-chain objects rather than app-tracked rows.

## Acceptance criteria
- Evaluate the BitBadges PaymentRequest standard + SDK support (ask Trevor / check docs)
- If adopted: agent creates the on-chain request; human fulfils via the standard
- Funding still lands in the global balance + ledger; behaviour parity with today
- Decide explicitly if the app-side bank-send realization is good enough (close as won't-do)

## Note 2026-05-28 (reconciliation — stays open)
App-side PaymentRequest (#14) shipped instead. Adopting the on-chain BitBadges PaymentRequest standard is still deferred.

## Iceboxed 2026-05-28
Decision: keep PaymentRequests app-side (#14, shipped). Not adopting the on-chain BitBadges PaymentRequest standard for now — app-side covers the need. Revisit if cross-app interop becomes a requirement.
