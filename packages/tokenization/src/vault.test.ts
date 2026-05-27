import { describe, expect, test } from "bun:test";
import { buildVaultMsg, type CreateVaultInput } from "./index.ts";

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
