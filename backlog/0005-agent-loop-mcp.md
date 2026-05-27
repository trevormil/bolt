---
id: 5
title: "Thin agent loop + MCP client (connect >=1 app)"
status: in-progress
priority: critical
type: feature
source: planning
created: 2026-05-26
updated: 2026-05-27
prs: []
refs: ["ARCHITECTURE.md"]
---

## Description
Minimal tool-using agent loop leaning on the model; MCP client for tools.
Satisfies the PRD "connect at least one application".

## Acceptance criteria
- Agent loop calls tools and returns a result
- MCP client connects to >=1 server; tools invokable
- Selective tool loading (only relevant tools in context)
