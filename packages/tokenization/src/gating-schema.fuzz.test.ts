import { describe, expect, test } from "bun:test";
import { TEST_BB1 } from "@vellum/tx";
import { parseVaultGating } from "./gating-schema.ts";

// Property/fuzz hardening for vaultGatingSchema (#112 §1). The schema has 4
// nested optionals, 8+ reject branches, and three cross-field constraints
// (threshold ≤ total weight, expiresAt > unlockAt, no duplicate signers).
// Enumerated tests miss combinations — this asserts parseVaultGating agrees
// with an INDEPENDENT semantic oracle over ~2k randomized inputs (the pattern
// from packages/tx/src/validators.test.ts).
//
// Inputs classify as one of:
//   "undefined" — null/undefined input, or no policy fields engaged
//   "value"     — valid policy; parser returns the built object
//   "error"     — parser rejects with { error: ... }
// Comparing CLASSIFICATIONS (not error strings) keeps the oracle independent
// of zod's first-issue-wins ordering — a divergence is always a real bug.

const VALID_ADDRS = [
  TEST_BB1.TO1,
  TEST_BB1.TO2,
  TEST_BB1.TO3,
  TEST_BB1.DEST,
  TEST_BB1.RECIPIENT,
] as const;

const INVALID_ADDRS = [
  "0xbad",
  "bb1bad",
  "",
  // Regex-valid but checksum-broken — exercises the bech32 boundary
  TEST_BB1.TO1.slice(0, -1) + (TEST_BB1.TO1.slice(-1) === "9" ? "8" : "9"),
] as const;

const PERIODS = ["daily", "weekly", "monthly"] as const;
const BAD_PERIODS = ["hourly", "yearly", "Daily", "", "DAILY"] as const;

type Classification = "undefined" | "value" | "error";

// Independent semantic oracle — recomputes the schema invariants from scratch.
// Deliberately not imported from gating-schema.ts so divergence surfaces.
function oracleClassify(raw: unknown): Classification {
  if (raw == null) return "undefined";
  if (typeof raw !== "object" || Array.isArray(raw)) return "error";
  const obj = raw as Record<string, unknown>;
  for (const k of Object.keys(obj)) {
    if (k !== "amount" && k !== "time" && k !== "multisig") return "error";
  }
  let hasAmount = false;
  if (obj.amount !== undefined) {
    const a = obj.amount;
    if (a == null || typeof a !== "object" || Array.isArray(a)) return "error";
    const ar = a as Record<string, unknown>;
    if (
      typeof ar.limitUsd !== "number" ||
      !Number.isFinite(ar.limitUsd) ||
      ar.limitUsd <= 0
    )
      return "error";
    if (
      typeof ar.period !== "string" ||
      !(PERIODS as readonly string[]).includes(ar.period)
    )
      return "error";
    hasAmount = true;
  }
  let hasTime = false;
  if (obj.time !== undefined) {
    const t = obj.time;
    if (t == null || typeof t !== "object" || Array.isArray(t)) return "error";
    const tr = t as Record<string, unknown>;
    const u = tr.unlockAt;
    const e = tr.expiresAt;
    if (u !== undefined) {
      if (typeof u !== "number" || !Number.isFinite(u) || u < 0) return "error";
    }
    if (e !== undefined) {
      if (typeof e !== "number" || !Number.isFinite(e) || e < 0) return "error";
    }
    if (typeof u === "number" && typeof e === "number" && e <= u)
      return "error";
    if (u !== undefined || e !== undefined) hasTime = true;
  }
  let hasMultisig = false;
  if (obj.multisig !== undefined) {
    const m = obj.multisig;
    if (m == null || typeof m !== "object" || Array.isArray(m)) return "error";
    const mr = m as Record<string, unknown>;
    if (!Array.isArray(mr.signers) || mr.signers.length === 0) return "error";
    const seen = new Set<string>();
    let totalWeight = 0;
    for (const s of mr.signers) {
      if (s == null || typeof s !== "object" || Array.isArray(s))
        return "error";
      const sr = s as Record<string, unknown>;
      if (
        typeof sr.address !== "string" ||
        !(VALID_ADDRS as readonly string[]).includes(sr.address)
      )
        return "error";
      if (seen.has(sr.address)) return "error";
      seen.add(sr.address);
      let w = 1;
      if (sr.weight !== undefined) {
        if (
          typeof sr.weight !== "number" ||
          !Number.isFinite(sr.weight) ||
          sr.weight <= 0
        )
          return "error";
        w = sr.weight;
      }
      totalWeight += w;
    }
    if (
      typeof mr.threshold !== "number" ||
      !Number.isFinite(mr.threshold) ||
      mr.threshold <= 0
    )
      return "error";
    if (mr.threshold > totalWeight) return "error";
    if (mr.challengeDelayMs !== undefined) {
      if (
        typeof mr.challengeDelayMs !== "number" ||
        !Number.isFinite(mr.challengeDelayMs) ||
        mr.challengeDelayMs < 0
      )
        return "error";
    }
    hasMultisig = true;
  }
  if (!hasAmount && !hasTime && !hasMultisig) return "undefined";
  return "value";
}

function classifyResult(
  r: ReturnType<typeof parseVaultGating>,
): Classification {
  if (r === undefined) return "undefined";
  if (typeof r === "object" && r !== null && "error" in r) return "error";
  return "value";
}

// Random shape generators ----------------------------------------------------

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function genAmount(corrupt: boolean): unknown {
  if (corrupt) {
    return pick([
      { limitUsd: 0, period: "weekly" },
      { limitUsd: -5, period: "weekly" },
      { limitUsd: NaN, period: "weekly" },
      { limitUsd: "10" as unknown as number, period: "weekly" },
      { limitUsd: 10, period: pick(BAD_PERIODS) },
      { limitUsd: 10 },
      { period: "weekly" },
    ]);
  }
  return {
    limitUsd: 1 + Math.floor(Math.random() * 1000),
    period: pick(PERIODS),
  };
}

function genTime(corrupt: boolean): unknown {
  if (corrupt) {
    return pick([
      { unlockAt: -1 },
      { unlockAt: 100, expiresAt: 100 },
      { unlockAt: 200, expiresAt: 100 },
      { unlockAt: "100" as unknown as number },
      { expiresAt: NaN },
    ]);
  }
  const u = Math.floor(Math.random() * 1_000_000);
  const out: { unlockAt?: number; expiresAt?: number } = {};
  if (Math.random() < 0.5) out.unlockAt = u;
  if (Math.random() < 0.5)
    out.expiresAt = u + 1 + Math.floor(Math.random() * 1_000_000);
  return out;
}

function genSigner(
  forceCorrupt: boolean,
  usedAddrs: Set<string>,
): Record<string, unknown> {
  let addr: string;
  if (forceCorrupt && Math.random() < 0.6) {
    addr = pick(INVALID_ADDRS);
  } else if (forceCorrupt && usedAddrs.size > 0) {
    addr = [...usedAddrs][0]!; // force a duplicate
  } else {
    const pool = (VALID_ADDRS as readonly string[]).filter(
      (a) => !usedAddrs.has(a),
    );
    addr = pool.length ? pick(pool) : pick(VALID_ADDRS);
  }
  const out: Record<string, unknown> = { address: addr };
  if (Math.random() < 0.5) {
    out.weight =
      forceCorrupt && Math.random() < 0.3
        ? pick([0, -1, NaN])
        : 1 + Math.floor(Math.random() * 5);
  }
  return out;
}

function genMultisig(corrupt: boolean): unknown {
  const n = 1 + Math.floor(Math.random() * 4);
  const used = new Set<string>();
  const signers: Record<string, unknown>[] = [];
  for (let i = 0; i < n; i++) {
    const sCorrupt = corrupt && i === n - 1 && Math.random() < 0.6;
    const s = genSigner(sCorrupt, used);
    signers.push(s);
    if (typeof s.address === "string") used.add(s.address);
  }
  let totalWeight = 0;
  for (const s of signers) {
    totalWeight +=
      typeof s.weight === "number" && Number.isFinite(s.weight) && s.weight > 0
        ? s.weight
        : 1;
  }
  const obj: Record<string, unknown> = { signers };
  if (corrupt && Math.random() < 0.4) {
    obj.threshold = pick([0, -1, totalWeight + 1, totalWeight + 10]);
  } else {
    obj.threshold = 1 + Math.floor(Math.random() * Math.max(1, totalWeight));
  }
  if (Math.random() < 0.3) {
    obj.challengeDelayMs = corrupt && Math.random() < 0.4 ? -1 : 1000;
  }
  if (corrupt && Math.random() < 0.15) (signers as unknown[]).length = 0;
  return obj;
}

function genGating(corrupt: boolean): unknown {
  const obj: Record<string, unknown> = {};
  if (Math.random() < 0.6)
    obj.amount = genAmount(corrupt && Math.random() < 0.4);
  if (Math.random() < 0.6) obj.time = genTime(corrupt && Math.random() < 0.4);
  if (Math.random() < 0.6)
    obj.multisig = genMultisig(corrupt && Math.random() < 0.5);
  if (corrupt && Math.random() < 0.1) obj.unexpected = "field";
  return obj;
}

describe("parseVaultGating — property/fuzz (#112 §1)", () => {
  test("agrees with the oracle on enumerated corner cases", () => {
    const corpus: unknown[] = [
      null,
      undefined,
      "string",
      42,
      [],
      true,
      {},
      { time: {} },
      { amount: undefined, time: {} },
      { amount: { limitUsd: 5, period: "daily" } },
      { amount: { limitUsd: 5, period: "daily" }, extra: 1 },
      { multisig: { signers: [], threshold: 1 } },
      {
        multisig: {
          signers: [{ address: TEST_BB1.TO1 }, { address: TEST_BB1.TO1 }],
          threshold: 2,
        },
      },
      {
        multisig: {
          signers: [
            { address: TEST_BB1.TO1, weight: 1 },
            { address: TEST_BB1.TO2, weight: 1 },
          ],
          threshold: 3,
        },
      },
      { time: { unlockAt: 200, expiresAt: 200 } },
      { time: { unlockAt: 100, expiresAt: 50 } },
      { time: { unlockAt: -1 } },
      { time: { expiresAt: NaN } },
      {
        multisig: {
          signers: [{ address: "bb1bad" }],
          threshold: 1,
        },
      },
      {
        multisig: {
          signers: [{ address: TEST_BB1.TO1, weight: 0 }],
          threshold: 1,
        },
      },
    ];
    for (const raw of corpus) {
      const actual = classifyResult(parseVaultGating(raw));
      const expected = oracleClassify(raw);
      expect({ raw, actual }).toEqual({ raw, actual: expected });
    }
  });

  test("agrees with the oracle on 2000 randomized shapes (valid + corrupted)", () => {
    for (let i = 0; i < 2000; i++) {
      const corrupt = Math.random() < 0.5;
      const raw = genGating(corrupt);
      const actual = classifyResult(parseVaultGating(raw));
      const expected = oracleClassify(raw);
      if (actual !== expected) {
        throw new Error(
          `divergence on input ${JSON.stringify(raw)} — parser=${actual} oracle=${expected}`,
        );
      }
    }
  });
});
