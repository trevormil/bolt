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

export function voteTally(
  multisig: {
    signers: { address: string; weight?: number }[];
    threshold: number;
  },
  votes: VoteProof[],
): VoteTally {
  const byVoter = new Map(
    votes.map((v) => [v.voter, Number(v.yesWeight) || 0]),
  );
  const signers = multisig.signers.map((s) => {
    const weight = s.weight ?? 1;
    const cast = byVoter.get(s.address);
    const vote: "yes" | "no" | "pending" =
      cast === undefined ? "pending" : cast >= 50 ? "yes" : "no";
    return { address: s.address, weight, vote };
  });
  const totalWeight = signers.reduce((n, s) => n + s.weight, 0);
  const yesWeight = signers.reduce(
    (n, s) =>
      n +
      (byVoter.has(s.address) ? s.weight * (byVoter.get(s.address)! / 100) : 0),
    0,
  );
  return {
    threshold: multisig.threshold,
    totalWeight,
    yesWeight,
    signedCount: signers.filter((s) => s.vote === "yes").length,
    totalSigners: signers.length,
    quorumMet: yesWeight >= multisig.threshold,
    signers,
  };
}
