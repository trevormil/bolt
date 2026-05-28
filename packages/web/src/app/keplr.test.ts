import { describe, expect, test } from "bun:test";
import { vaultDepositMsg, bankSendMsg } from "./keplr.ts";

// #45 / !37 HIGH regression: a human-funded deposit must mint the vault tokens
// to the PERSONA AGENT (who withdraws within rules), not the human — otherwise a
// funded vault can never be withdrawn (the agent holds zero tokens to burn).
describe("vaultDepositMsg (#45 / !37)", () => {
  const AGENT = "bb1agent00000000000000000000000000000000";
  const HUMAN = "bb1human00000000000000000000000000000000";
  const BACKING = "bb1backing000000000000000000000000000000";

  const msg = vaultDepositMsg({
    human: HUMAN,
    agentAddress: AGENT,
    collectionId: "777",
    backingAddress: BACKING,
    amountMicro: "1000000",
  });
  const transfer = (
    msg.value as { transfers: { from: string; toAddresses: string[] }[] }
  ).transfers[0]!;

  test("the human signs (creator) but the AGENT receives the minted tokens", () => {
    expect((msg.value as { creator: string }).creator).toBe(HUMAN);
    expect(transfer.toAddresses).toEqual([AGENT]);
    expect(transfer.toAddresses).not.toContain(HUMAN);
  });

  test("mints from the backing address (1:1 backed minting)", () => {
    expect(transfer.from).toBe(BACKING);
  });

  test("deposit recipient (agent) == the wallet that later withdraws", () => {
    // VaultService.withdraw burns `from: agentAddress` → the deposit must have
    // credited that same agent wallet, or the burn has nothing to spend.
    expect(transfer.toAddresses[0]).toBe(AGENT);
  });
});

describe("bankSendMsg", () => {
  test("builds a MsgSend with the right denom + amount", () => {
    const m = bankSendMsg("bb1from", "bb1to", "500", "uusdc");
    const v = m.value as {
      fromAddress: string;
      toAddress: string;
      amount: { denom: string; amount: string }[];
    };
    expect(v.fromAddress).toBe("bb1from");
    expect(v.toAddress).toBe("bb1to");
    expect(v.amount).toEqual([{ denom: "uusdc", amount: "500" }]);
  });
});
