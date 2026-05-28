import { describe, expect, test } from "bun:test";
import {
  buildVaultMsg,
  vaultTransferMsg,
  type CreateVaultInput,
} from "./index.ts";

const AGENT = "bb1agent0000000000000000000000000000000000";
const HUMAN = "bb1human0000000000000000000000000000000000";
const INPUT: CreateVaultInput = {
  name: "Atlas Grocery Vault",
  symbol: "vUSDC",
  description: "1:1 USDC-backed grocery vault",
  image: "https://example.com/v.png",
  managerAddress: HUMAN,
  dailyWithdrawLimit: 5,
};

function forbidden(
  perm: { permanentlyForbiddenTimes?: { start: string }[] }[],
): boolean {
  return (perm?.[0]?.permanentlyForbiddenTimes?.length ?? 0) > 0;
}

describe("buildVaultMsg — 0012 trust properties", () => {
  const msg = buildVaultMsg(AGENT, INPUT);
  const v = msg.value as Record<string, any>;

  test("it is a 1:1 USDC-backed vault collection", () => {
    expect(msg.typeUrl).toContain("MsgUniversalUpdateCollection");
    const ids = (v.collectionApprovals as { approvalId: string }[]).map(
      (a) => a.approvalId,
    );
    expect(ids).toContain("vault-deposit");
    expect(ids.some((id) => id.startsWith("vault-withdraw"))).toBe(true);
  });

  test("agent is the creator (signer)", () => {
    expect(v.creator).toBe(AGENT);
  });

  test("HUMAN is the manager and the agent has ZERO manager capability", () => {
    expect(v.manager).toBe(HUMAN);
    // canUpdateManager is permanently forbidden → the manager is frozen at
    // creation; the agent (creator) can never reassign or assume it.
    expect(forbidden(v.collectionPermissions.canUpdateManager)).toBe(true);
  });

  test("guardrails target the agent, NOT recipients (vault is siloed)", () => {
    // The withdrawal approval unwraps to the backing path — there is no recipient
    // allowlist (vendors take base USDC; gating the wrapped token is meaningless).
    const withdraw = (
      v.collectionApprovals as { approvalId: string; toListId: string }[]
    ).find((a) => a.approvalId.startsWith("vault-withdraw"))!;
    // toListId is the unwrap/backing target, not a curated recipient set.
    expect(typeof withdraw.toListId).toBe("string");
    expect(withdraw.toListId).not.toBe(HUMAN);
  });
});

describe("vaultTransferMsg — 0013 back/unback (validated live)", () => {
  const BACKING = "bb1backing000000000000000000000000000000000";

  test("withdraw = vault tokens TO the backing address, prioritizing the withdraw approval", () => {
    const msg = vaultTransferMsg({
      agentAddress: AGENT,
      collectionId: "138",
      from: AGENT,
      to: BACKING,
      amount: "1000000",
      approvalId: "vault-withdraw-abc",
    });
    expect(msg.typeUrl).toBe("/tokenization.MsgTransferTokens");
    const t = (msg.value.transfers as any[])[0];
    expect(t.from).toBe(AGENT);
    expect(t.toAddresses).toEqual([BACKING]);
    expect(t.balances[0].amount).toBe("1000000");
    expect(t.prioritizedApprovals[0].approvalId).toBe("vault-withdraw-abc");
    expect(t.onlyCheckPrioritizedCollectionApprovals).toBe(true);
  });

  test("deposit = FROM the backing address, prioritizing vault-deposit", () => {
    const msg = vaultTransferMsg({
      agentAddress: AGENT,
      collectionId: "138",
      from: BACKING,
      to: AGENT,
      amount: "2000000",
      approvalId: "vault-deposit",
    });
    const t = (msg.value.transfers as any[])[0];
    expect(t.from).toBe(BACKING);
    expect(t.toAddresses).toEqual([AGENT]);
    expect(t.prioritizedApprovals[0].approvalId).toBe("vault-deposit");
  });
});

describe("vault gating compiler (#45 slice 2)", () => {
  const findWithdraw = (msg: { value: Record<string, any> }) =>
    msg.value.collectionApprovals.find((a: any) =>
      a.approvalId.startsWith("vault-withdraw"),
    );

  test("amount + period → per-initiated approvalAmounts with the right reset interval", () => {
    const msg = buildVaultMsg(AGENT, {
      ...INPUT,
      dailyWithdrawLimit: undefined,
      gating: { amount: { limitUsd: 25, period: "weekly" } },
    });
    const wd = findWithdraw(msg);
    const aa = wd.approvalCriteria.approvalAmounts;
    expect(aa.perInitiatedByAddressApprovalAmount).toBe("25000000"); // 25 USDC µ
    expect(aa.amountTrackerId).toBe("withdrawal-weekly");
    expect(aa.resetTimeIntervals.intervalLength).toBe("604800000"); // 7d ms
  });

  test("time.unlockAt → withdrawal transferTimes start at the unlock", () => {
    const unlockAt = 2_000_000_000_000;
    const msg = buildVaultMsg(AGENT, {
      ...INPUT,
      dailyWithdrawLimit: undefined,
      gating: { time: { unlockAt } },
    });
    const wd = findWithdraw(msg);
    expect(wd.transferTimes[0].start).toBe(String(unlockAt));
    expect(wd.transferTimes[0].end).toBe("18446744073709551615");
  });

  test("gating supersedes the legacy dailyWithdrawLimit (no SDK daily cap)", () => {
    // With gating set, the SDK's daily cap must NOT also be applied.
    const msg = buildVaultMsg(AGENT, {
      ...INPUT,
      dailyWithdrawLimit: 5,
      gating: { amount: { limitUsd: 100, period: "monthly" } },
    });
    const wd = findWithdraw(msg);
    expect(wd.approvalCriteria.approvalAmounts.amountTrackerId).toBe(
      "withdrawal-monthly",
    );
    expect(
      wd.approvalCriteria.approvalAmounts.perInitiatedByAddressApprovalAmount,
    ).toBe("100000000");
  });
});

describe("multisig gating via votingChallenges (#45 slice 3)", () => {
  const findWithdraw = (msg: { value: Record<string, any> }) =>
    msg.value.collectionApprovals.find((a: any) =>
      a.approvalId.startsWith("vault-withdraw"),
    );

  test("multisig → a votingChallenge with quorum + voters + resetAfterExecution", () => {
    const msg = buildVaultMsg(AGENT, {
      ...INPUT,
      dailyWithdrawLimit: undefined,
      gating: {
        multisig: {
          signers: [
            { address: "bb1signerA" },
            { address: "bb1signerB", weight: 2 },
          ],
          threshold: 2,
          challengeDelayMs: 3600000,
        },
      },
    });
    const vc = findWithdraw(msg).approvalCriteria.votingChallenges[0];
    expect(vc.quorumThreshold).toBe("2");
    expect(vc.resetAfterExecution).toBe(true);
    expect(vc.delayAfterQuorum).toBe("3600000");
    expect(vc.voters).toEqual([
      { address: "bb1signerA", weight: "1" },
      { address: "bb1signerB", weight: "2" },
    ]);
  });

  test("multisig composes with an amount cap", () => {
    const msg = buildVaultMsg(AGENT, {
      ...INPUT,
      dailyWithdrawLimit: undefined,
      gating: {
        amount: { limitUsd: 50, period: "weekly" },
        multisig: { signers: [{ address: "bb1s" }], threshold: 1 },
      },
    });
    const c = findWithdraw(msg).approvalCriteria;
    expect(c.approvalAmounts.amountTrackerId).toBe("withdrawal-weekly");
    expect(c.votingChallenges[0].quorumThreshold).toBe("1");
  });
});
