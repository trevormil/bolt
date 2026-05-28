import { describe, expect, test } from "bun:test";
import { generateWallet } from "@vellum/chain";
import type { ToolSpec } from "@vellum/agent";
import { chat, createEngine, grantDefaultCapabilities } from "./index.ts";

// Capture the tool set the agent loop was offered, so we can assert the
// value-moving vault tools are withheld in a read-only run (T-13).
async function engCapturingTools() {
  let offered: ToolSpec[] = [];
  const m = (await generateWallet()).mnemonic;
  const engine = createEngine({
    dbPath: ":memory:",
    embedder: null,
    mnemonic: m,
    runLoop: async ({ tools }) => {
      offered = tools;
      return { text: "done", meters: [] };
    },
  });
  return { engine, names: () => offered.map((t) => t.name) };
}

describe("read-only proactive runs (#24 / T-13)", () => {
  test("readOnly chat withholds the vault (value-moving) tools", async () => {
    const { engine, names } = await engCapturingTools();
    grantDefaultCapabilities(engine.capabilities, "p");
    engine.store.createPersona("p", "Pat", {
      name: "Pat",
      role: "t",
      voice: "v",
    });
    await engine.wallets.ensureWallet("p");

    await chat(engine, {
      conversationId: "c",
      personaId: "p",
      message: "status?",
      readOnly: true,
    });
    const ro = names();
    expect(ro).not.toContain("create_vault");
    expect(ro).not.toContain("withdraw_from_vault");

    await chat(engine, {
      conversationId: "c",
      personaId: "p",
      message: "status?",
    });
    const full = names();
    expect(full).toContain("create_vault");
    expect(full).toContain("withdraw_from_vault");
  });

  test("readOnly chat withholds fs_write and run_command; full run exposes them (#52)", async () => {
    const { engine, names } = await engCapturingTools();
    grantDefaultCapabilities(engine.capabilities, "p");
    engine.store.createPersona("p", "Pat", {
      name: "Pat",
      role: "t",
      voice: "v",
    });
    await engine.wallets.ensureWallet("p");

    await chat(engine, {
      conversationId: "c",
      personaId: "p",
      message: "look around",
      readOnly: true,
    });
    const ro = names();
    expect(ro).not.toContain("fs_write"); // mutating fs tool withheld
    expect(ro).not.toContain("run_command"); // command execution withheld
    expect(ro).toContain("fs_read"); // read-only inspection stays

    await chat(engine, {
      conversationId: "c",
      personaId: "p",
      message: "build it",
    });
    const full = names();
    expect(full).toContain("fs_write");
    expect(full).toContain("run_command");
  });
});
