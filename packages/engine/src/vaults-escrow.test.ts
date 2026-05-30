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
  fetchTokenBalance: (collectionId: string, address: string) => Promise<string>,
) {
  const m = (await generateWallet()).mnemonic;
  return createEngine({
    dbPath: ":memory:",
    embedder: null,
    mnemonic: m,
    runLoop: async () => ({ text: "", meters: [] }),
    txChain: {
      getBalances: async () => [{ denom: "ubadge", amount: "10000000" }],
      signAndBroadcast: async () => "abcd".repeat(16),
      confirmTx: async () => ({ height: 1, code: 0 }),
    },
    vault: {
      defaultManager: "bb1zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zql3w7",
      confirmTx: async () => ({ height: 9, code: 0 }),
      fetchTx: async () => fakeCreateTxEvents,
      // Per-vault escrow = the agent's holding of the collection's tokens.
      fetchTokenBalance,
    },
  });
}

describe("vault escrow tracking (#45, ADR-0003 rev)", () => {
  test("escrow() reads the AGENT's per-collection token balance (not the shared backing)", async () => {
    // The seam is keyed on (collectionId, holderAddress) — assert escrow queries
    // collection 777 against the persona's own agent wallet.
    let qCollection = "";
    let qAddress = "";
    const e = await eng(async (collectionId, address) => {
      qCollection = collectionId;
      qAddress = address;
      return "3000000"; // agent holds 3 vUSDC of this vault
    });
    grantDefaultCapabilities(e.capabilities, "p");
    e.store.createPersona("p", "Pat", { name: "Pat", role: "t", voice: "v" });
    const agent = await e.wallets.ensureWallet("p");

    const vault = await e.vaults.create("p", { name: "Rent", symbol: "vRENT" });
    expect(vault.backingAddress).toBe("bb1backing");

    const escrow = await e.vaults.escrow("p", vault.collectionId);
    expect(escrow.escrowedMicro).toBe("3000000");
    expect(escrow.holderAddress).toBe(agent.address); // the AGENT wallet
    expect(qCollection).toBe("777");
    expect(qAddress).toBe(agent.address);
    expect(escrow.denom).toBe(env.VELLUM_DENOM);
  });

  test("escrow() on an unknown vault throws", async () => {
    const e = await eng(async () => "0");
    e.store.createPersona("p", "Pat", { name: "Pat", role: "t", voice: "v" });
    await expect(e.vaults.escrow("p", "999")).rejects.toThrow("no vault");
  });
});
