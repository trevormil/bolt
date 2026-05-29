import { StargateClient, QueryClient } from "@cosmjs/stargate";
import { env } from "@vellum/shared";

// Self-contained chain reads for the tokenization Query service (#83/#94),
// over the EXISTING public Tendermint RPC via cosmjs's ABCI query — NO REST
// gateway (which 301-collapses the empty collection-level `approverAddress`
// segment) and NO new gRPC endpoint. We hand-roll a tiny protobuf wire codec for
// exactly the messages we need (all strings + one nested Balance) so we don't
// depend on the bitbadges SDK's un-exported generated types. ADR-0006 / the
// chain-read spike.
//
// approverAddress is "" for collection-level approvals (vault gating lives in
// collectionApprovals); over protobuf that's just an omitted default field — the
// thing the REST gateway couldn't express.

// ── minimal protobuf (proto3) wire codec ─────────────────────────────────────
function encodeVarint(n: number): number[] {
  const out: number[] = [];
  do {
    let b = n & 0x7f;
    n = Math.floor(n / 128);
    if (n) b |= 0x80;
    out.push(b);
  } while (n);
  return out;
}
// Encode a string field (proto3 omits empty/default — so "" emits nothing, which
// is exactly how we send a blank collection-level approverAddress).
function field(num: number, s: string): number[] {
  if (!s) return [];
  const bytes = Array.from(new TextEncoder().encode(s));
  return [
    ...encodeVarint((num << 3) | 2),
    ...encodeVarint(bytes.length),
    ...bytes,
  ];
}
function message(...fields: number[][]): Uint8Array {
  return new Uint8Array(([] as number[]).concat(...fields));
}

type Decoded = Map<number, Array<number | Uint8Array>>;
function decode(buf: Uint8Array): Decoded {
  const fields: Decoded = new Map();
  let i = 0;
  const varint = (): number => {
    let r = 0;
    let s = 0;
    let b: number;
    do {
      b = buf[i++]!;
      r += (b & 0x7f) * 2 ** s;
      s += 7;
    } while (b & 0x80);
    return r;
  };
  while (i < buf.length) {
    const tag = varint();
    const num = Math.floor(tag / 8);
    const wt = tag % 8;
    let val: number | Uint8Array;
    if (wt === 0) val = varint();
    else if (wt === 2) {
      const len = varint();
      val = buf.subarray(i, i + len);
      i += len;
    } else if (wt === 1) {
      val = 0;
      i += 8;
    } else if (wt === 5) {
      val = 0;
      i += 4;
    } else throw new Error(`unsupported protobuf wiretype ${wt}`);
    const arr = fields.get(num);
    if (arr) arr.push(val);
    else fields.set(num, [val]);
  }
  return fields;
}
function str(f: Decoded, num: number): string {
  const v = f.get(num)?.[0];
  return v instanceof Uint8Array ? new TextDecoder().decode(v) : "";
}
function bytesList(f: Decoded, num: number): Uint8Array[] {
  return (f.get(num) ?? []).filter(
    (v): v is Uint8Array => v instanceof Uint8Array,
  );
}

// ── message shapes (subset we need) ──────────────────────────────────────────
export interface VoteProof {
  proposalId: string;
  voter: string;
  yesWeight: string; // 0–100 percent allocated to "yes"
  votedAt: string;
}
export interface ApprovalTrackerView {
  numTransfers: string;
  amount: string; // amounts[0].amount (single-asset vaults); "0" if none
  lastUpdatedAt: string;
}

function decodeVoteProof(buf: Uint8Array): VoteProof {
  const f = decode(buf);
  return {
    proposalId: str(f, 1),
    voter: str(f, 2),
    yesWeight: str(f, 3),
    votedAt: str(f, 4),
  };
}

// ── ABCI query plumbing (cached comet client over env.BITBADGES_RPC) ──────────
let cached: Promise<QueryClient> | null = null;
async function client(): Promise<QueryClient> {
  if (!cached)
    cached = StargateClient.connect(env.BITBADGES_RPC).then((sg) =>
      QueryClient.withExtensions(
        (
          sg as unknown as { forceGetCometClient(): never }
        ).forceGetCometClient(),
      ),
    );
  return cached;
}
async function abci(path: string, request: Uint8Array): Promise<Uint8Array> {
  const qc = await client();
  const raw = (await (
    qc as unknown as {
      queryAbci(
        p: string,
        r: Uint8Array,
      ): Promise<{ value: Uint8Array } | Uint8Array>;
    }
  ).queryAbci(path, request)) as { value?: Uint8Array } | Uint8Array;
  return raw instanceof Uint8Array ? raw : (raw.value ?? new Uint8Array());
}

const Q = "/tokenization.Query";

/**
 * All votes cast on a proposal for an approval. approverAddress is "" for
 * collection-level (vault) approvals. Returns [] when none cast (the plural
 * get_votes never errors on empty, unlike singular get_vote).
 */
export async function getVotes(args: {
  collectionId: string;
  approvalId: string;
  proposalId: string;
  approvalLevel?: string;
  approverAddress?: string;
}): Promise<VoteProof[]> {
  const req = message(
    field(1, args.collectionId),
    field(2, args.approvalLevel ?? "collection"),
    field(3, args.approverAddress ?? ""),
    field(4, args.approvalId),
    field(5, args.proposalId),
  );
  const resp = await abci(`${Q}/GetVotes`, req);
  // QueryGetVotesResponse { repeated VoteProof votes = 1; }
  return bytesList(decode(resp), 1).map(decodeVoteProof);
}

/**
 * An approval's usage tracker (#94) — `amount` is the cumulative amount used in
 * the current period for (amountTrackerId, trackerType, approvedAddress).
 * Vault per-period caps are tracked per `initiatedBy` (the agent), so
 * trackerType="initiatedBy", approvedAddress=<agent address>. Returns null when
 * the tracker doesn't exist yet (nothing used).
 */
export async function getApprovalTracker(args: {
  collectionId: string;
  approvalId: string;
  amountTrackerId: string;
  trackerType: string;
  approvedAddress: string;
  approvalLevel?: string;
  approverAddress?: string;
}): Promise<ApprovalTrackerView | null> {
  const req = message(
    field(1, args.amountTrackerId),
    field(2, args.approvalLevel ?? "collection"),
    field(3, args.approverAddress ?? ""),
    field(4, args.trackerType),
    field(5, args.collectionId),
    field(6, args.approvedAddress),
    field(7, args.approvalId),
  );
  let resp: Uint8Array;
  try {
    resp = await abci(`${Q}/GetApprovalTracker`, req);
  } catch {
    return null; // not-found / no usage yet
  }
  // QueryGetApprovalTrackerResponse { ApprovalTracker tracker = 1; }
  const trackerBytes = bytesList(decode(resp), 1)[0];
  if (!trackerBytes) return null;
  const t = decode(trackerBytes);
  // ApprovalTracker { numTransfers=1, repeated Balance amounts=2, lastUpdatedAt=3 }
  // Balance { amount=1, ... } — read the first balance's amount (single-asset vault).
  const firstBalance = bytesList(t, 2)[0];
  const amount = firstBalance ? str(decode(firstBalance), 1) : "0";
  return {
    numTransfers: str(t, 1) || "0",
    amount: amount || "0",
    lastUpdatedAt: str(t, 3) || "0",
  };
}

// Exposed for unit tests (round-trip the wire codec without the network).
export const _codec = {
  field,
  message,
  decode,
  str,
  bytesList,
  decodeVoteProof,
};
