import { describe, expect, test } from "bun:test";
import { generateWallet } from "@vellum/chain";
import { Model, createEngine } from "./index.ts";

async function eng() {
  const m = (await generateWallet()).mnemonic;
  return createEngine({
    dbPath: ":memory:",
    embedder: null,
    mnemonic: m,
    runLoop: async () => ({ text: "", meters: [] }),
  });
}

describe("Model setting (#43) — per-persona OpenRouter model override", () => {
  test("defaults to null (use tier router)", async () => {
    const e = await eng();
    expect(Model.get(e.settings, "p")).toEqual({
      value: null,
      source: "default",
    });
  });

  test("set persona override → resolve returns it; reset → back to default", async () => {
    const e = await eng();
    Model.setPersona(e.settings, "p", "anthropic/claude-3.5-sonnet");
    expect(Model.get(e.settings, "p")).toEqual({
      value: "anthropic/claude-3.5-sonnet",
      source: "persona",
    });
    Model.reset(e.settings, "p");
    expect(Model.get(e.settings, "p").value).toBeNull();
  });

  test("global default applies to personas without an override", async () => {
    const e = await eng();
    Model.setGlobal(e.settings, "openai/gpt-4o-mini");
    expect(Model.get(e.settings, "p")).toEqual({
      value: "openai/gpt-4o-mini",
      source: "global",
    });
    Model.setPersona(e.settings, "p", "anthropic/claude-3.5-sonnet");
    expect(Model.get(e.settings, "p").source).toBe("persona");
    expect(Model.get(e.settings, "other").source).toBe("global");
  });

  test("rejects empty-string model on set", async () => {
    const e = await eng();
    expect(() => Model.setPersona(e.settings, "p", "")).toThrow();
  });
});
