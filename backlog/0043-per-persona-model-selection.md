---
id: 43
title: "Per-persona model selection (over OpenRouter)"
status: closed
priority: medium
type: feature
source: planning
created: 2026-05-27
updated: 2026-05-27
refs: ["ARCHITECTURE.md", "0004-llm-router.md", "0040-persona-settings-framework.md"]
---

## Description
OpenRouter brokers every model, but each persona should choose its own. Today the
router (#4) picks cheap-default → escalate-to-frontier from global env models;
make those a **per-persona setting** (over #40): which model(s) a persona uses.

Design: a global **approved-models** list + default cheap/frontier pair; each
persona selects from it (or pins a single model, or overrides the cheap/frontier
pair). Persona inherits the global default unless it sets its own. The router
resolves the persona's selection at call time; cost/usage land in #42 per model.

## Acceptance criteria
- Global approved-models list + default cheap/frontier (settings, #40)
- Per-persona override: pick cheap/frontier pair, or pin one model, from the
  approved list; inherits global otherwise
- Router (#4) reads the resolved per-persona selection at call time
- CLI + web selector showing the approved list + current (inherited vs overridden)
- Reject a selection not in the approved list; observability (#42) attributes
  spend/usage per model per persona

## Closed 2026-05-28
Delivered in the squashed local-first build, merged to `main` via MR !40 (superseded per-ticket MRs !26–!39).
