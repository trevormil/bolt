import { describe, expect, test } from "bun:test";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { McpClient, withTimeout } from "./mcp.ts";

describe("withTimeout", () => {
  test("resolves a fast promise and rejects a slow one", async () => {
    expect(await withTimeout(Promise.resolve(7), 1000, "fast")).toBe(7);
    await expect(
      withTimeout(new Promise(() => {}), 10, "slow"),
    ).rejects.toThrow(/timed out/);
  });
});

describe("McpClient.connect — bounded + leak-safe (!47 review)", () => {
  test("a connect that hangs times out AND closes the transport (no child leak)", async () => {
    let closed = false;
    // A transport whose start() never resolves → the SDK handshake hangs.
    const transport = {
      start: () => new Promise<void>(() => {}),
      send: async () => {},
      close: async () => {
        closed = true;
      },
    } as unknown as Transport;

    const client = new McpClient();
    await expect(client.connect(transport, { timeoutMs: 20 })).rejects.toThrow(
      /timed out/,
    );
    // The transport (and any spawned child) is closed on the timeout.
    expect(closed).toBe(true);
  });
});
