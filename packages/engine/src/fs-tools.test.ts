import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateWallet } from "@vellum/chain";
import type { Approver } from "@vellum/capabilities";
import { createEngine, filesystemTools, type Engine } from "./index.ts";

let mnemonic: string;
let root: string;
beforeEach(async () => {
  mnemonic = (await generateWallet()).mnemonic;
  root = mkdtempSync(join(tmpdir(), "vellum-fs-"));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

function eng(approve?: Approver): Engine {
  return createEngine({
    dbPath: ":memory:",
    embedder: null,
    mnemonic,
    runLoop: async () => ({ text: "", meters: [] }),
    approve,
  });
}

describe("filesystem tools (#35) — capability-gated", () => {
  test("read/write/list within a granted root", async () => {
    const e = eng();
    e.capabilities.grant({
      personaId: "p",
      capability: "fs.read",
      scope: root,
      mode: "allow",
    });
    e.capabilities.grant({
      personaId: "p",
      capability: "fs.write",
      scope: root,
      mode: "allow",
    });
    const { invoke } = filesystemTools(e, "p");

    const f = join(root, "note.txt");
    expect(await invoke("fs_write", { path: f, content: "hello" })).toContain(
      "Wrote",
    );
    expect(readFileSync(f, "utf8")).toBe("hello");
    expect(await invoke("fs_read", { path: f })).toBe("hello");
    expect(await invoke("fs_list", { path: root })).toContain("note.txt");
  });

  test("denies paths outside the granted root", async () => {
    const e = eng();
    e.capabilities.grant({
      personaId: "p",
      capability: "fs.read",
      scope: root,
      mode: "allow",
    });
    const { invoke } = filesystemTools(e, "p");
    expect(await invoke("fs_read", { path: "/etc/hosts" })).toContain("Denied");
    // a ../ escape resolves out of the root → still denied
    expect(
      await invoke("fs_read", { path: join(root, "../escape") }),
    ).toContain("Denied");
  });

  test("no grant → write denied, nothing written (fail-closed)", async () => {
    const e = eng();
    const { invoke } = filesystemTools(e, "p");
    const f = join(root, "x.txt");
    expect(await invoke("fs_write", { path: f, content: "x" })).toContain(
      "Denied",
    );
    expect(existsSync(f)).toBe(false);
  });

  test("'ask' write honors the approver", async () => {
    const yes = eng(() => true);
    yes.capabilities.grant({
      personaId: "p",
      capability: "fs.write",
      scope: root,
      mode: "ask",
    });
    const f1 = join(root, "ok.txt");
    expect(
      await filesystemTools(yes, "p").invoke("fs_write", {
        path: f1,
        content: "a",
      }),
    ).toContain("Wrote");
    expect(existsSync(f1)).toBe(true);

    const no = eng(() => false);
    no.capabilities.grant({
      personaId: "p",
      capability: "fs.write",
      scope: root,
      mode: "ask",
    });
    const f2 = join(root, "no.txt");
    expect(
      await filesystemTools(no, "p").invoke("fs_write", {
        path: f2,
        content: "a",
      }),
    ).toContain("Denied");
    expect(existsSync(f2)).toBe(false);
  });
});
