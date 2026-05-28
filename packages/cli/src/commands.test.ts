import { beforeEach, describe, expect, test } from "bun:test";
import { generateWallet, type Coin } from "@vellum/chain";
import { createEngine, type Engine } from "@vellum/engine";
import { env } from "@vellum/shared";
import { runCommand } from "./commands.ts";

const FUNDED: Coin[] = [{ denom: env.VELLUM_DENOM, amount: "2500000" }]; // 2.50

let mnemonic: string;
beforeEach(async () => {
  mnemonic = (await generateWallet()).mnemonic;
});
function eng(): Engine {
  return createEngine({
    dbPath: ":memory:",
    embedder: null,
    mnemonic,
    runLoop: async () => ({ text: "hi from agent", meters: [] }),
    getBalances: async () => FUNDED,
    claimFaucet: async () => ({ txHash: "FAUCET1" }),
  });
}

describe("runCommand", () => {
  test("help / no args prints usage", async () => {
    expect(await runCommand(eng(), [])).toContain("vellum");
    expect(await runCommand(eng(), ["help"])).toContain("interactive chat");
  });

  test("personas: empty then lists after new", async () => {
    const e = eng();
    expect(await runCommand(e, ["personas"])).toContain("No personas");
    const created = await runCommand(e, ["new", "Atlas"]);
    // #25: `new` now prints the personality card (name + wallet), not a terse line.
    expect(created).toContain("Atlas");
    expect(created).toMatch(/bb1/);
    const list = await runCommand(e, ["personas"]);
    expect(list).toContain("atlas");
  });

  test("new rejects a duplicate + a missing name", async () => {
    const e = eng();
    await runCommand(e, ["new", "Atlas"]);
    await expect(runCommand(e, ["new", "Atlas"])).rejects.toThrow("exists");
    await expect(runCommand(e, ["new"])).rejects.toThrow("usage");
  });

  test("balance reads the persona's USDC", async () => {
    const e = eng();
    await runCommand(e, ["new", "Atlas"]);
    expect(await runCommand(e, ["balance", "atlas"])).toBe("2.50 USDC");
  });

  test("faucet claims devnet USDC", async () => {
    const e = eng();
    await runCommand(e, ["new", "Atlas"]);
    expect(await runCommand(e, ["faucet", "atlas"])).toContain("FAUCET1");
  });

  test("chat routes to the persona, replies, and writes the ledger", async () => {
    const e = eng();
    await runCommand(e, ["new", "Atlas"]);
    expect(await runCommand(e, ["ledger", "atlas"])).toContain("no entries");
    expect(await runCommand(e, ["chat", "atlas", "hello", "there"])).toBe(
      "hi from agent",
    );
    expect(await runCommand(e, ["ledger", "atlas"])).toContain("message");
  });

  test("unknown command + unknown persona are rejected", async () => {
    const e = eng();
    await expect(runCommand(e, ["bogus"])).rejects.toThrow("unknown command");
    await expect(runCommand(e, ["balance", "ghost"])).rejects.toThrow(
      "unknown persona",
    );
  });
});
