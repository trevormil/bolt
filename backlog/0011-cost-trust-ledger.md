---
id: 11
title: "Cost + trust ledger (proof-of-action)"
status: in-progress
priority: high
type: feature
source: planning
created: 2026-05-26
updated: 2026-05-27
prs: ["https://labs.gauntletai.com/trevormiller/vellum-project/-/merge_requests/10"]
refs: ["ARCHITECTURE.md"]
---

## Description
Log every tool call, spend, vault op, and funding event in a legible, auditable
ledger (who/what/authority/cost). Data model + surfacing hooks.

## Acceptance criteria
- Append-only ledger entries for each action
- Token/$ cost attached to entries
- Queryable for Telegram summaries + web full view
