import { describe, expect, test } from "bun:test";
import { generateWallet } from "@vellum/chain";
import { chat, createEngine } from "./index.ts";

async function eng() {
  const m = (await generateWallet()).mnemonic;
  return createEngine({
    dbPath: ":memory:",
    embedder: null,
    mnemonic: m,
    // Stub the LLM round-trip so we exercise the chat → emit path without a network call.
    runLoop: async () => ({
      text: "ok",
      meters: [
        {
          model: "test/fake",
          tier: "cheap",
          promptTokens: 10,
          completionTokens: 5,
          totalTokens: 15,
          costUsd: 0.001,
          ms: 42,
        },
      ],
    }),
  });
}

describe("observability wiring (#42)", () => {
  test("chat() emits chat_in + chat_out with cost/tokens/latency", async () => {
    const e = await eng();
    e.store.createPersona("p", "Pat", {
      name: "Pat",
      role: "tester",
      voice: "plain",
    });
    const res = await chat(e, {
      conversationId: "c1",
      personaId: "p",
      message: "hello",
    });
    expect(res.budgetExceeded).toBe(false);

    const events = e.events.recent("p");
    const kinds = events.map((x) => x.kind);
    expect(kinds).toContain("chat_in");
    expect(kinds).toContain("chat_out");
    const out = events.find((x) => x.kind === "chat_out")!;
    expect(out.costUsd).toBeCloseTo(0.001);
    expect(out.tokens).toBe(15);
    expect(out.ok).toBe(true);
    expect(out.latencyMs).toBeGreaterThanOrEqual(0);
  });

  test("capability decisions land on the event timeline (allowed + blocked)", async () => {
    const e = await eng();
    e.store.createPersona("p", "Pat", {
      name: "Pat",
      role: "tester",
      voice: "plain",
    });

    // No grant → denied.
    await e.authorizer.authorize("p", {
      capability: "fs.read",
      target: "/etc",
      summary: "read /etc",
    });
    // Grant + allowed.
    e.capabilities.grant({
      personaId: "p",
      capability: "fs.write",
      scope: "/tmp",
      mode: "allow",
    });
    await e.authorizer.authorize("p", {
      capability: "fs.write",
      target: "/tmp/a",
      summary: "write /tmp/a",
    });

    const caps = e.events.recent("p").filter((x) => x.kind === "capability");
    expect(caps.length).toBe(2);
    const oks = caps.map((c) => c.ok);
    expect(oks).toContain(true);
    expect(oks).toContain(false);
  });
});
