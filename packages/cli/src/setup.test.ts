import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createEngine, type Engine } from "@vellum/engine";
import { generateWallet } from "@vellum/chain";
import { runSetup } from "./setup.ts";

// Isolate the data dir to a temp home so the test never touches ~/.vellum.
let prevHome: string | undefined;
beforeEach(() => {
  prevHome = process.env.VELLUM_HOME;
  process.env.VELLUM_HOME = mkdtempSync(join(tmpdir(), "vellum-home-"));
});
afterEach(() => {
  if (prevHome === undefined) delete process.env.VELLUM_HOME;
  else process.env.VELLUM_HOME = prevHome;
});

describe("runSetup (#19 install wizard core)", () => {
  test("writes secrets to .env and creates the first persona with a wallet", async () => {
    const { mnemonic } = await generateWallet();
    const envPath = join(mkdtempSync(join(tmpdir(), "vellum-setup-")), ".env");
    let captured: Engine | undefined;

    const res = await runSetup(
      {
        openRouterKey: "sk-or-test",
        mnemonic,
        personaName: "Pat Assistant",
        apiToken: "tok-abc",
      },
      {
        envPath,
        createEngine: (opts) => {
          captured = createEngine({
            ...opts,
            dbPath: ":memory:",
            embedder: null,
          });
          return captured;
        },
      },
    );

    expect(res.personaId).toBe("pat-assistant");
    expect(res.address.startsWith("bb1")).toBe(true);
    expect(res.wroteKeys.sort()).toEqual([
      "AGENT_SIGNER_MNEMONIC",
      "OPENROUTER_API_KEY",
      "VELLUM_API_TOKEN",
    ]);

    // The persona + wallet are persisted in the engine.
    expect(captured!.store.getPersona("pat-assistant")).toBeTruthy();
    expect(captured!.wallets.addressFor("pat-assistant")).toBe(res.address);

    // Secrets landed in .env (mnemonic quoted because it has spaces).
    const env = readFileSync(envPath, "utf8");
    expect(env).toContain("OPENROUTER_API_KEY=sk-or-test");
    expect(env).toContain("VELLUM_API_TOKEN=tok-abc");
    expect(env).toContain(`AGENT_SIGNER_MNEMONIC="${mnemonic}"`);
  });

  test("omits optional secrets and is idempotent on re-run (persona reused)", async () => {
    const { mnemonic } = await generateWallet();
    const envPath = join(mkdtempSync(join(tmpdir(), "vellum-setup-")), ".env");
    const make = (opts: Parameters<typeof createEngine>[0]) =>
      createEngine({ ...opts, dbPath: ":memory:", embedder: null });

    const first = await runSetup(
      { mnemonic, personaName: "Solo" },
      { envPath, createEngine: make },
    );
    expect(first.wroteKeys).toEqual(["AGENT_SIGNER_MNEMONIC"]); // no key/token
    const env = readFileSync(envPath, "utf8");
    expect(env).not.toContain("OPENROUTER_API_KEY");

    const second = await runSetup(
      { mnemonic, personaName: "Solo" },
      { envPath, createEngine: make },
    );
    expect(second.personaId).toBe(first.personaId);
  });
});
