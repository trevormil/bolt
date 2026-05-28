import { CapabilityDeniedError } from "@vellum/capabilities";
import type { McpClient, ToolInvoker, ToolSpec } from "@vellum/agent";
import type { Engine } from "./engine.ts";

/**
 * Adapt a connected MCP server's tools (#33, #5) into the persona agent loop.
 * Each MCP tool call is:
 *   - gated on the per-persona "mcp" capability (#37) — default-deny; an agent
 *     can't reach external tools unless the human granted it;
 *   - recorded in the proof-of-action ledger as a `tool_call` (metered trail);
 *   - emitted on the observability timeline (#42) with latency + ok/err.
 *
 * The client is connected by the caller (stdio in prod via connectStdio, any
 * transport in tests). Returns {tools, invoke} ready to combineTools(...) into
 * chat()'s tool set alongside vault/filesystem/schedule tools.
 *
 * `serverName` (when supplied) is the capability scope (#37): the gate is keyed
 * on the SERVER, so a `scope:null` "mcp" grant allows any server while a
 * `scope:"<serverName>"` grant allows only that one. Absent a name (the bare
 * test path) the gate falls back to the tool name.
 */
export async function mcpTools(
  engine: Engine,
  personaId: string,
  client: McpClient,
  serverName?: string,
): Promise<{ tools: ToolSpec[]; invoke: ToolInvoker }> {
  const tools = await client.listTools();
  const known = new Set(tools.map((t) => t.name));

  const invoke: ToolInvoker = async (name, args) => {
    if (!known.has(name)) return `unknown tool: ${name}`;
    try {
      await engine.authorizer.authorizeOrThrow(personaId, {
        capability: "mcp",
        target: serverName ?? name,
        summary: serverName ? `MCP ${serverName}/${name}` : `MCP tool ${name}`,
      });
    } catch (e) {
      if (e instanceof CapabilityDeniedError)
        return `Denied: ${e.action.summary}.`;
      throw e;
    }

    const t0 = Date.now();
    let ok = true;
    let out: string;
    try {
      out = await client.callTool(name, args);
    } catch (e) {
      ok = false;
      out = `tool error: ${e instanceof Error ? e.message : String(e)}`;
    }
    // Proof-of-action: the external call is on the ledger (metadata only).
    engine.ledger.record({
      personaId,
      kind: "tool_call",
      summary: `mcp:${name}`,
      authority: "agent",
      meta: { tool: name, source: "mcp", ok },
    });
    engine.events.emit({
      personaId,
      kind: "tool_call",
      summary: `mcp:${name}`,
      ok,
      latencyMs: Date.now() - t0,
      meta: { tool: name, source: "mcp" },
    });
    return out;
  };

  return { tools, invoke };
}
