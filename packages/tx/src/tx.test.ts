import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { unlinkSync } from "node:fs";
import {
  BroadcastRejectedError,
  generateWallet,
  TxRevertedError,
  type Coin,
} from "@vellum/chain";
import { Ledger } from "@vellum/ledger";
import { PersonaWallets } from "@vellum/wallet";
import { TxManager, type TxChain } from "./index.ts";

const DENOM = "ibc/TESTUSDC";
const FUNDED: Coin[] = [{ denom: DENOM, amount: "10000000" }]; // 10 USDC

// Valid bb1 recipients — the spend() chokepoint now structurally validates the
// address (#65 review), so lifecycle tests use well-formed addresses.
const DEST = "bb1" + "d".repeat(39);
const TO1 = "bb1" + "a".repeat(39);
const TO2 = "bb1" + "b".repeat(39);
const TO3 = "bb1" + "c".repeat(39);

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

// Baseline fake chain: funded, deterministic hashes, immediate confirm.
function baseChain(over: Partial<TxChain> = {}): TxChain {
  let n = 0;
  return {
    getBalances: async () => FUNDED,
    signAndBroadcast: async () => `HASH${++n}`,
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
      to: DEST,
      amount: "1000000",
    });
    expect(p.status).toBe("pending");
    expect(tm.get(p.id)!.status).toBe("pending");
    expect(ledger.list({ personaId: "a" })).toHaveLength(0); // NOT yet — unconfirmed

    gate.resolve();
    await waitFor(() => tm.get(p.id)!.status === "confirmed");
    expect(tm.get(p.id)!.height).toBe(9);
    const entries = ledger.list({ personaId: "a" });
    expect(entries).toHaveLength(1);
    expect(entries[0]!.kind).toBe("spend");
    expect(entries[0]!.txHash).toBe(p.hash);
    expect(entries[0]!.meta.height).toBe(9);
    tm.close();
  });

  test("persists a durable INTENT before broadcast (no silent-loss window)", async () => {
    const gate = deferred<void>();
    const tm = mgr(
      baseChain({
        signAndBroadcast: async () => (await gate.promise, "HASH-X"),
      }),
    );
    const p = tm.spend({ personaId: "a", to: DEST, amount: "1000000" }); // not awaited
    // While the broadcast is in flight, the intent is ALREADY durable as
    // "submitting" with no hash — discoverable even if the process dies here.
    await waitFor(() => tm.pending("a").length === 1);
    const intent = tm.pending("a")[0]!;
    expect(intent.status).toBe("submitting");
    expect(intent.hash).toBeNull();

    gate.resolve();
    const settled = await p;
    expect(settled.status).toBe("pending");
    expect(settled.hash).toBe("HASH-X");
    await waitFor(() => tm.get(settled.id)!.status === "confirmed");
    expect(ledger.list({ personaId: "a" })).toHaveLength(1);
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
      to: DEST,
      amount: "1000000",
    });
    await waitFor(() => tm.get(p.id)!.status !== "pending");
    expect(tm.get(p.id)!.status).toBe("failed");
    expect(tm.get(p.id)!.error).toContain("reverted");
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
      to: DEST,
      amount: "1000000",
    });
    // The timed-out confirm records an error but must NOT fail the row.
    await waitFor(() => tm.get(p.id)!.error !== null);
    expect(tm.get(p.id)!.status).toBe("pending");
    expect(ledger.list({ personaId: "a" })).toHaveLength(0);

    // The tx is observed on chain later; reconcile confirms it exactly once.
    mode = "ok";
    expect(await tm.reconcile()).toBe(1);
    expect(tm.get(p.id)!.status).toBe("confirmed");
    expect(tm.get(p.id)!.height).toBe(50);
    expect(ledger.list({ personaId: "a" })).toHaveLength(1);
    tm.close();
  });

  test("auto-reconcile re-drives a left-pending tx WITHOUT a restart (#81)", async () => {
    // Before #81, a confirm that timed out sat PENDING until the next daemon
    // restart's reconcile(). reconcileStale() is the in-process safety net.
    let mode: "timeout" | "ok" = "timeout";
    const tm = mgr(
      baseChain({
        confirmTx: async () => {
          if (mode === "timeout")
            throw new Error("tx HASH not committed within 20s");
          return { height: 77, code: 0 };
        },
      }),
    );
    const p = await tm.spend({ personaId: "a", to: DEST, amount: "1000000" });
    await waitFor(() => tm.get(p.id)!.error !== null);
    expect(tm.get(p.id)!.status).toBe("pending");

    // The commit lands after the initial window. staleMs=0 so the just-touched
    // row is eligible; the sweep re-confirms it with no restart.
    mode = "ok";
    expect(await tm.reconcileStale(0)).toBe(1);
    expect(tm.get(p.id)!.status).toBe("confirmed");
    expect(tm.get(p.id)!.height).toBe(77);
    expect(ledger.list({ personaId: "a" })).toHaveLength(1);
    tm.close();
  });

  test("startAutoReconcile settles a stuck-pending tx on its interval (#81)", async () => {
    let mode: "timeout" | "ok" = "timeout";
    const tm = mgr(
      baseChain({
        confirmTx: async () => {
          if (mode === "timeout")
            throw new Error("tx HASH not committed within 20s");
          return { height: 88, code: 0 };
        },
      }),
    );
    const p = await tm.spend({ personaId: "a", to: DEST, amount: "1000000" });
    await waitFor(() => tm.get(p.id)!.error !== null);
    expect(tm.get(p.id)!.status).toBe("pending");

    // Fast tick + staleMs=0 so each sweep re-drives the pending row; once the
    // chain confirms, the loop settles it and stop() halts the timer.
    const stop = tm.startAutoReconcile(10, 0);
    mode = "ok";
    await waitFor(() => tm.get(p.id)!.status === "confirmed");
    stop();
    expect(tm.get(p.id)!.height).toBe(88);
    expect(ledger.list({ personaId: "a" })).toHaveLength(1);
    tm.close();
  });

  test("a pending tx (incl. after timeout) blocks the next spend until it settles", async () => {
    let mode: "timeout" | "ok" = "timeout";
    let broadcasts = 0;
    const tm = mgr(
      baseChain({
        signAndBroadcast: async () => `H${++broadcasts}`,
        confirmTx: async () => {
          if (mode === "timeout")
            throw new Error("tx HASH not committed within 20s");
          return { height: 3, code: 0 };
        },
      }),
    );

    const first = await tm.spend({
      personaId: "a",
      to: TO1,
      amount: "1000000",
    });
    await waitFor(() => tm.get(first.id)!.error !== null); // timed out → still pending
    expect(tm.get(first.id)!.status).toBe("pending");
    expect(broadcasts).toBe(1);

    // Second spend must NOT broadcast while the first is pending.
    await expect(
      tm.spend({ personaId: "a", to: TO2, amount: "1000000" }),
    ).rejects.toThrow("pending tx");
    expect(broadcasts).toBe(1);

    // Settle the first; only then may the next spend proceed.
    mode = "ok";
    await tm.reconcile();
    expect(tm.get(first.id)!.status).toBe("confirmed");
    const third = await tm.spend({
      personaId: "a",
      to: TO3,
      amount: "1000000",
    });
    expect(third.status).toBe("pending");
    expect(broadcasts).toBe(2);
    tm.close();
  });

  test("insufficient balance rejects pre-flight — no broadcast, no pending", async () => {
    let broadcasts = 0;
    const tm = mgr(
      baseChain({
        getBalances: async () => [{ denom: DENOM, amount: "500" }],
        signAndBroadcast: async () => {
          broadcasts++;
          return "H";
        },
      }),
    );
    await expect(
      tm.spend({ personaId: "a", to: DEST, amount: "1000000" }),
    ).rejects.toThrow("insufficient");
    expect(broadcasts).toBe(0);
    expect(tm.pending()).toHaveLength(0);
    tm.close();
  });

  test("a typed CheckTx rejection (BroadcastRejectedError) fails the row and clears pending", async () => {
    const tm = mgr(
      baseChain({
        signAndBroadcast: async () => {
          throw new BroadcastRejectedError(
            "broadcast rejected (code 5): insufficient fee",
            5,
            "HASH-RJ",
          );
        },
      }),
    );
    await expect(
      tm.spend({ personaId: "a", to: DEST, amount: "1000000" }),
    ).rejects.toThrow("rejected");
    expect(tm.pending()).toHaveLength(0);
    tm.close();
  });

  test("a direct submit({kind:'vault_op'}) WITHOUT capability is rejected at the chokepoint (#100)", async () => {
    // The promise of #37 is that EVERY money-moving submission is gated at
    // submit(). Before the fix, kind 'vault_op' relied on the upstream
    // VaultService gate — any future tool/route/MCP server constructing a
    // vault_op directly would bypass the check. The chokepoint now refuses
    // vault_op unless the caller declares a capability.
    const tm = mgr(baseChain());
    await expect(
      tm.submit({
        personaId: "a",
        kind: "vault_op",
        msgs: [{ typeUrl: "/tokenization.MsgCreateCollection", value: {} }],
        to: "bb1backing",
        amount: "1000000",
      }),
    ).rejects.toThrow(/vault_op submission must declare a capability/);
    // No row, no broadcast — denial fires BEFORE the per-persona mutex is
    // acquired, so subsequent submissions are unaffected.
    expect(tm.pending()).toHaveLength(0);
    tm.close();
  });

  test("a network error whose message contains 'rejected' leaves the row SUBMITTING — not failed (#99)", async () => {
    // A TLS intermediary or browser-extension wrapper can surface error
    // messages that include the substring "rejected" (e.g. "connection rejected
    // by peer"). The OLD classifier did `/rejected/.test(message)` and
    // misclassified this as a definitive CheckTx revert, marking the row
    // failed AND releasing the per-persona guard — while the tx may actually
    // have committed on-chain. The fix is to classify by type, not by
    // substring: only a typed BroadcastRejectedError is definitive.
    const tm = mgr(
      baseChain({
        signAndBroadcast: async () => {
          throw new Error("connection rejected by peer");
        },
      }),
    );
    await expect(
      tm.spend({ personaId: "a", to: DEST, amount: "1000000" }),
    ).rejects.toThrow("connection rejected by peer");
    // The row stays SUBMITTING so reconcile can drive recovery, and the
    // per-persona durable guard keeps the wallet locked until the ambiguity
    // resolves (intentional — never auto-rebroadcast an in-flight intent).
    expect(tm.pending()).toHaveLength(1);
    expect(tm.pending()[0]!.status).toBe("submitting");
    tm.close();
  });

  test("per-persona mutex: a 2nd tx waits until the 1st settles", async () => {
    const gate = deferred<void>();
    const order: string[] = [];
    const tm = mgr(
      baseChain({
        signAndBroadcast: async (_adapter, msgs) => {
          const to = (msgs[0]!.value as { toAddress: string }).toAddress;
          order.push(to);
          return `H-${to}`;
        },
        confirmTx: async () => (await gate.promise, { height: 1, code: 0 }),
      }),
    );

    await tm.spend({ personaId: "a", to: TO1, amount: "1000000" }); // lock held by its confirm
    let secondDone = false;
    const p2 = tm
      .spend({ personaId: "a", to: TO2, amount: "1000000" })
      .then((r) => {
        secondDone = true;
        return r;
      });

    await delay(60);
    expect(secondDone).toBe(false); // blocked on the mutex
    expect(order).toEqual([TO1]); // 2nd hasn't broadcast yet

    gate.resolve(); // 1st confirms → releases the lock
    await p2;
    expect(order).toEqual([TO1, TO2]);
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
        to: DEST,
        amount: "1000000",
      });
      expect(tm1.get(p.id)!.status).toBe("pending");
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
      expect(tm2.get(p.id)!.status).toBe("confirmed");
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

describe("TxManager — capability chokepoint (#37)", () => {
  test("a denied spend never touches the chain (gate fires before broadcast)", async () => {
    let broadcasts = 0;
    const chain = baseChain({
      signAndBroadcast: async () => {
        broadcasts++;
        return "SHOULD_NOT_HAPPEN";
      },
    });
    const tm = new TxManager({
      wallets,
      ledger,
      chain,
      denom: DENOM,
      authorize: async () => {
        throw new Error("denied: spend");
      },
    });
    await expect(
      tm.spend({ personaId: "a", to: DEST, amount: "1000000" }),
    ).rejects.toThrow("denied");
    expect(broadcasts).toBe(0); // gate fired before any chain interaction
    tm.close();
  });

  test("a direct submit({kind:'spend'}) is gated too (no bypass via the public chokepoint)", async () => {
    let broadcasts = 0;
    const tm = new TxManager({
      wallets,
      ledger,
      chain: baseChain({
        signAndBroadcast: async () => {
          broadcasts++;
          return "NOPE";
        },
      }),
      denom: DENOM,
      authorize: async () => {
        throw new Error("denied: spend");
      },
    });
    await expect(
      tm.submit({
        personaId: "a",
        kind: "spend",
        msgs: [{ typeUrl: "/cosmos.bank.v1beta1.MsgSend", value: {} }],
        to: DEST,
        amount: "1000000",
      }),
    ).rejects.toThrow("denied");
    expect(broadcasts).toBe(0);
    tm.close();
  });

  test("a vault_op submit gates at the chokepoint when capability declared (#100)", async () => {
    // Post-#100 model: vault_op MUST declare a capability at the chokepoint.
    // The upstream VaultService gate is now defense-in-depth, not the only
    // gate — a direct submit({kind:'vault_op'}) without capability throws
    // (covered by the separate "must declare a capability" test); WITH a
    // capability, the chokepoint authorizes here once.
    let authorizeCalls = 0;
    const tm = new TxManager({
      wallets,
      ledger,
      chain: baseChain(),
      denom: DENOM,
      authorize: async () => {
        authorizeCalls++;
      },
    });
    const p = await tm.submit({
      personaId: "a",
      kind: "vault_op",
      msgs: [{ typeUrl: "/tokenization.MsgTransferTokens", value: {} }],
      to: "bb1backing",
      amount: "1000000",
      capability: {
        name: "vault.withdraw",
        target: "777",
        summary: "withdraw 1 USDC from vault 777",
      },
    });
    expect(authorizeCalls).toBe(1); // chokepoint runs the gate exactly once
    expect(p.status).toBe("pending");
    tm.close();
  });

  test("an allowed spend proceeds through the lifecycle", async () => {
    let authorized = false;
    const tm = new TxManager({
      wallets,
      ledger,
      chain: baseChain(),
      denom: DENOM,
      authorize: async () => {
        authorized = true;
      },
    });
    const p = await tm.spend({
      personaId: "a",
      to: DEST,
      amount: "1000000",
    });
    expect(authorized).toBe(true);
    expect(p.status).toBe("pending");
    tm.close();
  });
});

describe("TxManager.spend — structural input guards (#65)", () => {
  test("rejects a malformed bb1 recipient before any broadcast", async () => {
    let broadcasts = 0;
    const tm = mgr(
      baseChain({ signAndBroadcast: async () => (broadcasts++, "H") }),
    );
    for (const bad of ["bb1d", "0xdeadbeef", "cosmos1abc", ""]) {
      await expect(
        tm.spend({ personaId: "a", to: bad, amount: "1000000" }),
      ).rejects.toThrow("invalid recipient");
    }
    expect(broadcasts).toBe(0);
    expect(tm.pending()).toHaveLength(0);
    tm.close();
  });

  test("rejects zero / negative / non-integer amounts before any broadcast", async () => {
    let broadcasts = 0;
    const tm = mgr(
      baseChain({ signAndBroadcast: async () => (broadcasts++, "H") }),
    );
    for (const bad of ["0", "-1", "1.5", "abc", ""]) {
      await expect(
        tm.spend({ personaId: "a", to: DEST, amount: bad }),
      ).rejects.toThrow("invalid amount");
    }
    expect(broadcasts).toBe(0);
    expect(tm.pending()).toHaveLength(0);
    tm.close();
  });
});
