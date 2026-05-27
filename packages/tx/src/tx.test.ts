import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { unlinkSync } from "node:fs";
import { generateWallet, TxRevertedError, type Coin } from "@vellum/chain";
import { Ledger } from "@vellum/ledger";
import { PersonaWallets } from "@vellum/wallet";
import { TxManager, type TxChain } from "./index.ts";

const DENOM = "ibc/TESTUSDC";
const FUNDED: Coin[] = [{ denom: DENOM, amount: "10000000" }]; // 10 USDC

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn: () => boolean, ms = 2000) {
  const start = Date.now();
  while (!fn() && Date.now() - start < ms) await delay(5);
  if (!fn()) throw new Error("waitFor timed out");
}

// Baseline fake chain: funded, sim ok, deterministic hashes, immediate confirm.
function baseChain(over: Partial<TxChain> = {}): TxChain {
  let n = 0;
  return {
    getBalances: async () => FUNDED,
    simulateSend: async () => 120000,
    broadcastSend: async () => `HASH${++n}`,
    confirmTx: async () => ({ height: 7, code: 0 }),
    ...over,
  };
}

let wallets: PersonaWallets;
let ledger: Ledger;
beforeEach(async () => {
  wallets = new PersonaWallets({ mnemonic: (await generateWallet()).mnemonic });
  await wallets.ensureWallet("a");
  await wallets.ensureWallet("b");
  ledger = new Ledger(":memory:");
});

function mgr(chain: TxChain, denom = DENOM) {
  return new TxManager({ wallets, ledger, chain, denom });
}

describe("TxManager — reconciliation invariant", () => {
  test("persists PENDING before returning; ledger is written only after confirm", async () => {
    const gate = deferred<void>();
    const tm = mgr(
      baseChain({
        confirmTx: async () => (await gate.promise, { height: 9, code: 0 }),
      }),
    );

    const p = await tm.spend({
      personaId: "a",
      to: "bb1dest",
      amount: "1000000",
    });
    expect(p.status).toBe("pending");
    expect(tm.get(p.hash)!.status).toBe("pending");
    expect(ledger.list({ personaId: "a" })).toHaveLength(0); // NOT yet — unconfirmed

    gate.resolve();
    await waitFor(() => tm.get(p.hash)!.status === "confirmed");
    expect(tm.get(p.hash)!.height).toBe(9);
    const entries = ledger.list({ personaId: "a" });
    expect(entries).toHaveLength(1);
    expect(entries[0]!.kind).toBe("spend");
    expect(entries[0]!.txHash).toBe(p.hash);
    expect(entries[0]!.meta.height).toBe(9);
    tm.close();
  });

  test("a definitively REVERTED tx is marked FAILED with no ledger entry", async () => {
    const tm = mgr(
      baseChain({
        confirmTx: async () => {
          throw new TxRevertedError("tx reverted: bad", 5);
        },
      }),
    );
    const p = await tm.spend({
      personaId: "a",
      to: "bb1dest",
      amount: "1000000",
    });
    await waitFor(() => tm.get(p.hash)!.status !== "pending");
    expect(tm.get(p.hash)!.status).toBe("failed");
    expect(tm.get(p.hash)!.error).toContain("reverted");
    expect(ledger.list({ personaId: "a" })).toHaveLength(0);
    tm.close();
  });

  test("a confirmation TIMEOUT stays PENDING and is later reconciled (never lost)", async () => {
    let mode: "timeout" | "ok" = "timeout";
    const tm = mgr(
      baseChain({
        confirmTx: async () => {
          if (mode === "timeout")
            throw new Error("tx HASH not committed within 20s");
          return { height: 50, code: 0 };
        },
      }),
    );
    const p = await tm.spend({
      personaId: "a",
      to: "bb1dest",
      amount: "1000000",
    });
    // The timed-out confirm records an error but must NOT fail the row.
    await waitFor(() => tm.get(p.hash)!.error !== null);
    expect(tm.get(p.hash)!.status).toBe("pending");
    expect(ledger.list({ personaId: "a" })).toHaveLength(0);

    // The tx is observed on chain later; reconcile confirms it exactly once.
    mode = "ok";
    expect(await tm.reconcile()).toBe(1);
    expect(tm.get(p.hash)!.status).toBe("confirmed");
    expect(tm.get(p.hash)!.height).toBe(50);
    expect(ledger.list({ personaId: "a" })).toHaveLength(1);
    tm.close();
  });

  test("insufficient balance rejects pre-flight — no broadcast, no pending", async () => {
    let broadcasts = 0;
    const tm = mgr(
      baseChain({
        getBalances: async () => [{ denom: DENOM, amount: "500" }],
        broadcastSend: async () => {
          broadcasts++;
          return "H";
        },
      }),
    );
    await expect(
      tm.spend({ personaId: "a", to: "bb1dest", amount: "1000000" }),
    ).rejects.toThrow("insufficient");
    expect(broadcasts).toBe(0);
    expect(tm.pending()).toHaveLength(0);
    tm.close();
  });

  test("simulation failure rejects before broadcast", async () => {
    let broadcasts = 0;
    const tm = mgr(
      baseChain({
        simulateSend: async () => {
          throw new Error("sim: account sequence mismatch");
        },
        broadcastSend: async () => {
          broadcasts++;
          return "H";
        },
      }),
    );
    await expect(
      tm.spend({ personaId: "a", to: "bb1dest", amount: "1000000" }),
    ).rejects.toThrow("sim:");
    expect(broadcasts).toBe(0);
    tm.close();
  });

  test("per-persona mutex: a 2nd tx waits until the 1st settles", async () => {
    const gate = deferred<void>();
    const order: string[] = [];
    const tm = mgr(
      baseChain({
        broadcastSend: async (_s, _f, to) => {
          order.push(to);
          return `H-${to}`;
        },
        confirmTx: async () => (await gate.promise, { height: 1, code: 0 }),
      }),
    );

    await tm.spend({ personaId: "a", to: "to1", amount: "1000000" }); // lock held by its confirm
    let secondDone = false;
    const p2 = tm
      .spend({ personaId: "a", to: "to2", amount: "1000000" })
      .then((r) => {
        secondDone = true;
        return r;
      });

    await delay(60);
    expect(secondDone).toBe(false); // blocked on the mutex
    expect(order).toEqual(["to1"]); // 2nd hasn't broadcast yet

    gate.resolve(); // 1st confirms → releases the lock
    await p2;
    expect(order).toEqual(["to1", "to2"]);
    tm.close();
  });

  test("on restart, reconcile() drives leftover PENDING rows to terminal state (idempotent)", async () => {
    const dbPath = `/tmp/vellum-tx-${Date.now()}-${Math.random().toString(36).slice(2)}.db`;
    try {
      // First manager "crashes" mid-confirm: confirmTx never resolves → row stays pending.
      const l1 = new Ledger(":memory:");
      const tm1 = new TxManager({
        wallets,
        ledger: l1,
        dbPath,
        denom: DENOM,
        chain: baseChain({ confirmTx: () => new Promise(() => {}) }),
      });
      const p = await tm1.spend({
        personaId: "a",
        to: "bb1dest",
        amount: "1000000",
      });
      expect(tm1.get(p.hash)!.status).toBe("pending");
      expect(l1.list({ personaId: "a" })).toHaveLength(0);
      tm1.close();

      // Restart: new manager on the same db reconciles against a chain that confirms.
      const l2 = new Ledger(":memory:");
      const tm2 = new TxManager({
        wallets,
        ledger: l2,
        dbPath,
        denom: DENOM,
        chain: baseChain({ confirmTx: async () => ({ height: 12, code: 0 }) }),
      });
      expect(await tm2.reconcile()).toBe(1);
      expect(tm2.get(p.hash)!.status).toBe("confirmed");
      expect(l2.list({ personaId: "a" })).toHaveLength(1);

      // Idempotent: a second reconcile does nothing (no pendings, no double-ledger).
      expect(await tm2.reconcile()).toBe(0);
      expect(l2.list({ personaId: "a" })).toHaveLength(1);
      tm2.close();
    } finally {
      for (const s of ["", "-shm", "-wal"])
        try {
          unlinkSync(dbPath + s);
        } catch {}
    }
  });
});
