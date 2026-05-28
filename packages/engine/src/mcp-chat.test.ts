import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { generateWallet } from "@vellum/chain";
import { McpClient, type ToolInvoker, type ToolSpec } from "@vellum/agent";
import type { RunLoop } from "@vellum/orchestrator";
import { createEngine } from "./engine.ts";
import { chat } from "./chat.ts";
import { McpServers } from "./mcp-setting.ts";

// A real in-memory MCP server (no subprocess) exposing one `add` tool, wired to
// a client — the same shape the McpManager would return from a stdio connect.
async function connectedClient(): Promise<McpClient> {
  const server = new McpServer({ name: "calc-mcp", version: "0.0.0" });
  (
    server.registerTool as unknown as (
      n: string,
      c: unknown,
      cb: unknown,
    ) => unknown
  )(
    "add",
    { description: "Add", inputSchema: { a: z.number(), b: z.number() } },
    async ({ a, b }: { a: number; b: number }) => ({
      content: [{ type: "text" as const, text: String(a + b) }],
    }),
  );
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  await server.connect(serverT);
  const client = new McpClient();
  await client.connect(clientT);
  return client;
}

// Build an engine whose MCP connector hands back the in-memory client, and whose
// run loop simply captures the tool set + invoker chat() assembled.
async function engineCapturing() {
  let connects = 0;
  let captured: { tools: ToolSpec[]; invoke: ToolInvoker } | null = null;
  const runLoop: RunLoop = async ({ tools, invoke }) => {
    captured = { tools, invoke };
    return { text: "", meters: [] };
  };
  const mnemonic = (await generateWallet()).mnemonic;
  const engine = createEngine({
    dbPath: ":memory:",
    embedder: null,
    mnemonic,
    runLoop,
    mcpConnect: async () => {
      connects++;
      return connectedClient();
    },
  });
  engine.store.createPersona("p", "Pat", {
    name: "Pat",
    role: "tester",
    voice: "plain",
  });
  return { engine, get: () => captured, connects: () => connects };
}

describe("chat() ⨉ MCP wiring (#46)", () => {
  test("a configured server's tools are merged into chat()'s tool set, gated + reused across turns", async () => {
    const { engine, get, connects } = await engineCapturing();
    McpServers.setPersona(engine.settings, "p", [
      { name: "calc", command: "noop" },
    ]);
    engine.capabilities.grant({
      personaId: "p",
      capability: "mcp",
      scope: null,
      mode: "allow",
    });

    await chat(engine, { conversationId: "c1", personaId: "p", message: "hi" });
    const cap = get()!;
    expect(cap.tools.map((t) => t.name)).toContain("mcp_calc_add"); // namespaced (#46 review)
    // The assembled invoker routes by the unique namespaced name (#46 review).
    expect(await cap.invoke("mcp_calc_add", { a: 2, b: 3 })).toBe("5");

    // A second turn reuses the pooled connection — no re-spawn.
    await chat(engine, { conversationId: "c1", personaId: "p", message: "yo" });
    expect(connects()).toBe(1);
  });

  test("without the 'mcp' grant the merged tool denies (no server hit)", async () => {
    const { engine, get } = await engineCapturing();
    McpServers.setPersona(engine.settings, "p", [
      { name: "calc", command: "noop" },
    ]);
    await chat(engine, { conversationId: "c1", personaId: "p", message: "hi" });
    const cap = get()!;
    // The tool is offered, but invoking it without the grant is denied.
    expect(cap.tools.map((t) => t.name)).toContain("mcp_calc_add"); // namespaced (#46 review)
    expect(await cap.invoke("mcp_calc_add", { a: 1, b: 1 })).toContain(
      "Denied",
    );
  });

  test("a connected server whose tool discovery fails is skipped, not fatal to the turn", async () => {
    let captured: { tools: ToolSpec[]; invoke: ToolInvoker } | null = null;
    const runLoop: RunLoop = async ({ tools, invoke }) => {
      captured = { tools, invoke };
      return { text: "ok", meters: [] };
    };
    const mnemonic = (await generateWallet()).mnemonic;
    const engine = createEngine({
      dbPath: ":memory:",
      embedder: null,
      mnemonic,
      runLoop,
      // Connects fine, but listTools throws (protocol/version mismatch).
      mcpConnect: async () =>
        ({
          listTools: async () => {
            throw new Error("protocol mismatch");
          },
          close: async () => {},
        }) as unknown as McpClient,
    });
    engine.store.createPersona("p", "Pat", {
      name: "Pat",
      role: "tester",
      voice: "plain",
    });
    McpServers.setPersona(engine.settings, "p", [
      { name: "flaky", command: "noop" },
    ]);
    engine.capabilities.grant({
      personaId: "p",
      capability: "mcp",
      scope: null,
      mode: "allow",
    });
    const res = await chat(engine, {
      conversationId: "c1",
      personaId: "p",
      message: "hi",
    });
    expect(res.reply).toBe("ok"); // turn completed despite the bad server
    // The base tools are still assembled; the flaky server simply contributed
    // nothing (its listTools threw and was skipped).
    expect(captured!.tools.some((t) => t.name === "create_vault")).toBe(true);
  });

  test("read-only runs withhold MCP tools entirely (T-13 symmetry with vault tools)", async () => {
    const { engine, get, connects } = await engineCapturing();
    McpServers.setPersona(engine.settings, "p", [
      { name: "calc", command: "noop" },
    ]);
    engine.capabilities.grant({
      personaId: "p",
      capability: "mcp",
      scope: null,
      mode: "allow",
    });
    await chat(engine, {
      conversationId: "c1",
      personaId: "p",
      message: "hi",
      readOnly: true,
    });
    expect(get()!.tools.map((t) => t.name)).not.toContain("add");
    // Withheld means never even connected on a read-only turn.
    expect(connects()).toBe(0);
  });
});
