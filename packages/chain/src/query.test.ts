import { describe, expect, test } from "bun:test";
import { _codec } from "./query.ts";

const { field, message, decode, str, bytesList, decodeVoteProof } = _codec;

// Embed a sub-message as a length-delimited field (wiretype 2). Valid for our
// small (<128-byte) test messages, where both the tag and the length are a single
// varint byte — enough to synthesize the exact wire shape the chain returns
// (votes / amounts are repeated embedded messages).
const embed = (num: number, sub: Uint8Array): number[] => [
  (num << 3) | 2,
  sub.length,
  ...sub,
];

describe("@vellum/chain protobuf codec (#83/#94 chain reads)", () => {
  test("string fields round-trip; empty (blank approver) is omitted", () => {
    const buf = message(field(1, "777"), field(3, ""), field(4, "appr"));
    const f = decode(buf);
    expect(str(f, 1)).toBe("777");
    expect(str(f, 3)).toBe(""); // omitted on the wire → default "" on decode
    expect(str(f, 4)).toBe("appr");
    expect(f.has(3)).toBe(false); // proved the blank approver emits no bytes
  });

  test("decodes a repeated-VoteProof response with the proto field numbers", () => {
    // QueryGetVotesResponse { repeated VoteProof votes = 1 }
    // VoteProof { proposalId=1, voter=2, yesWeight=3, votedAt=4 }
    const yes = message(
      field(1, "vault-withdraw-vote"),
      field(2, "bb1alice"),
      field(3, "100"),
      field(4, "1700000000000"),
    );
    const no = message(
      field(1, "vault-withdraw-vote"),
      field(2, "bb1bob"),
      field(3, "0"),
      field(4, "1700000000001"),
    );
    const resp = new Uint8Array([...embed(1, yes), ...embed(1, no)]);
    const votes = bytesList(decode(resp), 1).map(decodeVoteProof);
    expect(votes).toHaveLength(2);
    expect(votes[0]).toMatchObject({
      proposalId: "vault-withdraw-vote",
      voter: "bb1alice",
      yesWeight: "100",
    });
    expect(votes[1]!.voter).toBe("bb1bob");
    expect(votes[1]!.yesWeight).toBe("0");
  });

  test("decodes ApprovalTracker → first Balance amount", () => {
    // ApprovalTracker { numTransfers=1, repeated Balance amounts=2, lastUpdatedAt=3 }
    // Balance { amount=1, ... }
    const balance = message(field(1, "3000000"));
    const tracker = new Uint8Array([
      ...field(1, "2"), // numTransfers
      ...embed(2, balance), // amounts[0]
      ...field(3, "1700000000000"), // lastUpdatedAt
    ]);
    // QueryGetApprovalTrackerResponse { ApprovalTracker tracker = 1 }
    const resp = new Uint8Array([...embed(1, tracker)]);
    const t = decode(bytesList(decode(resp), 1)[0]!);
    expect(str(t, 1)).toBe("2");
    const amount = str(decode(bytesList(t, 2)[0]!), 1);
    expect(amount).toBe("3000000");
  });

  // Property/fuzz hardening (#90): a wrong tally read = a wrong quorum, so the
  // codec must round-trip ANY field values exactly — including empty (proto3
  // omission), multi-byte UTF-8, and long strings that force a multi-byte varint
  // length prefix (the >127-byte path the example tests don't reach).
  describe("VoteProof round-trip fuzz", () => {
    const POOL = [..."abcXYZ0123 !@#/-_.", ..."你好こんにちは", ..."🚀🔒ñé"];
    const randStr = (maxLen: number): string => {
      const len = Math.floor(Math.random() * maxLen);
      let s = "";
      for (let i = 0; i < len; i++)
        s += POOL[Math.floor(Math.random() * POOL.length)];
      return s; // built from whole code points → always valid UTF-16
    };

    test("encode(field 1-4) → decodeVoteProof preserves every field", () => {
      for (let i = 0; i < 500; i++) {
        const v = {
          proposalId: randStr(40),
          voter: randStr(50),
          yesWeight: String(Math.floor(Math.random() * 101)), // 0–100 percent
          votedAt: randStr(20),
        };
        const buf = message(
          field(1, v.proposalId),
          field(2, v.voter),
          field(3, v.yesWeight),
          field(4, v.votedAt),
        );
        // proto3 omits empty strings on the wire → they decode back to "".
        expect(decodeVoteProof(buf)).toEqual(v);
      }
    });

    test("forces the multi-byte varint length path (strings > 127 bytes)", () => {
      const longVoter = "bb1" + "z".repeat(300); // > 127 bytes → 2-byte length
      const buf = message(field(1, "p"), field(2, longVoter), field(3, "100"));
      expect(decodeVoteProof(buf)).toMatchObject({
        voter: longVoter,
        yesWeight: "100",
      });
    });
  });
});
