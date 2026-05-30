import { z } from "zod";
import { isBb1Address } from "@vellum/tx";
import type { VaultGating } from "./vault.ts";

// Zod schema for a vault gating policy (#103 §2 + §3). Replaces the 80-line
// hand-rolled unknown-narrowing in packages/web/src/server.ts:parseGating with
// a single declarative source of truth — project standard is zod (§6 of
// global CLAUDE.md), and the safety-rail refinements (#103 §3) co-locate
// here instead of being scattered across surfaces.
//
// Three safety rails close real footguns:
//   - duplicate signers — the byVoter Map in voteTally is keyed by address
//     (latest wins), so [a, a] is silently a 1-of-1; a 2-of-2 → 1-of-2
//     downgrade.
//   - past unlockAt / expiresAt — a vault with unlockAt:1, expiresAt:2 is
//     fundable but already-expired, locking USDC the manager has to revoke.
//   - agent-as-signer — left to the persona-context validator below, since
//     the persona's wallet address isn't structural.

const bb1AddressSchema = z
  .string()
  .refine((s) => isBb1Address(s), "must be a bech32-valid bb1 address");

const amountSchema = z.object({
  limitUsd: z.number().positive("limitUsd must be > 0"),
  period: z.enum(["daily", "weekly", "monthly"] as const),
});

const timeSchema = z
  .object({
    unlockAt: z.number().nonnegative().optional(),
    expiresAt: z.number().nonnegative().optional(),
  })
  .refine(
    (t) =>
      !(t.unlockAt != null && t.expiresAt != null && t.expiresAt <= t.unlockAt),
    "expiresAt must be after unlockAt — a window that ends at/before its start can never be withdrawn from",
  );

const multisigSchema = z
  .object({
    signers: z
      .array(
        z.object({
          address: bb1AddressSchema,
          weight: z
            .number()
            .positive("signer weight must be > 0 when supplied")
            .optional(),
        }),
      )
      .min(1, "multisig requires at least one signer"),
    threshold: z.number().positive("threshold must be > 0"),
    challengeDelayMs: z.number().nonnegative().optional(),
  })
  .refine((m) => {
    // Duplicate-signer detection (#103 §3). The voteTally byVoter map keys
    // by address (latest wins), so duplicates silently downgrade the vault's
    // effective quorum. Reject at the boundary.
    const seen = new Set<string>();
    for (const s of m.signers) {
      if (seen.has(s.address)) return false;
      seen.add(s.address);
    }
    return true;
  }, "multisig signers contain a duplicate address")
  .refine(
    (m) => m.threshold <= m.signers.reduce((n, s) => n + (s.weight ?? 1), 0),
    "threshold exceeds the total signer weight — the quorum is unreachable",
  );

export const vaultGatingSchema = z
  .object({
    amount: amountSchema.optional(),
    time: timeSchema.optional(),
    multisig: multisigSchema.optional(),
  })
  .strict();

export type VaultGatingInput = z.infer<typeof vaultGatingSchema>;

/**
 * Parse a vault gating policy from untrusted input, returning the validated
 * shape OR a structured error. Mirrors the existing parseGating semantics —
 * `null` input means "no policy", an empty object means "no fields set" (also
 * no policy), anything else either parses or returns an error tag.
 *
 * The temporal refinements (`unlockAt`/`expiresAt` past-date checks) are NOT
 * part of the structural schema because "now" is contextual — call
 * `validateGatingTemporal(g, now)` after this passes. The agent-as-signer
 * check is in `validateGatingForPersona(g, agentAddress)`. Splitting them
 * keeps the structural schema deterministic for unit tests.
 */
export function parseVaultGating(
  raw: unknown,
): VaultGating | undefined | { error: string } {
  if (raw == null) return undefined;
  if (typeof raw !== "object") return { error: "gating must be an object" };
  const result = vaultGatingSchema.safeParse(raw);
  if (!result.success) {
    // First issue's path + message — the audit's "clear message" expectation.
    const i = result.error.issues[0]!;
    const path = i.path.length ? `${i.path.join(".")}: ` : "";
    return { error: `${path}${i.message}` };
  }
  // An object that parses but has every field absent (or an empty time:{}
  // with neither unlockAt nor expiresAt) is no policy. !43 — empty time:{}
  // must not suppress the legacy daily cap; treat it as "no time gate".
  const g = result.data;
  const hasAmount = !!g.amount;
  const hasTime =
    !!g.time && (g.time.unlockAt != null || g.time.expiresAt != null);
  const hasMultisig = !!g.multisig;
  if (!hasAmount && !hasTime && !hasMultisig) return undefined;
  const out: VaultGating = {};
  if (hasAmount) out.amount = g.amount;
  if (hasTime) out.time = g.time;
  if (hasMultisig) out.multisig = g.multisig;
  return out;
}

/**
 * Temporal safety rail (#103 §3): reject unlockAt/expiresAt that are already in
 * the past (or expiresAt <= now). `now` is injected so the test suite stays
 * deterministic. A small grace period (60s) covers clock skew between the
 * caller and the validation layer — a vault submitted "just now" with
 * `unlockAt: Date.now()` won't be rejected for being a second in the past.
 */
export function validateGatingTemporal(
  gating: VaultGating | undefined,
  now: number,
  graceMs = 60_000,
): { ok: true } | { ok: false; error: string } {
  if (!gating?.time) return { ok: true };
  const { unlockAt, expiresAt } = gating.time;
  if (unlockAt != null && unlockAt < now - graceMs) {
    return {
      ok: false,
      error: `unlockAt is in the past — the time-gate badge would mislead since the lock is already open`,
    };
  }
  if (expiresAt != null && expiresAt <= now) {
    return {
      ok: false,
      error: `expiresAt is in the past — vault would be fundable but already-expired, locking the escrowed USDC until manager-revoke`,
    };
  }
  return { ok: true };
}

/**
 * Persona-context safety rail (#103 §3): reject a multisig vault that names
 * the persona's own agent wallet as a signer. An LLM-crafted policy that
 * does this turns the agent into a self-approver of its own withdrawals as
 * soon as a vote-from-agent tool path lands. Today the agent can't sign
 * votes (Keplr only), but the CONFIG is reachable now and the trap closes
 * only when this check is at every surface that accepts a policy.
 */
export function validateGatingForPersona(
  gating: VaultGating | undefined,
  agentAddress: string,
): { ok: true } | { ok: false; error: string } {
  if (!gating?.multisig) return { ok: true };
  const offending = gating.multisig.signers.find(
    (s) => s.address === agentAddress,
  );
  if (offending) {
    return {
      ok: false,
      error: `the persona's own agent wallet (${agentAddress}) cannot be a multisig signer — the agent would self-approve its own withdrawals`,
    };
  }
  return { ok: true };
}
