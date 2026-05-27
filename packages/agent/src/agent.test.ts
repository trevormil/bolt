import { describe, expect, test } from "bun:test";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { ChatMessage, Meter, ToolsResult } from "@vellum/llm";
import { McpClient, runAgent, selectTools, type ToolSpec } from "./index.ts";

const METER: Meter = {
  model: "test",
  tier: "cheap",
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
  costUsd: 0,
  ms: 0,
};

const spec = (name: string, description: string): ToolSpec => ({
  name,
  description,
  parameters: { type: "object", properties: {} },
});

// A scripted chat: each entry is the model's response for that round-trip.
function scriptedChat(turns: ToolsResult[]) {
  let i = 0;
  const chat = async (): Promise<ToolsResult> =>
    turns[Math.min(i++, turns.length - 1)]!;
  return chat;
}

function answer(text: string): ToolsResult {
  return {
    text,
    toolCalls: [],
    assistantMessage: { role: "assistant", content: text },
    meter: METER,
  };
}
function callsTool(id: string, name: string, args: object): ToolsResult {
  const argStr = JSON.stringify(args);
  return {
    text: "",
    toolCalls: [{ id, name, arguments: argStr }],
    assistantMessage: {
      role: "assistant",
      content: "",
      tool_calls: [
        { id, type: "function", function: { name, arguments: argStr } },
      ],
    },
    meter: METER,
  };
}

// Spin up a real in-process MCP server (echo + boom tools) and a connected client.
async function connectedMcp(): Promise<McpClient> {
  const server = new Server(
    { name: "test-server", version: "0.0.0" },
    { capabilities: { tools: {} } },
  );
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "echo",
        description: "echo the msg back",
        inputSchema: {
          type: "object",
          properties: { msg: { type: "string" } },
          required: ["msg"],
        },
      },
      {
        name: "boom",
        description: "always fails",
        inputSchema: { type: "object", properties: {} },
      },
    ],
  }));
  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    if (req.params.name === "boom") {
      return { content: [{ type: "text", text: "kaboom" }], isError: true };
    }
    const msg = (req.params.arguments as { msg?: string } | undefined)?.msg;
    return { content: [{ type: "text", text: `echo:${msg}` }] };
  });

  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  await server.connect(serverT);
  const mcp = new McpClient();
  await mcp.connect(clientT);
  return mcp;
}

describe("selectTools", () => {
  const tools = [
    spec("wallet_balance", "check a crypto wallet balance"),
    spec("weather", "current weather forecast"),
    spec("web_search", "search the web"),
    spec("send_payment", "send a payment from a wallet"),
  ];

  test("returns all tools when under the cap", () => {
    expect(selectTools(tools, "anything", 8)).toHaveLength(4);
  });

  test("ranks relevant tools first and caps the count", () => {
    const got = selectTools(tools, "what is my wallet balance", 2);
    expect(got).toHaveLength(2);
    expect(got[0]!.name).toBe("wallet_balance");
    expect(got.map((t) => t.name)).toContain("send_payment");
    expect(got.map((t) => t.name)).not.toContain("weather");
  });

  test("no query terms falls back to the first N (stable order)", () => {
    const got = selectTools(tools, "the a of", 2);
    expect(got.map((t) => t.name)).toEqual(["wallet_balance", "weather"]);
  });
});

describe("runAgent", () => {
  test("calls a tool then returns the model's answer", async () => {
    const calls: string[] = [];
    const run = await runAgent({
      messages: [{ role: "user", content: "echo hi" }],
      tools: [spec("echo", "echo")],
      invoke: async (name, args) => {
        calls.push(name);
        return `echo:${(args as { msg: string }).msg}`;
      },
      chat: scriptedChat([
        callsTool("c1", "echo", { msg: "hi" }),
        answer("done"),
      ]),
    });
    expect(run.text).toBe("done");
    expect(run.steps).toBe(2);
    expect(run.stopReason).toBe("answered");
    expect(run.toolCalls).toEqual([{ name: "echo", args: { msg: "hi" } }]);
    expect(run.meters).toHaveLength(2);
    expect(calls).toEqual(["echo"]);
  });

  test("feeds tool errors back instead of throwing", async () => {
    const seen: ChatMessage[][] = [];
    const chat = async (msgs: ChatMessage[]): Promise<ToolsResult> => {
      seen.push([...msgs]);
      return seen.length === 1
        ? callsTool("c1", "boom", {})
        : answer("recovered");
    };
    const run = await runAgent({
      messages: [{ role: "user", content: "go" }],
      tools: [spec("boom", "fails")],
      invoke: async () => {
        throw new Error("nope");
      },
      chat,
    });
    expect(run.text).toBe("recovered");
    const toolMsg = seen[1]!.find((m) => m.role === "tool");
    expect(toolMsg?.content).toContain("tool error: nope");
  });

  test("terminates at maxSteps when the model never stops calling tools", async () => {
    const run = await runAgent({
      messages: [{ role: "user", content: "loop" }],
      tools: [spec("echo", "echo")],
      invoke: async () => "again",
      chat: scriptedChat([callsTool("c1", "echo", {})]), // always wants a tool
      maxSteps: 3,
    });
    expect(run.steps).toBe(3);
    expect(run.stopReason).toBe("max_steps");
    expect(run.meters).toHaveLength(3);
  });
});

describe("McpClient", () => {
  test("lists tools and invokes one over a real MCP transport", async () => {
    const mcp = await connectedMcp();
    const tools = await mcp.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(["boom", "echo"]);
    expect(await mcp.callTool("echo", { msg: "hi" })).toBe("echo:hi");
    expect(await mcp.callTool("boom", {})).toContain("tool error");
    await mcp.close();
  });

  test("agent loop drives a real MCP tool end to end", async () => {
    const mcp = await connectedMcp();
    const tools = await mcp.listTools();
    const run = await runAgent({
      messages: [{ role: "user", content: "echo hi" }],
      tools,
      invoke: (name, args) => mcp.callTool(name, args),
      chat: scriptedChat([
        callsTool("c1", "echo", { msg: "world" }),
        answer("told you: echo:world"),
      ]),
    });
    expect(run.text).toBe("told you: echo:world");
    expect(run.toolCalls[0]).toEqual({ name: "echo", args: { msg: "world" } });
    await mcp.close();
  });
});
