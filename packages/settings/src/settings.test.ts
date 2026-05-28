import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { defineSetting, SettingsStore } from "./index.ts";

describe("SettingsStore.resolve — persona → global → default", () => {
  test("falls back to the built-in default when nothing is set", () => {
    const s = new SettingsStore(":memory:");
    expect(s.resolve("p", "k", 42)).toEqual({ value: 42, source: "default" });
    s.close();
  });

  test("global applies to a persona that has no override", () => {
    const s = new SettingsStore(":memory:");
    s.setGlobal("k", 7);
    expect(s.resolve("p", "k", 42)).toEqual({ value: 7, source: "global" });
    s.close();
  });

  test("persona override wins over global", () => {
    const s = new SettingsStore(":memory:");
    s.setGlobal("k", 7);
    s.set("p", "k", 99);
    expect(s.resolve("p", "k", 42)).toEqual({ value: 99, source: "persona" });
    expect(s.resolve("other", "k", 42)).toEqual({ value: 7, source: "global" }); // unaffected
    s.close();
  });

  test("clear reverts a persona to inherit", () => {
    const s = new SettingsStore(":memory:");
    s.setGlobal("k", 7);
    s.set("p", "k", 99);
    s.clear("p", "k");
    expect(s.resolve("p", "k", 42)).toEqual({ value: 7, source: "global" });
    s.close();
  });

  test("stores structured JSON values", () => {
    const s = new SettingsStore(":memory:");
    s.set("p", "model", { cheap: "a", frontier: "b" });
    type M = { cheap: string; frontier: string } | null;
    expect(s.resolve<M>("p", "model", null)).toEqual({
      value: { cheap: "a", frontier: "b" },
      source: "persona",
    });
    s.close();
  });
});

describe("defineSetting — typed accessor", () => {
  const Limit = defineSetting("budget.daily", z.number().nonnegative(), 5);

  test("get resolves + validates with provenance", () => {
    const s = new SettingsStore(":memory:");
    expect(Limit.get(s, "p")).toEqual({ value: 5, source: "default" });
    Limit.setGlobal(s, 10);
    expect(Limit.get(s, "p")).toEqual({ value: 10, source: "global" });
    Limit.setPersona(s, "p", 25);
    expect(Limit.get(s, "p")).toEqual({ value: 25, source: "persona" });
    Limit.reset(s, "p");
    expect(Limit.get(s, "p").source).toBe("global");
    s.close();
  });

  test("rejects invalid values on write", () => {
    const s = new SettingsStore(":memory:");
    expect(() => Limit.setGlobal(s, -1)).toThrow();
    s.close();
  });

  test("falls back to default if a stored value is malformed (schema drift)", () => {
    const s = new SettingsStore(":memory:");
    s.set("p", "budget.daily", "not-a-number"); // bypass the typed setter
    expect(Limit.get(s, "p")).toEqual({ value: 5, source: "default" });
    s.close();
  });
});
