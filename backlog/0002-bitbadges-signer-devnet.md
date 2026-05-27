---
id: 2
title: "BitBadges signer wired to the Meridian devnet"
status: closed
priority: critical
type: feature
source: planning
created: 2026-05-26
updated: 2026-05-26
prs: []
refs: ["ARCHITECTURE.md"]
---

## Description
Sign and broadcast BitBadges txs from the agent to the Meridian devnet RPC using
the `bitbadges` SDK / cosmjs and a persona hot key. See docs/runbooks/meridian-devnet.md.

## Acceptance criteria
- Load a hot key (dev: `alice`) and resolve its `bb1` address
- Build → sign → broadcast a no-op/transfer tx to `rpc.meridian.trevormil.com`; confirm in a block
- Balance + tx-status helpers

## Audit refinement (2026-05-26)
**Do this FIRST (after scaffold) — highest-risk unknown.** Validate a real
broadcast+confirmed tx on the devnet before any business logic. Bumped to critical.

## Build-time note: BitBadges pattern
Confirmed feasible by Trevor. **Reference the Meridian repo first** (`~/CompSci/gauntlet/meridian`: `apps/web/lib/chain/` + `lib/prediction-market/`, `apps/aggregator/src/chain/`), **then ASK TREVOR for the exact implementation pattern** before writing chain logic — do not guess.
