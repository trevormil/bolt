import { describe, expect, test } from "bun:test";
import type { McpClient } from "@vellum/agent";
import { McpManager } from "./mcp-manager.ts";
import type { McpServerConfig } from "./mcp-setting.ts";

// A counterfeit client — the manager only ever calls close() on what the
// connector returns (listTools/callTool are exercised by mcpTools, tested
// separately). Casting keeps the lifecycle tests free of real subprocesses.
function fakeClient(onClose: () => void): McpClient {
  return { close: async () => onClose() } as unknown as McpClient;
}

const cfg = (name: string): McpServerConfig => ({ name, command: "noop" });

describe("McpManager lifecycle (#46)", () => {
  test("connects each server once and reuses the pooled connection", async () => {
    let connects = 0;
    const m = new McpManager(async () => fakeClient(() => {}));
    const counting = new McpManager(async () => {
      connects++;
      return fakeClient(() => {});
    });

    const first = await counting.ensure([cfg("a"), cfg("b")]);
    const second = await counting.ensure([cfg("a"), cfg("b")]);
    expect(first.map((x) => x.name)).toEqual(["a", "b"]);
    expect(second.map((x) => x.name)).toEqual(["a", "b"]);
    // Two distinct servers connected once each; the second ensure reuses them.
    expect(connects).toBe(2);
    expect(counting.connected().sort()).toEqual(["a", "b"]);
    void m;
  });

  test("a server that fails to connect is skipped (never fatal) and not retried within the cooldown", async () => {
    let attempts = 0;
    const m = new McpManager(async () => {
      attempts++;
      throw new Error("spawn failed");
    });

    const out1 = await m.ensure([cfg("broken")]);
    const out2 = await m.ensure([cfg("broken")]);
    expect(out1).toEqual([]); // skipped, not thrown
    expect(out2).toEqual([]);
    expect(m.connected()).toEqual([]);
    // The second ensure is within the retry cooldown, so it does NOT re-attempt
    // — a chat turn must never hammer (or block on) a broken server.
    expect(attempts).toBe(1);
  });

  test("a working server alongside a broken one still connects", async () => {
    const m = new McpManager(async (c) => {
      if (c.name === "broken") throw new Error("nope");
      return fakeClient(() => {});
    });
    const out = await m.ensure([cfg("ok"), cfg("broken")]);
    expect(out.map((x) => x.name)).toEqual(["ok"]);
  });

  test("closeAll closes every connection and clears the pool (next ensure reconnects)", async () => {
    let closed = 0;
    let connects = 0;
    const m = new McpManager(async () => {
      connects++;
      return fakeClient(() => closed++);
    });
    await m.ensure([cfg("a")]);
    await m.closeAll();
    expect(closed).toBe(1);
    expect(m.connected()).toEqual([]);
    // Pool cleared → a fresh ensure reconnects rather than reusing.
    await m.ensure([cfg("a")]);
    expect(connects).toBe(2);
  });

  test("a same-name config change closes the stale client and reconnects (#46 review)", async () => {
    let connects = 0;
    let closed = 0;
    const m = new McpManager(async () => {
      connects++;
      return fakeClient(() => closed++);
    });
    await m.ensure([{ name: "a", command: "old" }]);
    // Same name, changed command/args → must drop the stale client + reconnect.
    await m.ensure([{ name: "a", command: "new", args: ["--flag"] }]);
    expect(connects).toBe(2);
    expect(closed).toBe(1);
    // Unchanged config now reuses (no further connect).
    await m.ensure([{ name: "a", command: "new", args: ["--flag"] }]);
    expect(connects).toBe(2);
  });

  test("a connect that never resolves is bounded by a timeout and skipped (!50)", async () => {
    // Connector hangs forever; a short connect timeout must surface as a failure
    // so warmup/chat never block on it.
    const m = new McpManager(() => new Promise<McpClient>(() => {}), {
      connectTimeoutMs: 20,
    });
    const out = await m.ensure([{ name: "hang", command: "noop" }]);
    expect(out).toEqual([]);
    expect(m.connected()).toEqual([]);
  });
});
