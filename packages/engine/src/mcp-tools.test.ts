import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { generateWallet } from "@vellum/chain";
import { McpClient, runAgent } from "@vellum/agent";
import type { ToolsResult } from "@vellum/llm";
import { createEngine, mcpTools } from "./index.ts";

// A REAL MCP server (official SDK) exposing one tool, linked to our client over
// the in-memory transport — the same protocol a stdio server speaks, without a
// subprocess. Proves #33 end to end: connect → discover → agent invokes through
// the loop → metered + on the ledger.
async function connectedClient() {
  const server = new McpServer({ name: "test-mcp", version: "0.0.0" });
  // Loose cast for registerTool: the SDK bundles its own zod, so our z.number()
  // is a nominal type mismatch (structurally identical at runtime). Casting the
  // call sidesteps overload resolution against the SDK's zod instance.
  (
    server.registerTool as unknown as (
      n: string,
      c: unknown,
      cb: unknown,
    ) => unknown
  )(
    "add",
    {
      description: "Add two numbers",
      inputSchema: { a: z.number(), b: z.number() },
    },
    async ({ a, b }: { a: number; b: number }) => ({
      content: [{ type: "text" as const, text: String(a + b) }],
    }),
  );
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new McpClient();
  await client.connect(clientTransport);
  return client;
}

async function eng() {
  const m = (await generateWallet()).mnemonic;
  return createEngine({
    dbPath: ":memory:",
    embedder: null,
    mnemonic: m,
    runLoop: async () => ({ text: "", meters: [] }),
  });
}

describe("MCP end-to-end (#33)", () => {
  test("a real MCP server's tool is discovered + callable through the agent loop, gated + ledgered", async () => {
    const e = await eng();
    e.store.createPersona("p", "Pat", {
      name: "Pat",
      role: "tester",
      voice: "plain",
    });
    e.capabilities.grant({
      personaId: "p",
      capability: "mcp",
      scope: null,
      mode: "allow",
    });

    const client = await connectedClient();
    const { tools, invoke } = await mcpTools(e, "p", client);
    expect(tools.map((t) => t.name)).toContain("add");

    // Drive the agent loop: step 1 the "model" requests add(2,3); step 2 answers.
    let step = 0;
    const fakeChat = async (): Promise<ToolsResult> => {
      step++;
      const meter = {
        model: "test",
        tier: "cheap" as const,
        promptTokens: 1,
        completionTokens: 1,
        totalTokens: 2,
        costUsd: 0.0001,
        ms: 1,
      };
      if (step === 1)
        return {
          text: "",
          toolCalls: [
            {
              id: "c1",
              name: "add",
              arguments: JSON.stringify({ a: 2, b: 3 }),
            },
          ],
          assistantMessage: { role: "assistant", content: "" },
          meter,
        };
      return {
        text: "The answer is 5.",
        toolCalls: [],
        assistantMessage: { role: "assistant", content: "The answer is 5." },
        meter,
      };
    };

    const run = await runAgent({
      messages: [{ role: "user", content: "add 2 and 3" }],
      tools,
      invoke,
      chat: fakeChat,
    });

    expect(run.text).toContain("5");
    expect(run.toolCalls.map((c) => c.name)).toContain("add");
    // Metered: LLM round-trips recorded.
    expect(run.meters.length).toBeGreaterThan(0);
    // Proof-of-action: the MCP call is on the ledger.
    const led = e.ledger.list({ personaId: "p" });
    expect(
      led.some((x) => x.kind === "tool_call" && x.summary === "mcp:add"),
    ).toBe(true);
    // Observability timeline captured it too.
    expect(
      e.events.recent("p").some((x) => x.kind === "tool_call" && x.ok),
    ).toBe(true);
    await client.close();
  });

  test("without the 'mcp' grant the agent's MCP call is denied (no server hit)", async () => {
    const e = await eng();
    e.store.createPersona("p", "Pat", {
      name: "Pat",
      role: "tester",
      voice: "plain",
    });
    const client = await connectedClient();
    const { invoke } = await mcpTools(e, "p", client);
    const out = await invoke("add", { a: 2, b: 3 });
    expect(out).toContain("Denied");
    await client.close();
  });

  test("per-server capability scope (#46): a grant scoped to the server name allows it; a grant for a different server does not", async () => {
    const e = await eng();
    e.store.createPersona("p", "Pat", {
      name: "Pat",
      role: "tester",
      voice: "plain",
    });
    // Grant "mcp" scoped to a DIFFERENT server — must not cover "calc".
    e.capabilities.grant({
      personaId: "p",
      capability: "mcp",
      scope: "other",
      mode: "allow",
    });
    const client = await connectedClient();
    const { invoke } = await mcpTools(e, "p", client, "calc");
    expect(await invoke("add", { a: 1, b: 1 })).toContain("Denied");

    // Now grant the matching server scope — the same tool is allowed.
    e.capabilities.grant({
      personaId: "p",
      capability: "mcp",
      scope: "calc",
      mode: "allow",
    });
    expect(await invoke("add", { a: 1, b: 1 })).toBe("2");
    await client.close();
  });

  test("MCP tools are namespaced per server so two servers can't shadow each other (#46 review)", async () => {
    const e = await eng();
    e.store.createPersona("p", "Pat", {
      name: "Pat",
      role: "tester",
      voice: "plain",
    });
    e.capabilities.grant({
      personaId: "p",
      capability: "mcp",
      scope: null,
      mode: "allow",
    });
    const c1 = await connectedClient();
    const c2 = await connectedClient();
    const a = await mcpTools(e, "p", c1, "alpha");
    const b = await mcpTools(e, "p", c2, "beta");
    // Same underlying tool ("add") → distinct, namespaced runtime names.
    expect(a.tools.map((t) => t.name)).toContain("mcp_alpha_add");
    expect(b.tools.map((t) => t.name)).toContain("mcp_beta_add");
    expect(a.tools[0]!.name).not.toBe(b.tools[0]!.name);
    // The namespaced name routes to the server's real tool.
    expect(await a.invoke("mcp_alpha_add", { a: 2, b: 3 })).toBe("5");
    await c1.close();
    await c2.close();
  });

  test("sanitizes punctuated tool names + skips runtime-name collisions (!47/!50)", async () => {
    const e = await eng();
    e.store.createPersona("p", "Pat", {
      name: "Pat",
      role: "tester",
      voice: "plain",
    });
    e.capabilities.grant({
      personaId: "p",
      capability: "mcp",
      scope: null,
      mode: "allow",
    });
    // "a.b" and "a_b" both sanitize to the same runtime name → one is dropped.
    let called = "";
    const client = {
      listTools: async () => [
        { name: "do it!", description: "", parameters: {} },
        { name: "a.b", description: "", parameters: {} },
        { name: "a_b", description: "", parameters: {} },
      ],
      callTool: async (n: string) => {
        called = n;
        return "ok";
      },
      close: async () => {},
    } as unknown as McpClient;
    const { tools, invoke } = await mcpTools(e, "p", client, "calc");
    const names = tools.map((t) => t.name);
    expect(names.every((n) => /^[A-Za-z0-9_-]+$/.test(n))).toBe(true); // provider-safe
    expect(names).toContain("mcp_calc_do_it_");
    expect(names.filter((n) => n === "mcp_calc_a_b")).toHaveLength(1); // collision skipped
    // Routes back to the ORIGINAL tool name on the wire.
    await invoke("mcp_calc_do_it_", {});
    expect(called).toBe("do it!");
  });

  test("discovery timeout: a server that never lists tools is bounded (!50)", async () => {
    const e = await eng();
    e.store.createPersona("p", "Pat", {
      name: "Pat",
      role: "tester",
      voice: "plain",
    });
    const client = {
      listTools: () => new Promise(() => {}),
      callTool: async () => "",
      close: async () => {},
    } as unknown as McpClient;
    await expect(
      mcpTools(e, "p", client, "calc", { discoveryTimeoutMs: 20 }),
    ).rejects.toThrow(/timed out/);
  });

  test("call timeout: a tool that never returns yields a tool error, not a hang (!50)", async () => {
    const e = await eng();
    e.store.createPersona("p", "Pat", {
      name: "Pat",
      role: "tester",
      voice: "plain",
    });
    e.capabilities.grant({
      personaId: "p",
      capability: "mcp",
      scope: null,
      mode: "allow",
    });
    const client = {
      listTools: async () => [
        { name: "hang", description: "", parameters: {} },
      ],
      callTool: () => new Promise(() => {}),
      close: async () => {},
    } as unknown as McpClient;
    const { invoke } = await mcpTools(e, "p", client, "calc", {
      callTimeoutMs: 20,
    });
    expect(await invoke("mcp_calc_hang", {})).toContain("tool error");
  });
});
