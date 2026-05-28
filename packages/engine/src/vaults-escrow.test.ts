import { describe, expect, test } from "bun:test";
import { generateWallet } from "@vellum/chain";
import { env } from "@vellum/shared";
import { createEngine, grantDefaultCapabilities } from "./index.ts";

// A confirmed create-vault tx whose events parse to backingAddress "bb1backing"
// (same shape the web tests use).
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

async function eng(
  fetchBalances: (
    a: string,
  ) => Promise<readonly { denom: string; amount: string }[]>,
) {
  const m = (await generateWallet()).mnemonic;
  return createEngine({
    dbPath: ":memory:",
    embedder: null,
    mnemonic: m,
    runLoop: async () => ({ text: "", meters: [] }),
    // Wallet balance reads (the test seam VaultService.escrow also reads).
    getBalances: fetchBalances,
    vault: {
      defaultManager: "bb1human000000000000000000000000000000000",
      createVault: async () => ({ txHash: "VAULTCREATE1" }),
      confirmTx: async () => ({ height: 9, code: 0 }),
      fetchTx: async () => fakeCreateTxEvents,
    },
  });
}

describe("vault escrow tracking (#45, ADR-0003 slice 1)", () => {
  test("escrow() reads the BACKING address balance, not the agent wallet", async () => {
    // Distinct balances per address prove escrow targets the backing address.
    const byAddress: Record<string, string> = { bb1backing: "4200000" };
    const e = await eng(async (addr) => [
      { denom: env.VELLUM_DENOM, amount: byAddress[addr] ?? "0" },
    ]);
    grantDefaultCapabilities(e.capabilities, "p");
    e.store.createPersona("p", "Pat", {
      name: "Pat",
      role: "t",
      voice: "v",
    });
    await e.wallets.ensureWallet("p");

    const vault = await e.vaults.create("p", { name: "Rent", symbol: "vRENT" });
    expect(vault.backingAddress).toBe("bb1backing");

    const escrow = await e.vaults.escrow("p", vault.collectionId);
    expect(escrow.backingAddress).toBe("bb1backing");
    expect(escrow.escrowedMicro).toBe("4200000"); // the backing address's USDC
    expect(escrow.denom).toBe(env.VELLUM_DENOM);
  });

  test("escrow() on an unknown vault throws", async () => {
    const e = await eng(async () => []);
    e.store.createPersona("p", "Pat", { name: "Pat", role: "t", voice: "v" });
    await expect(e.vaults.escrow("p", "999")).rejects.toThrow("no vault");
  });
});
