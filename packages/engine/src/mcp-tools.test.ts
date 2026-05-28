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
});
