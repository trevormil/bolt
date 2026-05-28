import { beforeEach, describe, expect, test } from "bun:test";
import { generateWallet, type MsgJson } from "@vellum/chain";
import type { TxChain } from "@vellum/tx";
import { env } from "@vellum/shared";
import {
  balanceTools,
  createEngine,
  grantDefaultCapabilities,
  vaultTools,
  type Engine,
} from "./index.ts";

const RECIPIENT = "bb1recipient000000000000000000000000000000";

// A confirmed create-vault tx whose events parse to backingAddress "bb1backing"
// + withdraw approvalId "vault-withdraw-xyz" (same shape the web/escrow tests use).
const fakeCreateTxEvents = {
  events: [
    {
      type: "message",
      attributes: [
        { key: "collectionId", value: "777" },
        {
          key: "msg",
          value: JSON.stringify({
            collectionApprovals: [
              {
                approvalId: "vault-deposit",
                fromListId: "bb1backing",
                toListId: "!bb1backing",
              },
              { approvalId: "vault-withdraw-xyz", toListId: "bb1backing" },
            ],
          }),
        },
      ],
    },
  ],
};

// Capture the msgs the chain layer was asked to broadcast, so we can assert the
// pay routes through the GATED withdraw leg (and not some ungated path). `reject`
// makes CheckTx reject pre-flight — the on-chain gating rejection (over-cap /
// locked / no-quorum) surfaces here, since the engine never simulates limits
// itself; the chain is the authority.
function captureChain(opts: { reject?: boolean } = {}): {
  chain: TxChain;
  broadcasts: MsgJson[][];
} {
  const broadcasts: MsgJson[][] = [];
  const chain: TxChain = {
    getBalances: async () => [{ denom: env.VELLUM_DENOM, amount: "10000000" }],
    signAndBroadcast: async (_adapter, msgs) => {
      broadcasts.push(msgs as MsgJson[]);
      if (opts.reject) throw new Error("tx rejected: over withdrawal cap");
      return "PAYHASH";
    },
    confirmTx: async () => ({ height: 5, code: 0 }),
  };
  return { chain, broadcasts };
}

let mnemonic: string;
beforeEach(async () => {
  mnemonic = (await generateWallet()).mnemonic;
});

function eng(chain: TxChain): Engine {
  return createEngine({
    dbPath: ":memory:",
    embedder: null,
    mnemonic,
    runLoop: async () => ({ text: "", meters: [] }),
    txChain: chain,
    vault: {
      defaultManager: "bb1human000000000000000000000000000000000",
      createVault: async () => ({ txHash: "VAULTCREATE1" }),
      confirmTx: async () => ({ height: 9, code: 0 }),
      fetchTx: async () => fakeCreateTxEvents,
      fetchTokenBalance: async () => "3000000",
    },
  });
}

async function provisionVault(e: Engine): Promise<string> {
  grantDefaultCapabilities(e.capabilities, "p");
  e.store.createPersona("p", "Pat", { name: "Pat", role: "t", voice: "v" });
  await e.wallets.ensureWallet("p");
  const v = await e.vaults.create("p", { name: "Rent", symbol: "vRENT" });
  return v.collectionId;
}

describe("engine.vaults.pay — gated pay-from-vault-to-recipient (#51)", () => {
  test("routes through the GATED withdraw leg + a bank send to the recipient, atomically", async () => {
    const { chain, broadcasts } = captureChain();
    const e = eng(chain);
    const collectionId = await provisionVault(e);
    const from = e.wallets.addressFor("p")!;

    const p = await e.vaults.pay("p", collectionId, "2000000", RECIPIENT);
    expect(p.kind).toBe("vault_op"); // governed lifecycle, same chokepoint as withdraw
    expect(p.to).toBe(RECIPIENT);

    // ONE broadcast, TWO msgs (atomic): leg 1 = gated unback → backing, leg 2 =
    // bank-send the freed USDC → recipient.
    expect(broadcasts.length).toBe(1);
    const [unback, send] = broadcasts[0]!;

    // Leg 1 is the SAME gated transfer the plain withdraw uses: it prioritizes
    // the vault's withdraw approval (whose approvalCriteria carries amount/time/
    // multisig) and goes to the backing address — so the gating binds the pay.
    expect(unback!.typeUrl).toBe("/tokenization.MsgTransferTokens");
    const transfer = (
      unback!.value as {
        transfers: {
          toAddresses: string[];
          prioritizedApprovals: { approvalId: string }[];
          balances: { amount: string }[];
        }[];
      }
    ).transfers[0]!;
    expect(transfer.toAddresses).toEqual(["bb1backing"]); // burns to backing, NOT the recipient
    expect(transfer.prioritizedApprovals[0]!.approvalId).toBe(
      "vault-withdraw-xyz",
    );
    expect(transfer.balances[0]!.amount).toBe("2000000");

    // Leg 2 is a plain bank send of the freed base USDC to the recipient.
    expect(send!.typeUrl).toBe("/cosmos.bank.v1beta1.MsgSend");
    expect(send!.value).toMatchObject({
      fromAddress: from,
      toAddress: RECIPIENT,
      amount: [{ denom: env.VELLUM_DENOM, amount: "2000000" }],
    });
  });

  test("over-cap / locked / no-quorum is rejected at CheckTx — no value moves", async () => {
    const { chain } = captureChain({ reject: true });
    const e = eng(chain);
    const id = await provisionVault(e);
    await expect(e.vaults.pay("p", id, "9000000", RECIPIENT)).rejects.toThrow(
      /rejected/,
    );
    // The tx row is recorded as failed (durable intent), not confirmed.
    const rows = e.txManager.list("p");
    const pay = rows.find((r) => r.to === RECIPIENT)!;
    expect(pay.status).toBe("failed");
  });

  test("a non-bb1 recipient is rejected BEFORE any broadcast", async () => {
    const { chain, broadcasts } = captureChain();
    const e = eng(chain);
    const id = await provisionVault(e);
    await expect(
      e.vaults.pay("p", id, "1000000", "0xdeadbeef"),
    ).rejects.toThrow(/invalid recipient/);
    expect(broadcasts.length).toBe(0); // never broadcast a malformed-recipient pay
  });

  test("pay is denied without the vault.withdraw grant (default-deny)", async () => {
    const { chain, broadcasts } = captureChain();
    const e = eng(chain);
    // Provision a vault WITH the grant, then revoke withdraw so pay must deny.
    e.store.createPersona("p", "Pat", { name: "Pat", role: "t", voice: "v" });
    await e.wallets.ensureWallet("p");
    e.capabilities.grant({
      personaId: "p",
      capability: "vault.create",
      scope: null,
      mode: "allow",
    });
    const v = await e.vaults.create("p", { name: "Rent", symbol: "vRENT" });
    broadcasts.length = 0; // ignore the create broadcast
    // No vault.withdraw grant → pay must throw CapabilityDeniedError.
    await expect(
      e.vaults.pay("p", v.collectionId, "1000000", RECIPIENT),
    ).rejects.toThrow();
    expect(broadcasts.length).toBe(0); // denied before any broadcast
  });

  test("pay_from_vault tool denied without the grant (clean agent-facing message)", async () => {
    const { chain } = captureChain();
    const e = eng(chain);
    const out = await vaultTools(e, "p").invoke("pay_from_vault", {
      collectionId: "777",
      amountUsdc: 1,
      to: RECIPIENT,
    });
    expect(out).toContain("Denied");
  });
});

describe("check_balance — read-only wallet + per-vault escrow (#51)", () => {
  test("returns the persona's free USDC plus each vault's escrow", async () => {
    const { chain } = captureChain();
    const e = createEngine({
      dbPath: ":memory:",
      embedder: null,
      mnemonic,
      runLoop: async () => ({ text: "", meters: [] }),
      txChain: chain,
      // Wallet free balance read seam (PersonaWallets.balanceFor).
      getBalances: async () => [{ denom: env.VELLUM_DENOM, amount: "4500000" }],
      vault: {
        defaultManager: "bb1human000000000000000000000000000000000",
        createVault: async () => ({ txHash: "VAULTCREATE1" }),
        confirmTx: async () => ({ height: 9, code: 0 }),
        fetchTx: async () => fakeCreateTxEvents,
        fetchTokenBalance: async () => "3000000", // 3 USDC escrowed in the vault
      },
    });
    grantDefaultCapabilities(e.capabilities, "p");
    e.store.createPersona("p", "Pat", { name: "Pat", role: "t", voice: "v" });
    await e.wallets.ensureWallet("p");
    await e.vaults.create("p", { name: "Rent", symbol: "vRENT" });

    const out = await balanceTools(e, "p").invoke("check_balance", {});
    expect(out).toContain("4.50 USDC free");
    expect(out).toContain("vRENT");
    expect(out).toContain("3.00 USDC escrowed");

    // Telemetry: the read lands on the timeline as a tool_call (metadata only).
    const ev = e.events
      .recent("p")
      .find(
        (x) => x.kind === "tool_call" && x.summary === "balance:check_balance",
      );
    expect(ev?.ok).toBe(true);
    expect(ev?.meta).toMatchObject({
      tool: "check_balance",
      source: "balance",
    });
  });
});
