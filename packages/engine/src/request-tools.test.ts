import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { generateWallet } from "@vellum/chain";
import { env } from "@vellum/shared";
import {
  createEngine,
  grantDefaultCapabilities,
  requestTools,
  type Engine,
} from "./index.ts";

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

let mnemonic: string;
beforeEach(async () => {
  mnemonic = (await generateWallet()).mnemonic;
});
// VELLUM_PUBLIC_URL is unset by default in tests; restore after any test sets it.
afterEach(() => {
  env.VELLUM_PUBLIC_URL = undefined;
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

describe("request_funds — mint a payment request + link (#67)", () => {
  test("creates a PaymentRequest to the persona wallet and returns a /pay link", async () => {
    const e = eng();
    await provision(e);
    const out = await requestTools(e, "p").invoke("request_funds", {
      amountUsdc: 5,
      memo: "rent",
    });
    expect(out).toMatch(/\/pay\/[0-9a-f-]{36}/);

    const reqs = e.paymentRequests.listForPersona("p");
    expect(reqs).toHaveLength(1);
    expect(reqs[0]!.amount).toBe("5000000");
    expect(reqs[0]!.toAddress).toBe(e.wallets.addressFor("p")!);
    expect(reqs[0]!.memo).toBe("rent");
  });

  test("always an absolute link; VELLUM_PUBLIC_URL overrides the local origin (#84)", async () => {
    const e = eng();
    await provision(e);

    // No public URL set → still an absolute link to the local daemon origin, never
    // a bare /path (so it's clickable in chat / tappable in Telegram).
    const local = await requestTools(e, "p").invoke("request_funds", {
      amountUsdc: 1,
    });
    expect(local).toMatch(/https?:\/\/[^\s]+\/pay\//);
    expect(local).not.toContain(" /pay/");

    env.VELLUM_PUBLIC_URL = "https://bolt.example.com";
    const abs = await requestTools(e, "p").invoke("request_funds", {
      amountUsdc: 1,
    });
    expect(abs).toContain("https://bolt.example.com/pay/");
  });

  test("rejects a non-positive amount with no request created", async () => {
    const e = eng();
    await provision(e);
    const out = await requestTools(e, "p").invoke("request_funds", {
      amountUsdc: 0,
    });
    expect(out).toMatch(/positive number/);
    expect(e.paymentRequests.listForPersona("p")).toHaveLength(0);
  });
});

describe("request_vault_deposit — mint a deposit request + link (#67)", () => {
  test("creates a DepositRequest carrying the vault context and returns a /deposit link", async () => {
    const e = eng();
    await provision(e);
    const v = await e.vaults.create("p", { name: "Rent", symbol: "vRENT" });
    const out = await requestTools(e, "p").invoke("request_vault_deposit", {
      collectionId: v.collectionId,
      amountUsdc: 12,
    });
    expect(out).toMatch(/\/deposit\/[0-9a-f-]{36}/);

    const reqs = e.depositRequests.listForPersona("p");
    expect(reqs).toHaveLength(1);
    expect(reqs[0]).toMatchObject({
      collectionId: v.collectionId,
      vaultSymbol: "vRENT",
      vaultName: "Rent",
      backingAddress: "bb1backing",
      agentAddress: e.wallets.addressFor("p")!,
      amount: "12000000",
    });
  });

  test("rejects an unknown vault", async () => {
    const e = eng();
    await provision(e);
    const out = await requestTools(e, "p").invoke("request_vault_deposit", {
      collectionId: "999",
      amountUsdc: 5,
    });
    expect(out).toMatch(/No vault with collectionId 999/);
    expect(e.depositRequests.listForPersona("p")).toHaveLength(0);
  });
});

describe("request_vote — multi-sig sign-off link (#67)", () => {
  test("returns a /vote link with the threshold for a multi-sig vault", async () => {
    const e = eng();
    await provision(e);
    const v = await e.vaults.create("p", {
      name: "Treasury",
      symbol: "vTRE",
      gating: {
        multisig: {
          signers: [
            { address: "bb1a" },
            { address: "bb1b" },
            { address: "bb1c" },
          ],
          threshold: 2,
        },
      },
    });
    const out = await requestTools(e, "p").invoke("request_vote", {
      collectionId: v.collectionId,
    });
    expect(out).toContain(`/vote/${v.collectionId}`);
    expect(out).toMatch(/2-of-3 sign-off/);
  });

  test("explains there is nothing to vote on for a non-multi-sig vault", async () => {
    const e = eng();
    await provision(e);
    const v = await e.vaults.create("p", { name: "Solo", symbol: "vSOLO" });
    const out = await requestTools(e, "p").invoke("request_vote", {
      collectionId: v.collectionId,
    });
    expect(out).toMatch(/no multi-sig sign-off/);
  });
});
