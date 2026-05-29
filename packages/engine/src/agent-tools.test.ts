import { beforeEach, describe, expect, test } from "bun:test";
import { generateWallet } from "@vellum/chain";
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
    const out = await balanceTools(e, "p").invoke("vault_details", {
      collectionId: "777",
    });
    expect(out).toContain("vRENT");
    expect(out).toContain("escrowed");
    expect(out).toContain("5 USDC per daily");
    expect(
      await balanceTools(e, "p").invoke("vault_details", {
        collectionId: "999",
      }),
    ).toContain("No vault");
  });

  test("request_status lists outstanding payment + deposit requests (#94)", async () => {
    const e = eng();
    expect(await balanceTools(e, "p").invoke("request_status", {})).toContain(
      "No outstanding",
    );
    e.paymentRequests.create({
      personaId: "p",
      toAddress: "bb1" + "q".repeat(39),
      denom: "ibc/TESTUSDC",
      amount: "5000000",
      memo: "rent",
    });
    const out = await balanceTools(e, "p").invoke("request_status", {});
    expect(out).toContain("payment request");
    expect(out).toContain("rent");
  });
});
