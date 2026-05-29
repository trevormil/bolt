import { describe, expect, test } from "bun:test";
import { voteTally } from "./vote-tally.ts";
import type { VoteProof } from "@vellum/chain";

const vp = (voter: string, yesWeight: string): VoteProof => ({
  proposalId: "vault-withdraw-vote",
  voter,
  yesWeight,
  votedAt: "1700000000000",
});

describe("voteTally (#83)", () => {
  const ms = {
    signers: [{ address: "bb1a" }, { address: "bb1b" }, { address: "bb1c" }],
    threshold: 2,
  };

  test("no votes → 0 signed, quorum not met, all pending", () => {
    const t = voteTally(ms, []);
    expect(t).toMatchObject({
      signedCount: 0,
      totalSigners: 3,
      threshold: 2,
      quorumMet: false,
    });
    expect(t.signers.every((s) => s.vote === "pending")).toBe(true);
  });

  test("two yes votes (weight 1 each) → 2 of 3 signed, quorum met", () => {
    const t = voteTally(ms, [vp("bb1a", "100"), vp("bb1b", "100")]);
    expect(t.signedCount).toBe(2);
    expect(t.quorumMet).toBe(true);
    expect(t.signers.find((s) => s.address === "bb1c")!.vote).toBe("pending");
  });

  test("a 'no' vote (yesWeight 0) counts as cast but not signed", () => {
    const t = voteTally(ms, [vp("bb1a", "100"), vp("bb1b", "0")]);
    expect(t.signedCount).toBe(1);
    expect(t.signers.find((s) => s.address === "bb1b")!.vote).toBe("no");
    expect(t.quorumMet).toBe(false); // yesWeight=1 < threshold 2
  });

  test("weighted signers: a single high-weight yes can meet quorum", () => {
    const weighted = {
      signers: [
        { address: "bb1a", weight: 3 },
        { address: "bb1b", weight: 1 },
      ],
      threshold: 2,
    };
    const t = voteTally(weighted, [vp("bb1a", "100")]);
    expect(t.yesWeight).toBe(3);
    expect(t.quorumMet).toBe(true);
    expect(t.signedCount).toBe(1);
  });
});
