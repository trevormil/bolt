import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { listPersonaDocs, readPersonaMarkdown } from "./markdown.ts";

// Drive the data dir to a temp VELLUM_HOME so we read/write real files in isolation.
let home: string;
const savedHome = process.env.VELLUM_HOME;
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "vellum-md-"));
  process.env.VELLUM_HOME = home;
});
afterEach(() => {
  if (savedHome === undefined) delete process.env.VELLUM_HOME;
  else process.env.VELLUM_HOME = savedHome;
  rmSync(home, { recursive: true, force: true });
});

function writePersonaMd(personaId: string, body: string) {
  const dir = join(home, "personas", personaId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "PERSONA.md"), body);
}

describe("readPersonaMarkdown (#41)", () => {
  test("returns '' when nothing exists", () => {
    expect(readPersonaMarkdown("atlas")).toBe("");
  });

  test("reads the global PERSONA.md, applied to every persona", () => {
    writeFileSync(join(home, "PERSONA.md"), "House style: plain English.");
    expect(readPersonaMarkdown("atlas")).toBe("House style: plain English.");
    expect(readPersonaMarkdown("echo")).toBe("House style: plain English.");
  });

  test("does NOT read a per-persona file — that's the DB soul.instructions now (#93)", () => {
    // The per-persona PERSONA.md file is no longer injected here; the single
    // per-persona source is the DB instructions (rendered by renderSoul). With no
    // global file, a per-persona file alone yields nothing.
    writePersonaMd("atlas", "Be terse.");
    expect(readPersonaMarkdown("atlas")).toBe("");
  });

  test("reads fresh each call (global on-disk edits take effect)", () => {
    writeFileSync(join(home, "PERSONA.md"), "v1");
    expect(readPersonaMarkdown("atlas")).toBe("v1");
    writeFileSync(join(home, "PERSONA.md"), "v2");
    expect(readPersonaMarkdown("atlas")).toBe("v2");
  });
});

describe("listPersonaDocs (#41)", () => {
  test("lists other .md docs but not PERSONA.md", () => {
    const dir = join(home, "personas", "atlas");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "PERSONA.md"), "x");
    writeFileSync(join(dir, "recipes.md"), "x");
    writeFileSync(join(dir, "travel.md"), "x");
    writeFileSync(join(dir, "notes.txt"), "x"); // non-md ignored
    expect(listPersonaDocs("atlas")).toEqual(["recipes.md", "travel.md"]);
  });

  test("empty when the persona dir doesn't exist", () => {
    expect(listPersonaDocs("ghost")).toEqual([]);
  });
});
