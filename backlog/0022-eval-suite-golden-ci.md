---
id: 22
title: "Eval suite — golden sets + LLM-as-judge + CI"
status: open
priority: high
type: testing
source: planning
created: 2026-05-26
updated: 2026-05-26
prs: ["https://labs.gauntletai.com/trevormiller/vellum-project/-/merge_requests/17"]
refs: ["ARCHITECTURE.md"]
---

## Description
A budget-aware eval suite. Golden task sets per use case with success criteria:
deterministic checks where possible (right tx fired? within budget?), LLM-as-judge
for open-ended output. Datasets/scores in Langfuse. CI runs the suite and tracks
pass-rate over time (split single-step / multi-step / long-horizon). See
research/evaluation.md.

## Acceptance criteria
- Golden-set format + a starter set of representative tasks
- Harness runs a single case (cheap, for iteration) and the full suite (gated)
- Deterministic oracle + LLM-as-judge paths both supported
- CI job runs the suite on change; pass-rate tracked (Langfuse datasets/scores)
- Budget guardrail: full suite not run on every commit

## Phase
1 — cross-cutting quality (grows over phases)
