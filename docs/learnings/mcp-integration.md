---
title: MCP integration — adapter, gating, and the dual-zod typing gotcha
date: 2026-05-27
tags: [mcp, agent, capabilities, testing]
---

## What works (verified #33)

The agent can call tools from a real MCP server end to end:

1. `McpClient` (`packages/agent/src/mcp.ts`) connects over any transport —
   `connectStdio(command, args)` in prod, any `Transport` in tests.
2. `mcpTools(engine, personaId, client)` (`packages/engine/src/mcp-tools.ts`)
   discovers the server's tools and returns `{ tools, invoke }` for the loop.
   Every call is **capability-gated** on `"mcp"` (#37, default-deny) and
   **ledgered** as a `tool_call` (+ emitted on the #42 timeline).
3. `runAgent` invokes the tool; the result feeds back to the model.

The e2e test (`mcp-tools.test.ts`) runs a real official-SDK `McpServer`
exposing an `add` tool over `InMemoryTransport.createLinkedPair()` — the same
protocol a stdio server speaks, without a subprocess.

## Manual walk: connect a real stdio app

```ts
const client = new McpClient();
await client.connectStdio("npx", ["-y", "@modelcontextprotocol/server-filesystem", "/some/dir"]);
const { tools, invoke } = await mcpTools(engine, personaId, client);
// grant the persona "mcp", then combineTools(vaultTools, ..., { tools, invoke }) into chat()
```

Persistent connection lifecycle + per-persona server config is #46 (not yet
wired into `chat()`/daemon — connect-per-message would be wrong; connect once
at daemon startup).

## Gotcha: the MCP SDK bundles its own zod

`McpServer.registerTool({ inputSchema: { a: z.number() } })` fails to typecheck
when `z` is your workspace zod — the SDK's `ZodRawShape` is nominally a
*different* zod instance, so `ZodNumber is not assignable to AnySchema` even
though it's structurally identical and works at runtime. In tests, cast the
`registerTool` call loosely (`as unknown as (...) => unknown`) and annotate the
handler args. Don't try to share a single zod across the boundary — there isn't
one. This only bites the *server* side (defining tools); the client side
(`listTools`/`callTool`) is schema-agnostic and types cleanly.
