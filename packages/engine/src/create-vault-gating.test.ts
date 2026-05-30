import { beforeEach, describe, expect, test } from "bun:test";
import { generateWallet } from "@vellum/chain";
import { TEST_BB1 } from "@vellum/tx";
import {
  createEngine,
  grantDefaultCapabilities,
  vaultTools,
  type Engine,
} from "./index.ts";

// A confirmed create-vault tx whose events parse to collectionId "777",
// backingAddress "bb1backing", withdraw approvalId "vault-withdraw-xyz".
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

// Bech32-checksummed bb1 signer addresses — create_vault validates the full
// checksum on multisig signers (#62 + #103), so fixtures must round-trip
// through cosmjs.
const SA = TEST_BB1.TO1;
const SB = TEST_BB1.TO2;
const SC = TEST_BB1.TO3;

let mnemonic: string;
beforeEach(async () => {
  mnemonic = (await generateWallet()).mnemonic;
});

function eng(): Engine {
  return createEngine({
    dbPath: ":memory:",
    embedder: null,
    mnemonic,
    runLoop: async () => ({ text: "", meters: [] }),
    vault: {
      defaultManager: "bb1zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zql3w7",
      createVault: async () => ({ txHash: "VAULTCREATE1" }),
      confirmTx: async () => ({ height: 9, code: 0 }),
      fetchTx: async () => fakeCreateTxEvents,
      fetchTokenBalance: async () => "0",
    },
  });
}

async function provision(e: Engine): Promise<void> {
  grantDefaultCapabilities(e.capabilities, "p");
  e.store.createPersona("p", "Pat", { name: "Pat", role: "t", voice: "v" });
  await e.wallets.ensureWallet("p");
}

describe("create_vault — full gating criteria (#66)", () => {
  test("amount cap + period maps to gating.amount", async () => {
    const e = eng();
    await provision(e);
    const out = await vaultTools(e, "p").invoke("create_vault", {
      name: "Groceries",
      symbol: "vGRO",
      withdrawLimit: 50,
      withdrawPeriod: "weekly",
    });
    expect(out).toMatch(/limit 50 USDC\/weekly/);
    expect(e.vaults.list("p")[0]!.gating).toEqual({
      amount: { limitUsd: 50, period: "weekly" },
    });
  });

  test("dailyWithdrawLimit shorthand maps to amount with a daily period", async () => {
    const e = eng();
    await provision(e);
    await vaultTools(e, "p").invoke("create_vault", {
      name: "Coffee",
      symbol: "vCOF",
      dailyWithdrawLimit: 5,
    });
    expect(e.vaults.list("p")[0]!.gating).toEqual({
      amount: { limitUsd: 5, period: "daily" },
    });
  });

  test("time window: relative unlock (+7d) and ISO expiry both normalize to epoch ms", async () => {
    const e = eng();
    await provision(e);
    await vaultTools(e, "p").invoke("create_vault", {
      name: "Rent",
      symbol: "vRENT",
      unlockAt: "+7d",
      expiresAt: "2026-12-31",
    });
    const t = e.vaults.list("p")[0]!.gating!.time!;
    expect(t.unlockAt).toBeGreaterThan(Date.now() + 6 * 86_400_000);
    expect(t.unlockAt).toBeLessThan(Date.now() + 8 * 86_400_000);
    expect(new Date(t.expiresAt!).toISOString()).toStartWith("2026-12-31");
  });

  test("multi-sig: signers + threshold map to gating.multisig", async () => {
    const e = eng();
    await provision(e);
    const out = await vaultTools(e, "p").invoke("create_vault", {
      name: "Treasury",
      symbol: "vTRE",
      signers: [SA, SB, SC],
      threshold: 2,
    });
    expect(out).toMatch(/2-of-3 sign-off/);
    expect(e.vaults.list("p")[0]!.gating!.multisig).toEqual({
      signers: [{ address: SA }, { address: SB }, { address: SC }],
      threshold: 2,
    });
  });

  test("no rules → an ungated vault (gating null)", async () => {
    const e = eng();
    await provision(e);
    await vaultTools(e, "p").invoke("create_vault", {
      name: "Misc",
      symbol: "vMISC",
    });
    expect(e.vaults.list("p")[0]!.gating).toBeNull();
  });

  describe("boundary validation rejects bad criteria (no vault created)", () => {
    test.each([
      [
        {
          name: "x",
          symbol: "vX",
          withdrawLimit: 10,
          withdrawPeriod: "yearly",
        },
        /daily, weekly, or monthly/,
      ],
      [{ name: "x", symbol: "vX", withdrawLimit: 0 }, /positive number/],
      [
        // a structurally-valid signer + a bb1-PREFIXED but too-short one → the
        // full bb1 check rejects it (the #62 medium finding).
        {
          name: "x",
          symbol: "vX",
          signers: [SA, "bb1tooshort"],
          threshold: 1,
        },
        /bb1 address/,
      ],
      [
        { name: "x", symbol: "vX", signers: [SA, SB], threshold: 3 },
        /between 1 and 2/,
      ],
      [{ name: "x", symbol: "vX", threshold: 2 }, /Provide signer addresses/],
      [
        {
          name: "x",
          symbol: "vX",
          unlockAt: "2026-12-31",
          expiresAt: "2026-01-01",
        },
        /unlock time must be before the expiry/,
      ],
      [{ name: "x", symbol: "vX", unlockAt: "not-a-date" }, /parse unlockAt/],
    ] as [Record<string, unknown>, RegExp][])(
      "%o → rejected",
      async (args, pattern) => {
        const e = eng();
        await provision(e);
        const out = await vaultTools(e, "p").invoke("create_vault", args);
        expect(out).toMatch(pattern);
        expect(e.vaults.list("p").length).toBe(0); // nothing persisted
      },
    );
  });
});
