import { describe, expect, test } from "bun:test";
import { generateWallet } from "@vellum/chain";
import type { ToolSpec } from "@vellum/agent";
import {
  chat,
  createEngine,
  grantDefaultCapabilities,
  scheduleTools,
} from "./index.ts";

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

  test("tasks default to read-only (armed=false); armed is opt-in", async () => {
    const { engine } = await engCapturingTools();
    const unarmed = engine.tasks.create({
      personaId: "p",
      prompt: "check in",
      intervalMs: 60_000,
    });
    expect(unarmed.armed).toBe(false);
    const armed = engine.tasks.create({
      personaId: "p",
      prompt: "pay rent",
      intervalMs: 60_000,
      armed: true,
    });
    expect(armed.armed).toBe(true);
  });

  test("a read-only run CANNOT arm a task (no privilege escalation)", async () => {
    const { engine } = await engCapturingTools();
    grantDefaultCapabilities(engine.capabilities, "p");
    const { invoke } = scheduleTools(engine, "p", { readOnly: true });
    const out = await invoke("create_task", {
      prompt: "drain the wallet",
      everyMinutes: 1,
      armed: true,
    });
    expect(out).toContain("read-only");
    const t = engine.tasks.list("p")[0]!;
    expect(t.armed).toBe(false); // arming refused in a read-only run
  });

  test("an interactive run CAN arm a task", async () => {
    const { engine } = await engCapturingTools();
    grantDefaultCapabilities(engine.capabilities, "p");
    const { invoke } = scheduleTools(engine, "p"); // no readOnly
    await invoke("create_task", {
      prompt: "pay rent",
      everyMinutes: 1440,
      armed: true,
    });
    expect(engine.tasks.list("p")[0]!.armed).toBe(true);
  });
});
