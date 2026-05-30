---
id: 120
title: "e2e: Multisig vote sign-off — /vote/:collectionId/:approvalId"
status: closed
prs: ["https://labs.gauntletai.com/trevormiller/vellum-project/-/merge_requests/99"]
priority: high
type: testing
source: audit-2026-05-29
created: 2026-05-29
updated: 2026-05-29
refs: ["0106-test-coverage-backfill.md", "0083-multisig-vote-progress-ux.md"]
---

## Description
Split from #0106 §2. The `/vote/:collectionId/:approvalId` page is the
sign-off entry point that the M-of-N signers (strangers, link-shared) touch.
Zero e2e coverage today. The `getVotes` codec is fuzz-tested; what's missing
is the UI's read of the tally and the signing path.

## Acceptance criteria
- `e2e/vote.spec.ts`: open the page with a 2-of-3 vault → connect Keplr
  mock as signer #1 → submit yes vote → tally updates to 1/3 → connect as
  signer #2 → tally 2/3 → vault unlocks (one-time unlock per ADR-0005).
- Covers `tallyError:true` UI branch (chain read throws) — see #0106 §3 for
  the route's 3 branches; fold the route coverage into this spec.
- Asserts on the unlock state visible from the agent's view, not just the
  public page.

## Notes
This subsumes the route-test items in #0106 §3 — the e2e drives the route
through its branches naturally.
