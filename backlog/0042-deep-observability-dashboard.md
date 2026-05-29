---
id: 42
title: "Deep per-persona observability + dashboard (user-facing)"
status: closed
priority: high
type: feature
source: planning
created: 2026-05-27
updated: 2026-05-27
prs: []
refs: ["ARCHITECTURE.md", "0011-cost-trust-ledger.md", "0021-langfuse-observability.md", "0017-web-budgets-ledger.md", "0040-persona-settings-framework.md"]
---

## Description
**Invest deeply here.** Track as much as possible, then give each persona a rich
dashboard. This is **distinct from Langfuse (#21)** — Langfuse is dev/ops tracing
for *us*; this is *user-facing* product observability. The proof-of-action ledger
(#11) is a good start, but this is 1000× the insight: a full local telemetry
store + analytics, all in `~/.vellum`, all local.

**Capture (append-only events, structured):** every message (in/out, latency);
each LLM call (model, prompt/completion/total tokens, $ cost, routing decision +
why); every tool call (which, args summary, result, latency, ok/err); filesystem
ops (#35); chain actions (bank send, vault create/deposit/withdraw, faucet,
payment-request fund); scheduled-task runs (#36); capability approvals/denials
(#37); memory recall hits + injected context; errors/exceptions; budget burn.

**Per-persona dashboard:** spend over time (day/week/month) broken down by model
and by tool/action; token usage; activity timeline; tool + chain action log;
budget burn-down vs limits (#44); model mix; error rate; latency breakdown (LLM
vs tool vs chain); memory growth. Plus a global cross-persona rollup.

## Acceptance criteria
- An append-only local event store (sqlite) with a typed event taxonomy; the
  ledger (#11) becomes a curated view over it (no double-writing)
- Instrument the engine once (a tap on the agent loop / tx / tools / memory) so
  events are captured centrally, not sprinkled per-surface
- Aggregation queries (by persona, time window, model, tool, action kind)
- A per-persona dashboard (web) with the breakdowns above + a global rollup
- Honors retention/verbosity settings via #40; never logs secrets/raw keys
- Powers the budget tracking in #44 (single source of spend truth)

## Progress 2026-05-28 (partial — stays open)
Merged in !40: the observability **spine** (`@vellum/observability` event store
— kind/latency/cost/tokens/ok/meta, metadata-only) + emit on chat in/out and
capability decisions, the `GET /events` API, and the **Activity tab** (timeline
+ 24h/7d/30d summary cards).
Still open (deferred follow-on): emit at the remaining seams (fs_op, task_run,
tool_call, spend, vault_op, error) + per-step LLM metrics.
