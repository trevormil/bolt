---
id: 32
title: "Web bundle code-splitting (first-load perf)"
status: open
priority: low
type: performance
source: planning
created: 2026-05-27
updated: 2026-05-27
prs: []
refs: ["0027-keplr-human-wallet.md"]
---

## Description
The SPA emits a single ~960 KB JS chunk (the BitBadges SDK + cosmjs + Node
polyfills dominate). Code-split so first paint doesn't block on the chain stack —
e.g. lazy-load the Keplr/signing path (only needed when the human acts) and the
`/pay` page route.

## Acceptance criteria
- Main chunk under the 500 KB warning threshold (or justified)
- Keplr/signing + `/pay` route loaded on demand (dynamic import)
- No regression in connect/fund/pay/vault flows
