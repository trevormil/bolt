---
id: 21
title: "Langfuse observability/tracing (reuse AgentForge creds)"
status: in-progress
priority: high
type: feature
source: planning
created: 2026-05-26
updated: 2026-05-27
prs: []
refs: ["ARCHITECTURE.md"]
---

## Description
Wire Langfuse tracing across the runtime — orchestrator -> persona -> LLM call ->
tool call -> chain op — with token/cost attribution. Reuse the AgentForge W1-3
Langfuse key + endpoint via env (never commit). Dev/ops layer that complements
the user-facing on-chain proof-of-action ledger. Wire early so traces exist from
the start.

## Acceptance criteria
- Langfuse client configured from env (reused AF key/endpoint)
- A full request produces a trace with nested spans (agent step, LLM, tool, chain)
- Token + $ cost attached to spans
- No secrets committed

## Phase
0/1 — cross-cutting (wire early)
