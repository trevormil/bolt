import { beforeAll, describe, expect, test } from "bun:test";
import { generateWallet, type Coin } from "@vellum/chain";
import { PersonaWallets } from "./index.ts";

let MNEMONIC: string;
beforeAll(async () => {
  MNEMONIC = (await generateWallet()).mnemonic; // pure crypto, no network
});

function fresh(getBalances?: (a: string) => Promise<readonly Coin[]>) {
  return new PersonaWallets({ mnemonic: MNEMONIC, getBalances });
}

describe("PersonaWallets", () => {
  test("derives a distinct bb1 wallet per persona at incrementing indices", async () => {
    const w = fresh();
    const a = await w.ensureWallet("atlas");
    const b = await w.ensureWallet("echo");
    expect(a.address.startsWith("bb1")).toBe(true);
    expect(b.address.startsWith("bb1")).toBe(true);
    expect(a.address).not.toBe(b.address);
    expect(a.hdIndex).toBe(0);
    expect(b.hdIndex).toBe(1);
    w.close();
  });

  test("is idempotent — same persona keeps its wallet", async () => {
    const w = fresh();
    const first = await w.ensureWallet("atlas");
    const again = await w.ensureWallet("atlas");
    expect(again).toEqual(first);
    expect(w.list()).toHaveLength(1);
    w.close();
  });

  test("walletFor/addressFor read persisted state; null when unknown", async () => {
    const w = fresh();
    await w.ensureWallet("atlas");
    expect(w.addressFor("atlas")).toMatch(/^bb1/);
    expect(w.walletFor("ghost")).toBeNull();
    expect(w.addressFor("ghost")).toBeNull();
    w.close();
  });

  test("balanceFor queries the persona's address; throws for unknown persona", async () => {
    let asked = "";
    const w = fresh(async (addr) => {
      asked = addr;
      return [{ denom: "ubadge", amount: "100" }];
    });
    const rec = await w.ensureWallet("atlas");
    const bal = await w.balanceFor("atlas");
    expect(asked).toBe(rec.address);
    expect(bal[0]!.amount).toBe("100");
    await expect(w.balanceFor("ghost")).rejects.toThrow("no wallet");
    w.close();
  });

  test("list is ordered by hd_index", async () => {
    const w = fresh();
    await w.ensureWallet("a");
    await w.ensureWallet("b");
    await w.ensureWallet("c");
    expect(w.list().map((r) => r.hdIndex)).toEqual([0, 1, 2]);
    w.close();
  });

  test("KEY HYGIENE — no private key or mnemonic is ever persisted", async () => {
    const w = fresh();
    await w.ensureWallet("atlas");
    // Dump everything the DB stores and assert no secret material is present.
    const rows = w.list();
    const dump = JSON.stringify(rows);
    expect(dump).not.toContain(MNEMONIC);
    for (const word of MNEMONIC.split(" ")) {
      // no run of mnemonic words leaks through (addresses are base32, not words)
      expect(dump.includes(` ${word} `)).toBe(false);
    }
    // Only derivation metadata is stored.
    expect(Object.keys(rows[0]!).sort()).toEqual([
      "address",
      "created",
      "hdIndex",
      "personaId",
    ]);
    w.close();
  });

  test("refuses to derive without a master mnemonic", async () => {
    // Empty string = not configured (the env fallback is bypassed explicitly).
    const w = new PersonaWallets({ mnemonic: "" });
    await expect(w.ensureWallet("atlas")).rejects.toThrow(
      "AGENT_SIGNER_MNEMONIC",
    );
    w.close();
  });
});
