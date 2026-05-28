import { afterEach, describe, expect, test } from "bun:test";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import {
  mkdtempSync,
  writeFileSync,
  existsSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { dataDir, dataPath, migrateLegacyDb } from "./paths.ts";

const saved = {
  VELLUM_HOME: process.env.VELLUM_HOME,
  XDG_DATA_HOME: process.env.XDG_DATA_HOME,
};
afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("dataDir resolution precedence", () => {
  test("VELLUM_HOME wins", () => {
    process.env.VELLUM_HOME = "/tmp/vh";
    process.env.XDG_DATA_HOME = "/tmp/xdg";
    expect(dataDir()).toBe("/tmp/vh");
  });
  test("XDG_DATA_HOME/vellum when no VELLUM_HOME", () => {
    delete process.env.VELLUM_HOME;
    process.env.XDG_DATA_HOME = "/tmp/xdg";
    expect(dataDir()).toBe("/tmp/xdg/vellum");
  });
  test("falls back to ~/.vellum", () => {
    delete process.env.VELLUM_HOME;
    delete process.env.XDG_DATA_HOME;
    expect(dataDir()).toBe(join(homedir(), ".vellum"));
  });
  test("dataPath joins under the data dir", () => {
    process.env.VELLUM_HOME = "/tmp/vh";
    expect(dataPath("vellum.db")).toBe("/tmp/vh/vellum.db");
    expect(dataPath("personas", "atlas", "PERSONA.md")).toBe(
      "/tmp/vh/personas/atlas/PERSONA.md",
    );
  });
});

describe("migrateLegacyDb", () => {
  test("copies a legacy db (+ sidecars) into the target when target is missing", () => {
    const dir = mkdtempSync(join(tmpdir(), "vellum-mig-"));
    try {
      const legacy = join(dir, "legacy.db");
      writeFileSync(legacy, "DBDATA");
      writeFileSync(legacy + "-wal", "WAL");
      const target = join(dir, "home", "vellum.db");
      expect(migrateLegacyDb(target, legacy)).toBe(true);
      expect(readFileSync(target, "utf8")).toBe("DBDATA");
      expect(existsSync(target + "-wal")).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  test("no-op when the target already exists", () => {
    const dir = mkdtempSync(join(tmpdir(), "vellum-mig-"));
    try {
      const legacy = join(dir, "legacy.db");
      const target = join(dir, "vellum.db");
      writeFileSync(legacy, "OLD");
      writeFileSync(target, "CURRENT");
      expect(migrateLegacyDb(target, legacy)).toBe(false);
      expect(readFileSync(target, "utf8")).toBe("CURRENT"); // untouched
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  test("no-op when no legacy db exists", () => {
    const dir = mkdtempSync(join(tmpdir(), "vellum-mig-"));
    try {
      expect(
        migrateLegacyDb(join(dir, "vellum.db"), join(dir, "nope.db")),
      ).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
