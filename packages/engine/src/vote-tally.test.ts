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

  test("adversarial yesWeight values can NEVER push quorumMet beyond intended (#102.1)", () => {
    // Before the fix, `Number("1e3") || 0` returned 1000 — a single weight-1
    // voter contributed 1 * 1000/100 = 10 to yesWeight and cleared ANY
    // threshold ≤ 10. The chain should keep yesWeight in [0,100] but this is
    // the consumer's quorum decision; we must clamp + reject non-canonical
    // strings regardless of what the chain returned.
    const adversarial = [
      "1e3", // scientific → would be 1000
      "1e1000", // huge scientific
      "1000", // out-of-range integer
      "Infinity",
      "NaN",
      "+50", // signed
      "50.5", // decimal
      "0x32", // hex 50
      " 100", // leading space
      "100 ", // trailing space
      "", // empty
    ];
    for (const yw of adversarial) {
      const t = voteTally(ms, [vp("bb1a", yw), vp("bb1b", yw)]);
      // Each adversarial value falls back to 0 → no yes-weight contribution →
      // quorum never met.
      expect({ yw, yesWeight: t.yesWeight, quorumMet: t.quorumMet }).toEqual({
        yw,
        yesWeight: 0,
        quorumMet: false,
      });
    }
    // 100 alone is canonical → behaves normally.
    expect(
      voteTally(ms, [vp("bb1a", "100"), vp("bb1b", "100")]).quorumMet,
    ).toBe(true);
  });

  test("integer microweight comparison avoids the 3 × 0.33 boundary fuzz (#102.1)", () => {
    // 33% from three signers should NOT round to threshold 1 via float drift.
    // 3 × 0.33 = 0.99 (microweight 99), not 1. quorumMet must be FALSE.
    const t = voteTally(
      {
        signers: [{ address: "a" }, { address: "b" }, { address: "c" }],
        threshold: 1,
      },
      [vp("a", "33"), vp("b", "33"), vp("c", "33")],
    );
    expect(t.quorumMet).toBe(false);
    expect(t.yesWeight).toBeLessThan(1);
  });
});
