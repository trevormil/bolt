import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// The PWA assets ship from packages/web/public — Vite copies that directory to
// dist/ on build, so the running server serves /manifest.webmanifest, /sw.js
// and /icon.svg verbatim. Treat their absence + malformed manifest as a build
// failure (#38).
const PUBLIC = join(import.meta.dir, "..", "public");

describe("PWA assets (#38)", () => {
  test("manifest.webmanifest is present + parseable + declares the required PWA fields", () => {
    const path = join(PUBLIC, "manifest.webmanifest");
    expect(existsSync(path)).toBe(true);
    const m = JSON.parse(readFileSync(path, "utf8"));
    expect(typeof m.name).toBe("string");
    expect(typeof m.start_url).toBe("string");
    expect(m.display).toBe("standalone");
    expect(Array.isArray(m.icons)).toBe(true);
    expect(m.icons.length).toBeGreaterThan(0);
  });

  test("sw.js + icon.svg are present", () => {
    expect(existsSync(join(PUBLIC, "sw.js"))).toBe(true);
    expect(existsSync(join(PUBLIC, "icon.svg"))).toBe(true);
  });

  test("index.html links the manifest + theme color", () => {
    const html = readFileSync(
      join(import.meta.dir, "..", "index.html"),
      "utf8",
    );
    expect(html).toContain('rel="manifest"');
    expect(html).toContain('href="/manifest.webmanifest"');
    expect(html).toContain('name="theme-color"');
  });
});
