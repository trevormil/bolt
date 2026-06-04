---
id: 128
title: "Sign-page plain-English decode: /deposit vault funding page"
status: closed
priority: medium
type: feature
source: post-audit
created: 2026-06-04
closed: 2026-06-04
refs: ["0062-shareable-vault-deposit-page.md", "0122-e2e-deposit-request-deposit-page.md", "0126-sign-page-decode-vote.md"]
---

## Description

Companion to #0126. When someone opens `/deposit/:id` to fund a vault on
the Vellum user's behalf, they're about to sign a MsgTransferTokens that
mints vault tokens to the AGENT wallet (per #45 / !37 — the agent holds
the tokens it later burns to withdraw). The funder needs to see in plain
English that:

1. **What** — "You are about to deposit **X USDC** into the vault
   **[vault name]**" — vault name resolved from the deposit-request,
   not the bare collectionId.
2. **Where it goes** — "The USDC funds the vault's escrow; the vault
   tokens go to the persona's agent wallet so it can withdraw within
   the vault's limits (you, as funder, do NOT hold a claim on the
   vault directly)."
3. **Source** — "From your wallet bb1…(your address)".

The "tokens go to the agent" detail is the non-obvious bit funders
should see — it's the consequence the audit pinned as
silently-unintuitive.

## Acceptance criteria

- `/deposit/:id` renders the decoded summary above the Keplr "Deposit"
  control, using the shared decoder module from #0126.
- The "vault tokens go to the agent" consequence is shown in the
  summary, not just buried in the raw view.
- bb1 addresses resolved (short + label).
- E2e extends #0122's deposit-page spec to assert the summary renders
  with the right amount + vault name + "agent holds vault tokens"
  language.

## Notes

Depends on #0126's decoder module. Same Meridian-reference + ASK TREVOR
rule applies. The MsgTransferTokens decode is the most semantically dense
of the three because the bb1backing → agent flow needs translation, not
just rendering.
