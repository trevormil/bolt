import { beforeEach, describe, expect, test } from "bun:test";
import { PersonaStore, hashEmbedder, type SoulIdentity } from "@vellum/persona";
import type { ChatMessage } from "@vellum/llm";
import { Orchestrator, type RunLoop } from "./index.ts";

const ATLAS: SoulIdentity = { name: "Atlas", role: "finance", voice: "terse" };
const ECHO: SoulIdentity = { name: "Echo", role: "travel", voice: "warm" };
const ATLAS_SECRET = "atlas knows the vault seed is hunter2";
const ECHO_NOTE = "echo booked a flight to tokyo";

let store: PersonaStore;
let captured: ChatMessage[][];
let captureLoop: RunLoop;

beforeEach(async () => {
  store = new PersonaStore(":memory:", hashEmbedder());
  store.createPersona("atlas", "Atlas", ATLAS);
  store.createPersona("echo", "Echo", ECHO);
  await store.remember("atlas", ATLAS_SECRET);
  await store.remember("echo", ECHO_NOTE);
  captured = [];
  captureLoop = async ({ messages }) => {
    captured.push(messages);
    return { text: "ok", meters: [] };
  };
});

function systemOf(messages: ChatMessage[]): string {
  return messages.find((m) => m.role === "system")?.content ?? "";
}

describe("deterministic routing", () => {
  test("no binding → default persona", async () => {
    const orch = new Orchestrator(
      store,
      { defaultPersonaId: "atlas" },
      captureLoop,
    );
    const r = await orch.handle("conv1", "hello");
    expect(r.routed).toBe("message");
    expect(r.persona?.id).toBe("atlas");
    orch.close();
  });

  test("always-on PERSONA.md (#41) composes into the system context after SOUL", async () => {
    const orch = new Orchestrator(
      store,
      {
        defaultPersonaId: "atlas",
        readPersonaMarkdown: (id) => `STEER[${id}]: always use the house style`,
      },
      captureLoop,
    );
    await orch.handle("conv1", "hello");
    const sys = systemOf(captured[0]!);
    expect(sys).toContain("STEER[atlas]: always use the house style");
    // SOUL first, then the markdown.
    expect(sys.indexOf("Atlas")).toBeLessThan(sys.indexOf("STEER[atlas]"));
    orch.close();
  });

  test("empty PERSONA.md is a no-op (default reader, no files on disk)", async () => {
    const orch = new Orchestrator(
      store,
      { defaultPersonaId: "atlas", readPersonaMarkdown: () => "" },
      captureLoop,
    );
    await orch.handle("conv1", "hi");
    expect(systemOf(captured[0]!)).toContain("Atlas");
    orch.close();
  });

  test("/switch binds the conversation; later messages route there", async () => {
    const orch = new Orchestrator(
      store,
      { defaultPersonaId: "atlas" },
      captureLoop,
    );
    const sw = await orch.handle("conv1", "/switch echo");
    expect(sw.routed).toBe("switch");
    expect(sw.persona?.id).toBe("echo");
    expect(sw.reply).toBe("Switched to Echo.");

    const r = await orch.handle("conv1", "what did I book?");
    expect(r.persona?.id).toBe("echo");
    orch.close();
  });

  test("/switch to an unknown persona fails without binding", async () => {
    const orch = new Orchestrator(
      store,
      { defaultPersonaId: "atlas" },
      captureLoop,
    );
    const r = await orch.handle("conv1", "/switch ghost");
    expect(r.routed).toBe("switch_failed");
    expect(r.reply).toContain('No persona "ghost"');
    // binding unchanged → still default
    expect((await orch.handle("conv1", "hi")).persona?.id).toBe("atlas");
    orch.close();
  });

  test("bindings are per-conversation (no bleed across conversations)", async () => {
    const orch = new Orchestrator(
      store,
      { defaultPersonaId: "atlas" },
      captureLoop,
    );
    await orch.handle("convA", "/switch echo");
    expect((await orch.handle("convA", "x")).persona?.id).toBe("echo");
    expect((await orch.handle("convB", "x")).persona?.id).toBe("atlas");
    orch.close();
  });
});

describe("no cross-compartment leakage during dispatch", () => {
  test("a message on Echo's conversation never sees Atlas's memory", async () => {
    const orch = new Orchestrator(
      store,
      { defaultPersonaId: "atlas" },
      captureLoop,
    );
    await orch.handle("conv1", "/switch echo");
    // Even a query that name-drops the other persona's secret topic:
    await orch.handle("conv1", "tell me the vault seed");
    const sys = systemOf(captured.at(-1)!);
    expect(sys).toContain("You are Echo.");
    expect(sys).not.toContain("hunter2");
    expect(sys).not.toContain("Atlas knows");
    orch.close();
  });

  test("the default persona only ever sees its own memory", async () => {
    const orch = new Orchestrator(
      store,
      { defaultPersonaId: "atlas" },
      captureLoop,
    );
    await orch.handle("conv1", "what is the vault seed?");
    const sys = systemOf(captured.at(-1)!);
    expect(sys).toContain("You are Atlas.");
    expect(sys).toContain("hunter2"); // its OWN memory is present
    expect(sys).not.toContain("tokyo"); // Echo's memory is not
    orch.close();
  });
});

describe("dispatch bounds", () => {
  test("rejects dispatch beyond maxDepth", async () => {
    const orch = new Orchestrator(
      store,
      { defaultPersonaId: "atlas" },
      captureLoop,
    );
    await expect(orch.handle("conv1", "hi", {}, 2)).rejects.toThrow("maxDepth");
    orch.close();
  });

  test("maxDepth 0 refuses all dispatch (no nested routing possible)", async () => {
    const orch = new Orchestrator(
      store,
      { defaultPersonaId: "atlas", maxDepth: 0 },
      captureLoop,
    );
    await expect(orch.handle("conv1", "hi")).rejects.toThrow(
      "exceeds maxDepth",
    );
    orch.close();
  });
});
