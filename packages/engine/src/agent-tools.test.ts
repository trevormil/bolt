import { beforeEach, describe, expect, test } from "bun:test";
import { generateWallet } from "@vellum/chain";
import { TEST_BB1 } from "@vellum/tx";
import {
  createEngine,
  vaultTools,
  balanceTools,
  type Engine,
} from "./index.ts";

// A fake create-vault tx whose events parse to a VaultRef (mirrors server.test).
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
              { approvalId: "vault-deposit", toListId: "!bb1backing" },
              { approvalId: "vault-withdraw-x", toListId: "bb1backing" },
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
function eng(): Engine {
  return createEngine({
    dbPath: ":memory:",
    embedder: null,
    mnemonic,
    runLoop: async () => ({ text: "", meters: [] }),
    vault: {
      defaultManager: "bb1human",
      createVault: async () => ({ txHash: "VAULTCREATE1" }),
      confirmTx: async () => ({ height: 9, code: 0 }),
      fetchTx: async () => fakeCreateTxEvents,
      fetchTokenBalance: async () => "2000000", // 2 vUSDC escrowed (for reads)
    },
  });
}

describe("vaultTools capability gating (#37)", () => {
  test("create_vault denied without the 'vault.create' grant", async () => {
    const e = eng();
    const out = await vaultTools(e, "p").invoke("create_vault", {
      name: "Rent",
      symbol: "vRENT",
    });
    expect(out).toContain("Denied");
  });

  test("create_vault proceeds with a standing grant", async () => {
    const e = eng();
    await e.wallets.ensureWallet("p"); // vault create needs the persona's signer
    e.capabilities.grant({
      personaId: "p",
      capability: "vault.create",
      scope: null,
      mode: "allow",
    });
    const out = await vaultTools(e, "p").invoke("create_vault", {
      name: "Rent",
      symbol: "vRENT",
    });
    expect(out).toContain("Created vault");
  });

  test("withdraw_from_vault denied without the 'vault.withdraw' grant", async () => {
    const e = eng();
    const out = await vaultTools(e, "p").invoke("withdraw_from_vault", {
      collectionId: "777",
      amountUsdc: 1,
    });
    expect(out).toContain("Denied");
  });
});

describe("vault tool_call telemetry (#42)", () => {
  test("a successful create_vault emits a tool_call event (ok, vault source)", async () => {
    const e = eng();
    await e.wallets.ensureWallet("p");
    e.capabilities.grant({
      personaId: "p",
      capability: "vault.create",
      scope: null,
      mode: "allow",
    });
    await vaultTools(e, "p").invoke("create_vault", {
      name: "Rent",
      symbol: "vRENT",
    });
    const ev = e.events
      .recent("p")
      .find(
        (x) => x.kind === "tool_call" && x.summary === "vault:create_vault",
      );
    expect(ev).toBeTruthy();
    expect(ev!.ok).toBe(true);
    expect(ev!.meta).toMatchObject({ tool: "create_vault", source: "vault" });
  });

  test("a denied vault tool records a blocked attempt (tool_call, ok=false)", async () => {
    const e = eng();
    await vaultTools(e, "p").invoke("withdraw_from_vault", {
      collectionId: "777",
      amountUsdc: 1,
    });
    const ev = e.events
      .recent("p")
      .find(
        (x) =>
          x.kind === "tool_call" && x.summary === "vault:withdraw_from_vault",
      );
    expect(ev).toBeTruthy();
    expect(ev!.ok).toBe(false);
    expect(ev!.meta).toMatchObject({ source: "vault" });
  });
});

describe("balance read/awareness tools (#88)", () => {
  test("recent_activity reads the persona's ledger, newest-first", async () => {
    const e = eng();
    expect(await balanceTools(e, "p").invoke("recent_activity", {})).toContain(
      "No activity",
    );
    e.ledger.recordAgentRun("p", "chat · hello world", [
      {
        model: "m",
        tier: "cheap",
        promptTokens: 1,
        completionTokens: 1,
        totalTokens: 2,
        costUsd: 0.001,
        ms: 1,
      },
    ]);
    const out = await balanceTools(e, "p").invoke("recent_activity", {
      limit: 5,
    });
    expect(out).toContain("hello world");
  });

  test("vault_details surfaces escrow + the withdrawal rule", async () => {
    const e = eng();
    await e.wallets.ensureWallet("p");
    e.capabilities.grant({
      personaId: "p",
      capability: "vault.create",
      scope: null,
      mode: "allow",
    });
    await vaultTools(e, "p").invoke("create_vault", {
      name: "Rent",
      symbol: "vRENT",
      withdrawLimit: 5,
      withdrawPeriod: "daily",
    });
    // Inject a fake usage tracker (#94) — 2 USDC used of the 5/day cap — so the
    // test stays offline and asserts the remaining-allowance math.
    const tools = balanceTools(e, "p", {
      approvalTracker: async () => ({
        numTransfers: "1",
        amount: "2000000",
        lastUpdatedAt: "0",
      }),
    });
    const out = await tools.invoke("vault_details", { collectionId: "777" });
    expect(out).toContain("vRENT");
    expect(out).toContain("escrowed");
    expect(out).toContain("5 USDC per daily");
    expect(out).toContain("3.00 of 5 USDC left to withdraw this daily");
    expect(
      await tools.invoke("vault_details", { collectionId: "999" }),
    ).toContain("No vault");
  });

  test("vault_details surfaces 'escrow unknown — chain unreachable' when fetchTokenBalance returns null (#104 §1)", async () => {
    // The honest-trust regression — when the LCD is unreachable the tool MUST
    // NOT lie to the agent that the vault is empty. The agent would otherwise
    // tell the user to top up an already-funded vault.
    const e = createEngine({
      dbPath: ":memory:",
      embedder: null,
      mnemonic,
      runLoop: async () => ({ text: "", meters: [] }),
      txChain: {
        getBalances: async () => [{ denom: "ubadge", amount: "0" }],
        signAndBroadcast: async () => "h",
        confirmTx: async () => ({ height: 1, code: 0 }),
      },
      vault: {
        defaultManager: "bb1human",
        createVault: async () => ({ txHash: "VAULTCREATE1" }),
        confirmTx: async () => ({ height: 9, code: 0 }),
        fetchTx: async () => fakeCreateTxEvents,
        fetchTokenBalance: async () => null, // LCD unreachable
      },
    });
    await e.wallets.ensureWallet("p");
    e.capabilities.grant({
      personaId: "p",
      capability: "vault.create",
      scope: null,
      mode: "allow",
    });
    await vaultTools(e, "p").invoke("create_vault", {
      name: "Rent",
      symbol: "vRENT",
    });
    const out = await balanceTools(e, "p").invoke("vault_details", {
      collectionId: "777",
    });
    expect(out).toContain("escrow unknown — chain unreachable");
    expect(out).not.toMatch(/0\.00 USDC escrowed/);
  });

  test("vault_details subtracts in-flight withdraws from the displayed remaining allowance (#104 §2)", async () => {
    // Use a gated txChain that NEVER resolves confirmTx — the withdraw row
    // stays "pending" so vault_details can observe an unsettled in-flight
    // withdraw vs. tracker still reading zero on-chain.
    const stallConfirm = new Promise<{ height: number; code: number }>(
      () => {},
    );
    const e = createEngine({
      dbPath: ":memory:",
      embedder: null,
      mnemonic,
      runLoop: async () => ({ text: "", meters: [] }),
      txChain: {
        getBalances: async () => [{ denom: "ubadge", amount: "0" }],
        signAndBroadcast: async () => "h",
        confirmTx: async () => stallConfirm,
      },
      vault: {
        defaultManager: "bb1human",
        createVault: async () => ({ txHash: "VAULTCREATE1" }),
        confirmTx: async () => ({ height: 9, code: 0 }),
        fetchTx: async () => fakeCreateTxEvents,
        fetchTokenBalance: async () => "0",
      },
    });
    await e.wallets.ensureWallet("p");
    e.capabilities.grant({
      personaId: "p",
      capability: "vault.create",
      scope: null,
      mode: "allow",
    });
    e.capabilities.grant({
      personaId: "p",
      capability: "vault.withdraw",
      scope: null,
      mode: "allow",
    });
    await vaultTools(e, "p").invoke("create_vault", {
      name: "Rent",
      symbol: "vRENT",
      withdrawLimit: 10,
      withdrawPeriod: "daily",
    });
    // Withdraw 5 USDC — submit returns the PENDING tx; confirm stalls so the
    // row stays unsettled. The chain tracker still reads zero (pre-confirm).
    void e.vaults.withdraw("p", "777", "5000000");
    // Wait a tick so the tx row lands in the durable store.
    await new Promise((r) => setTimeout(r, 30));
    const tools = balanceTools(e, "p", {
      approvalTracker: async () => ({
        numTransfers: "0",
        amount: "0",
        lastUpdatedAt: "0",
      }),
    });
    const out = await tools.invoke("vault_details", { collectionId: "777" });
    expect(out).toContain("5.00 of 10 USDC left");
    expect(out).toContain("5.00 USDC of withdraws still confirming");
    expect(out).not.toMatch(/10\.00 of 10 USDC left/);
  });

  test("vault_details surfaces 'cap unknown — chain unreachable' when the tracker read fails (#104 §3)", async () => {
    const e = eng();
    await e.wallets.ensureWallet("p");
    e.capabilities.grant({
      personaId: "p",
      capability: "vault.create",
      scope: null,
      mode: "allow",
    });
    await vaultTools(e, "p").invoke("create_vault", {
      name: "Rent",
      symbol: "vRENT",
      withdrawLimit: 5,
      withdrawPeriod: "daily",
    });
    const tools = balanceTools(e, "p", {
      approvalTracker: async () => {
        throw new Error("LCD unreachable");
      },
    });
    const out = await tools.invoke("vault_details", { collectionId: "777" });
    expect(out).toContain("Remaining cap unknown — chain unreachable");
  });

  test("request_status lists outstanding payment + deposit requests (#94)", async () => {
    const e = eng();
    expect(await balanceTools(e, "p").invoke("request_status", {})).toContain(
      "No outstanding",
    );
    e.paymentRequests.create({
      personaId: "p",
      toAddress: TEST_BB1.DEST,
      denom: "ibc/TESTUSDC",
      amount: "5000000",
      memo: "rent",
    });
    const out = await balanceTools(e, "p").invoke("request_status", {});
    expect(out).toContain("payment request");
    expect(out).toContain("rent");
  });
});
