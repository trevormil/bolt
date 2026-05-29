---
id: 95
title: "Deeper observability aggregation — spend-by-model/tool, latency breakdown, cross-persona rollup, burn-down projection"
status: closed
prs: ["https://labs.gauntletai.com/trevormiller/vellum-project/-/merge_requests/84"]
priority: low
type: observability
source: audit
created: 2026-05-29
updated: 2026-05-29
refs: ["0042-deep-observability-dashboard.md", "0044-per-persona-spend-budgets.md"]
---

> **Good-enough (2026-05-29, Trevor's call).** The unified Activity feed (MR !84)
> — merged events+ledger timeline, window rollups, budget bar + burn-down,
> latency-by-kind, filters, detail drawer — covers what we need. The remaining
> deep-aggregation scope below (spend-by-model/by-tool, cross-persona rollup,
> memory-growth) is **intentionally dropped** — not worth the per-meter
> persistence + new surfaces at current scale. Closes when !84 merges; reopen only
> if real cost-tuning needs surface.

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
LOW priority — dashboard/cost-tuning enrichment that pays off at scale or with
real users; there are none yet (local-only). All the underlying events are
already emitted, so this is richer queries + charts, not new instrumentation.
Sequence well after the money-path (#89), testing (#90), and persona (#91/#93)
work.
