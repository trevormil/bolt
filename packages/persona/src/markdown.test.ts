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

  test("reads the per-persona PERSONA.md", () => {
    writePersonaMd("atlas", "Be terse.");
    expect(readPersonaMarkdown("atlas")).toBe("Be terse.");
  });

  test("composes global then per-persona, in that order", () => {
    writeFileSync(join(home, "PERSONA.md"), "House style: plain English.");
    writePersonaMd("atlas", "Be terse.");
    const md = readPersonaMarkdown("atlas");
    expect(md).toBe("House style: plain English.\n\nBe terse.");
    expect(md.indexOf("House style")).toBeLessThan(md.indexOf("Be terse"));
  });

  test("global-only applies to a persona with no own file", () => {
    writeFileSync(join(home, "PERSONA.md"), "Global only.");
    expect(readPersonaMarkdown("echo")).toBe("Global only.");
  });

  test("reads fresh each call (on-disk edits take effect)", () => {
    writePersonaMd("atlas", "v1");
    expect(readPersonaMarkdown("atlas")).toBe("v1");
    writePersonaMd("atlas", "v2");
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
