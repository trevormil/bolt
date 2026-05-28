import { beforeEach, describe, expect, test } from "bun:test";
import { generateWallet } from "@vellum/chain";
import { createEngine, vaultTools, type Engine } from "./index.ts";

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
