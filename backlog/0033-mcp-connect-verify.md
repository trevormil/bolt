---
id: 33
title: "Verify/complete MCP — connect ≥1 real app"
status: closed
priority: medium
type: testing
source: planning
created: 2026-05-27
updated: 2026-05-27
prs: []
refs: ["0005-agent-loop-mcp.md"]
---

## Description
#5 delivered the agent loop + MCP client scaffold. Confirm the "connect ≥1 app"
claim is actually met end to end — a real MCP server wired in, a tool from it
callable by a persona's agent, and the call landing in the ledger — or wire one
if only the client scaffold exists.

## Acceptance criteria
- At least one real MCP server connected (e.g. a calendar/filesystem/BitBadges tool)
- A persona's agent invokes an MCP tool through the loop
- The invocation is metered + appears in the proof-of-action ledger
- e2e test (or documented manual walk) proving it

## Closed 2026-05-28
Delivered in the squashed local-first build, merged to `main` via MR !40 (superseded per-ticket MRs !26–!39).
