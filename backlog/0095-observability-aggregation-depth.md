---
id: 95
title: "Deeper observability aggregation — spend-by-model/tool, latency breakdown, cross-persona rollup, burn-down projection"
status: in-progress
prs: ["https://labs.gauntletai.com/trevormiller/vellum-project/-/merge_requests/84"]
priority: medium
type: observability
source: audit
created: 2026-05-29
updated: 2026-05-29
refs: ["0042-deep-observability-dashboard.md", "0044-per-persona-spend-budgets.md"]
---

## Description
The observability emit seams are solid (chat / fs_op / capability / tool_call /
spend / vault_op all fire — `packages/observability`), but the aggregation is
shallow: `summary()` gives window totals + by-kind counts only. Two tickets'
scope remains:
- **#42:** missing spend-by-model, by-tool/action breakdown, latency breakdown
  (LLM vs tool vs chain), memory growth over time, and a cross-persona global
  rollup.
- **#44:** budget spend is read from the **ledger**, not the #42 event store
  (the intended "single source of spend truth"); no burn-down **projection** in
  the dashboard.

## Acceptance criteria
- Grouped aggregation queries: spend-by-model, by-tool/action, latency breakdown
  by stage, memory-growth, and a global cross-persona rollup.
- Surface these in `web/src/app/Activity.tsx` (the deep dashboard).
- Re-point budget spend to the observability event store as the single source of
  truth (or document why the ledger stays authoritative); add a burn-down
  projection.

## Notes
LOW→MEDIUM. All underlying events are already emitted, so this is richer queries
+ charts, not new instrumentation.

## Update (2026-05-29) — unified observability + first aggregation pass (MR !84)
Re-scoped to fold in the user's "combine the Activity + Ledger screens" ask.
Shipped:
- **One unified Activity feed** (`mergeObservability`): the event timeline is the
  spine; the ledger contributes the accountability lens (on-chain `txHash` +
  `authority`) it alone holds — settlement rows always kept, non-settlement ledger
  dupes (e.g. the per-turn "message" cost) collapse into their event. Source-tagged,
  filterable (kind / source / errors), per-row detail drawer with the tx + meta.
  **The separate Ledger tab is retired.** New `GET /api/personas/:id/observability`.
- **latency-by-kind** breakdown + **month-end burn-down projection** vs the
  monthly cap. Window toggle (24h/7d/30d) on the headline cards.
- Budget stays **ledger-authoritative** (it is the immutable proof-of-action /
  settlement record); the event store is the operational lens. Documented here
  rather than re-pointed — they answer different questions.

Deferred (data-model work, not just queries):
- **spend-by-model / by-tool** — needs per-meter persistence; today the ledger
  rolls meters into one "message" entry and tool events carry no cost. Follow-on.
- **Cross-persona global rollup** + **memory-growth-over-time** — both need new
  aggregation surfaces; not blocking the unified view.
