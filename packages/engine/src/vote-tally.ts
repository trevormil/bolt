import type { VoteProof } from "@vellum/chain";

// Compute a multisig vault's sign-off progress (#83) from its on-chain votes +
// its configured signers/threshold. Pure — the web route fetches the votes
// (getVotes) and the vault's gating, then calls this. A VoteProof carries
// yesWeight (0–100 % of that voter's weight allocated to "yes"); quorum is met
// when the summed yes-weight reaches the threshold (ADR-0005 one-time unlock).

export interface VoteTally {
  threshold: number;
  totalWeight: number;
  yesWeight: number; // weighted yes cast so far
  signedCount: number; // signers who voted yes (>=50%)
  totalSigners: number;
  quorumMet: boolean;
  signers: {
    address: string;
    weight: number;
    vote: "yes" | "no" | "pending";
  }[];
}

// Parse + clamp yesWeight at the consumer boundary (#102). The chain *should*
// keep yesWeight in [0, 100] (it's a percent), but this is the agent's QUORUM
// decision — we don't trust the raw return value absolutely. The previous
// `Number(v.yesWeight) || 0` accepted "1e3" → 1000, letting a single weight-1
// voter contribute 1 * 1000/100 = 10 to yesWeight and clear any threshold ≤ 10.
// We reject non-canonical strings (anything that isn't an integer percent
// 0..100) and floor what survives to integer percent.
function parseYesWeight(raw: unknown): number {
  if (typeof raw !== "string") return 0;
  if (!/^(100|[0-9]{1,2})$/.test(raw)) return 0;
  const n = Number(raw);
  return Math.max(0, Math.min(100, Math.floor(n)));
}

export function voteTally(
  multisig: {
    signers: { address: string; weight?: number }[];
    threshold: number;
  },
  votes: VoteProof[],
): VoteTally {
  const byVoter = new Map(
    votes.map((v) => [v.voter, parseYesWeight(v.yesWeight)]),
  );
  const signers = multisig.signers.map((s) => {
    const weight = s.weight ?? 1;
    const cast = byVoter.get(s.address);
    const vote: "yes" | "no" | "pending" =
      cast === undefined ? "pending" : cast >= 50 ? "yes" : "no";
    return { address: s.address, weight, vote };
  });
  const totalWeight = signers.reduce((n, s) => n + s.weight, 0);
  // Integer microweight comparison avoids the 3 × 0.33 = 0.9900…1 boundary
  // (#102.1): each signer's yes contribution is (weight * pct_micro) where
  // pct_micro is integer 0..100. We compare 100×yesWeight to 100×threshold so
  // the math stays in integer space.
  const yesWeightMicro = signers.reduce(
    (n, s) =>
      n +
      (byVoter.has(s.address) ? s.weight * (byVoter.get(s.address) ?? 0) : 0),
    0,
  );
  const yesWeight = yesWeightMicro / 100;
  return {
    threshold: multisig.threshold,
    totalWeight,
    yesWeight,
    signedCount: signers.filter((s) => s.vote === "yes").length,
    totalSigners: signers.length,
    quorumMet: yesWeightMicro >= multisig.threshold * 100,
    signers,
  };
}
