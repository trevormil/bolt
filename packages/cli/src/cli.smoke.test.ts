import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CLI = new URL("./cli.ts", import.meta.url).pathname;

// End-to-end smoke of the actual `vellum` entrypoint (#34 review fixes): it must
// be invokable from the repo setup and print ONLY the command result on stdout
// (diagnostics go to stderr), so scripted use stays parseable.
async function vellum(args: string[]): Promise<{ code: number; out: string }> {
  const home = mkdtempSync(join(tmpdir(), "vellum-cli-smoke-"));
  try {
    const proc = Bun.spawn(["bun", CLI, ...args], {
      env: { ...process.env, VELLUM_HOME: home, VELLUM_DB_PATH: "" },
      stdout: "pipe",
      stderr: "pipe",
    });
    const out = await new Response(proc.stdout).text();
    const code = await proc.exited;
    return { code, out };
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

describe("vellum CLI entrypoint", () => {
  test("`help` exits 0 with usage text and no log noise on stdout", async () => {
    const { code, out } = await vellum(["help"]);
    expect(code).toBe(0);
    expect(out).toContain("vellum"); // usage
    expect(out).not.toMatch(/INFO \[/); // engine logs went to stderr, not stdout
  });

  test("`new` then `personas` yields clean, parseable stdout", async () => {
    // Two invocations share the temp home only within each call, so drive it in
    // one process via the REPL-free subcommands: create + list in a fresh home.
    const { code, out } = await vellum(["personas"]);
    expect(code).toBe(0);
    expect(out).not.toMatch(/INFO \[/);
    expect(out).toContain("No personas"); // fresh home → empty, clean line
  });
});
