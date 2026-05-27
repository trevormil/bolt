import { describe, expect, mock, test } from "bun:test";
import { assertIsDeliverTxSuccess } from "@cosmjs/stargate";

// Stub the signing client so sendCoins runs without a network, returning a
// FAILED DeliverTx (code != 0). sendCoins must throw (finding 2) — keep the real
// assertIsDeliverTxSuccess so the guard behaves as in production.
mock.module("@cosmjs/stargate", () => ({
  assertIsDeliverTxSuccess,
  StargateClient: {
    connect: async () => ({ getAllBalances: async () => [], disconnect() {} }),
  },
  SigningStargateClient: {
    connectWithSigner: async () => ({
      sendTokens: async () => ({
        code: 5,
        transactionHash: "FAILEDHASH",
        rawLog: "insufficient funds",
        height: 1,
        events: [],
        gasUsed: 0n,
        gasWanted: 0n,
      }),
      disconnect() {},
    }),
  },
}));

describe("sendCoins success assertion", () => {
  test("throws when the tx is included but code != 0", async () => {
    const { sendCoins } = await import("./client.ts");
    const mnemonic =
      "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
    await expect(sendCoins(mnemonic, "bb1recipient", "1")).rejects.toThrow();
  });
});
