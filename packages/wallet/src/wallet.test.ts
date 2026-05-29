import { afterEach, beforeAll, describe, expect, test } from "bun:test";
import { unlinkSync } from "node:fs";
import { generateWallet, type Coin } from "@vellum/chain";
import { env } from "@vellum/shared";
import { PersonaWallets } from "./index.ts";

let MNEMONIC: string;
beforeAll(async () => {
  MNEMONIC = (await generateWallet()).mnemonic; // pure crypto, no network
});

function fresh(getBalances?: (a: string) => Promise<readonly Coin[]>) {
  return new PersonaWallets({ mnemonic: MNEMONIC, getBalances });
}

describe("master-seed resolution (#96 / ADR-0007)", () => {
  const saved = env.AGENT_SIGNER_MNEMONIC;
  afterEach(() => {
    env.AGENT_SIGNER_MNEMONIC = saved;
  });

  test("with no explicit mnemonic, derives from the resolved env seed", async () => {
    env.AGENT_SIGNER_MNEMONIC = MNEMONIC;
    const w = new PersonaWallets({}); // no opts.mnemonic → lazy getAgentMnemonic
    const a = await w.ensureWallet("atlas");
    expect(a.address.startsWith("bb1")).toBe(true);
    w.close();
  });
});

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

  test("concurrent first-use for the SAME persona resolves to one wallet", async () => {
    const w = fresh();
    const [a, b] = await Promise.all([
      w.ensureWallet("atlas"),
      w.ensureWallet("atlas"),
    ]);
    expect(a).toEqual(b);
    expect(w.list()).toHaveLength(1);
    w.close();
  });

  test("concurrent first-use for DIFFERENT personas gets distinct indices, no error", async () => {
    const w = fresh();
    const recs = await Promise.all([
      w.ensureWallet("a"),
      w.ensureWallet("b"),
      w.ensureWallet("c"),
    ]);
    const indices = recs.map((r) => r.hdIndex).sort((x, y) => x - y);
    expect(indices).toEqual([0, 1, 2]);
    expect(new Set(recs.map((r) => r.address)).size).toBe(3);
    w.close();
  });

  test("refuses to derive when no master seed resolves", async () => {
    // No explicit seed, no env, env-only backend (no keychain) → nothing resolves
    // and derivation fails loudly (ADR-0007). Save/restore the env we toggle.
    const savedSeed = env.AGENT_SIGNER_MNEMONIC;
    const savedBackend = env.VELLUM_SECRET_BACKEND;
    env.AGENT_SIGNER_MNEMONIC = undefined;
    env.VELLUM_SECRET_BACKEND = "env";
    const w = new PersonaWallets({});
    await expect(w.ensureWallet("atlas")).rejects.toThrow(/no agent signer/i);
    env.AGENT_SIGNER_MNEMONIC = savedSeed;
    env.VELLUM_SECRET_BACKEND = savedBackend;
    w.close();
  });

  test("signerFor returns a signer whose address matches the stored row", async () => {
    const w = fresh();
    await w.ensureWallet("atlas");
    const signer = await w.signerFor("atlas");
    expect(signer.address).toBe(w.addressFor("atlas")!);
    w.close();
  });

  test("signerFor refuses a row whose stored address predates the current path", async () => {
    const dbPath = `/tmp/vellum-wallet-${Date.now()}-${Math.random().toString(36).slice(2)}.db`;
    try {
      // One mnemonic provisions the row…
      const w1 = new PersonaWallets({ mnemonic: MNEMONIC, dbPath });
      await w1.ensureWallet("atlas");
      w1.close();
      // …a different master mnemonic on the SAME db derives a different key for
      // index 0, so the persisted address no longer matches — signing must
      // refuse loudly rather than sign as the wrong key.
      const other = (await generateWallet()).mnemonic;
      const w2 = new PersonaWallets({ mnemonic: other, dbPath });
      await expect(w2.signerFor("atlas")).rejects.toThrow("address mismatch");
      w2.close();
    } finally {
      for (const s of ["", "-shm", "-wal"])
        try {
          unlinkSync(dbPath + s);
        } catch {}
    }
  });
});
