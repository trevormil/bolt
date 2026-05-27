import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { createLogger } from "@vellum/shared";
import type { ToolSpec } from "./tools.ts";

const log = createLogger("mcp");

// Thin wrapper over the MCP SDK client: connect to a server (stdio in prod, any
// Transport in tests), discover its tools as ToolSpecs, and invoke them with the
// result flattened to a string the agent loop can feed back to the model.
export class McpClient {
  private client: Client;

  constructor(name = "vellum-agent", version = "0.0.0") {
    this.client = new Client({ name, version }, { capabilities: {} });
  }

  /** Spawn an MCP server as a child process and connect over stdio. */
  async connectStdio(command: string, args: string[] = []): Promise<void> {
    await this.connect(new StdioClientTransport({ command, args }));
  }

  /** Connect over any transport (stdio, in-memory for tests, …). */
  async connect(transport: Transport): Promise<void> {
    await this.client.connect(transport);
    log.info("connected");
  }

  /** List the server's tools as agent-loop ToolSpecs. */
  async listTools(): Promise<ToolSpec[]> {
    const res = await this.client.listTools();
    return res.tools.map((t) => ({
      name: t.name,
      description: t.description ?? "",
      parameters: (t.inputSchema as Record<string, unknown>) ?? {
        type: "object",
        properties: {},
      },
    }));
  }

  /** Call a tool; flatten its content blocks to a single string. */
  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    const res = await this.client.callTool({ name, arguments: args });
    const content = (res.content ?? []) as { type?: string; text?: string }[];
    const text = content
      .filter((c) => c.type === "text" && typeof c.text === "string")
      .map((c) => c.text)
      .join("\n");
    if (res.isError) return `tool error: ${text || "unknown error"}`;
    return text;
  }

  async close(): Promise<void> {
    await this.client.close();
  }
}
