import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// #32 regression guard: the chain SDK (bitbadges + cosmjs, ~900 KB) must NOT be
// statically imported on the first-paint path. keplr.ts is in the eager graph
// (wallet-context imports its msg builders), so a top-level `from "bitbadges"`
// there would drag the whole SDK back into the entry chunk. It must stay a
// dynamic import() inside signAndBroadcast so rollup splits it into an async
// chunk loaded only when the human signs.
const keplr = readFileSync(join(import.meta.dir, "app", "keplr.ts"), "utf8");

describe("bundle code-splitting (#32)", () => {
  test("keplr.ts does not statically import the chain SDK", () => {
    // No top-level `import ... from "bitbadges"` (only a dynamic import()).
    const staticImport = /^\s*import\s[^;]*from\s+["']bitbadges["']/m;
    expect(staticImport.test(keplr)).toBe(false);
  });

  test("keplr.ts loads the SDK via dynamic import()", () => {
    expect(keplr).toContain('await import("bitbadges")');
  });
});
