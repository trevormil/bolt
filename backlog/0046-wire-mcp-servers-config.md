---
id: 46
title: "Wire configured MCP servers into chat + daemon (persistent connections + config)"
status: open
priority: medium
type: feature
source: post-#33
created: 2026-05-27
updated: 2026-05-27
refs: ["0033-mcp-connect-verify.md", "0005-agent-loop-mcp.md", "0040-persona-settings-framework.md", "0037-capability-permission-model.md"]
---

## Description
#33 proved the MCP path end to end (real SDK server → McpClient → `mcpTools`
adapter → agent loop → capability-gated + ledgered) and shipped the
`connectStdio(command, args)` entry. What's left is making it a configurable,
production-usable feature rather than a tested capability.

## Acceptance criteria
- Per-persona (or global) **MCP server config** via the settings framework
  (#40): a list of `{ name, command, args, env? }` stdio servers, or remote
  transports later.
- The **daemon** (#31) connects configured servers ONCE at startup and keeps
  the connections alive (don't spawn per chat message); `chat()` merges their
  `mcpTools(...)` into the persona's tool set via `combineTools`.
- The "mcp" capability (#37) gates whether a persona may use MCP at all, and
  ideally per-server scope (scope = server name).
- Graceful handling: a server that fails to connect logs + is skipped, never
  crashes the daemon; reconnect/backoff is acceptable as a stretch.
- A documented manual walk connecting one real external app (e.g.
  `@modelcontextprotocol/server-filesystem`) end to end.

## Notes
The adapter + gating + ledgering already exist (`packages/engine/src/mcp-tools.ts`).
This ticket is connection lifecycle + config + chat wiring.
