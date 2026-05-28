import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  StdioClientTransport,
  getDefaultEnvironment,
} from "@modelcontextprotocol/sdk/client/stdio.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { createLogger } from "@vellum/shared";
import type { ToolSpec } from "./tools.ts";

const log = createLogger("mcp");

/**
 * Race a promise against a deadline (#46 review): an external MCP server that
 * stalls during connect, discovery, or a tool call must never hang the daemon or
 * a chat turn. Callers wrap each MCP await so a timeout surfaces as a rejection
 * they can degrade on (skip the server / return a tool error). The timer is
 * unref'd so it can't keep the process alive on its own.
 */
export function withTimeout<T>(
  p: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${ms}ms`)),
      ms,
    );
    timer.unref?.();
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

// Thin wrapper over the MCP SDK client: connect to a server (stdio in prod, any
// Transport in tests), discover its tools as ToolSpecs, and invoke them with the
// result flattened to a string the agent loop can feed back to the model.
export class McpClient {
  private client: Client;

  constructor(name = "vellum-agent", version = "0.0.0") {
    this.client = new Client({ name, version }, { capabilities: {} });
  }

  /** Spawn an MCP server as a child process and connect over stdio. A caller
   *  `env` is merged OVER the SDK's safe default environment (PATH, HOME, …) so
   *  it augments rather than replaces it — otherwise the child loses PATH. */
  async connectStdio(
    command: string,
    args: string[] = [],
    env?: Record<string, string>,
  ): Promise<void> {
    const merged = env ? { ...getDefaultEnvironment(), ...env } : undefined;
    await this.connect(
      new StdioClientTransport({ command, args, env: merged }),
    );
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
