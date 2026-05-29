---
title: Connect an external MCP server to a persona
last-verified: 2026-05-28
---

# Connect an external MCP server to a persona

Bolt personas can use tools from any [Model Context Protocol](https://modelcontextprotocol.io)
stdio server (#46). The daemon holds the connections open for its lifetime and
merges each server's tools into the persona's agent loop — gated on the `mcp`
capability (#37) and recorded on the ledger + observability timeline (#42).

This walk connects the official **filesystem** server end to end.

## 1. Configure the server (persona or global)

Servers are a setting (#40), so they resolve `persona → global → default`. Set a
per-persona list via the API (the daemon must be running — see CLAUDE/README):

```bash
# Replace :id with the persona id (e.g. "atlas").
curl -sS -X PUT http://127.0.0.1:8787/api/personas/atlas/mcp-servers \
  -H 'content-type: application/json' \
  -d '{
    "servers": [
      {
        "name": "fs",
        "command": "bunx",
        "args": ["-y", "@modelcontextprotocol/server-filesystem@2025.8.21", "/tmp"]
      }
    ]
  }'
# → { "value": [ { "name": "fs", ... } ], "source": "persona" }
```

- `name` is the server id **and** its capability scope.
- `args` follow the server's own CLI (the filesystem server takes one or more
  allowed root directories — here `/tmp`).
- `env` (optional) is merged **over** the spawned child's safe default
  environment, so it augments `PATH`/`HOME` rather than replacing them.

To configure a server for *every* persona, write it to the global bucket instead
(the daemon warms the global set at startup); per-persona overrides connect lazily
on that persona's first chat turn.

## 2. Grant the `mcp` capability

MCP is default-deny. Grant the capability, optionally scoped to one server name:

```ts
// scope: null  → any MCP server;  scope: "fs" → only the "fs" server
engine.capabilities.grant({ personaId: "atlas", capability: "mcp", scope: "fs", mode: "allow" });
```

Without a grant the tools are still *offered* to the model, but any call returns
`Denied: …` and never reaches the server.

## 3. Use it

Chat with the persona and ask it to do something the server exposes (e.g. "list
the files in /tmp"). The agent discovers the server's tools on the turn, calls
them through the gate, and the call lands on the ledger as `tool_call`
(`mcp:<tool>`) and on the events timeline with latency + ok/err.

Connections are pooled: the child process is spawned once and reused across
turns, not re-spawned per message. On daemon shutdown (SIGTERM/SIGINT) the child
processes are closed so they don't orphan.

## Failure modes (all non-fatal)

- **Server fails to spawn / connect** → logged (`mcp-manager`) and skipped; it is
  retried no more than once per 30 s, so a broken server never blocks or hammers a
  chat turn. The rest of the turn proceeds normally.
- **Server connects but tool discovery fails** (e.g. a protocol/version mismatch
  between the server and the bundled `@modelcontextprotocol/sdk`) → that server's
  tools are skipped for the turn and logged (`chat`); the turn still completes.
- **Read-only (unarmed proactive) runs** withhold MCP tools entirely — the same
  T-13 rule that withholds the value-moving vault tools — so an unattended
  schedule can't reach external tools.

### SDK / server version note

Verified 2026-05-28: connect + pool + close work against
`@modelcontextprotocol/server-filesystem@2025.8.21` with the bundled
`@modelcontextprotocol/sdk@1.29.0`. That server version's `listTools` response did
**not** validate against SDK 1.29.0's strict parser, so discovery was skipped (the
turn still completed — see the failure mode above). If you need this server's
tools, pin a server release compatible with SDK 1.29.0 or bump the SDK. The
connect/discover/invoke/gate/ledger path itself is covered by the hermetic
integration tests (`mcp-chat.test.ts`, `mcp-tools.test.ts`) using an in-memory
transport against the official SDK server.
