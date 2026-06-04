---
id: 112
title: "Property/fuzz coverage expansion: parseGating + mergeObservability + ftsMatch sanitizer"
status: closed
priority: medium
type: testing
source: audit-2026-05-29
created: 2026-05-29
closed: 2026-06-04
refs: ["0103-address-and-gating-validation.md"]
---

## Description
After #0103 lands the zod-based `vaultGatingSchema`, add property tests on the
three remaining invariant-heavy parsers/mergers — the same pattern the money
validator + chain codec now use.

### 1. `vaultGatingSchema` / `parseGating` property tests (HIGH)
- The schema has 4 nested optional objects, 8+ reject branches, and a "threshold
  ≤ total weight" cross-field constraint. Example tests miss combinations
  (`amount + multisig threshold === signers.length + time.expiresAt === unlockAt`).
- Action: generate random gating shapes (permuted invalid fields) and assert
  the validator agrees with an independent reference implementation. Pattern
  mirrors `packages/tx/src/validators.test.ts`.

### 2. `ftsMatch` query sanitizer (HIGH)
- Where: `packages/persona/src/store.ts:47-50`.
- The function is a deliberate security boundary: "Quoting neutralizes FTS
  operators so a query can never be an injection or a syntax error." If a
  future refactor breaks the tokenization, an unprivileged caller could craft
  a query that throws (DoS) or bypasses persona scoping.
- Action: property test feeding adversarial strings (`"`, `'); DROP TABLE`,
  FTS5 operators `NEAR/`, `^`, `:`, parens, very long inputs, unicode,
  empty/whitespace) into `store.recall("a", query)`; assert no throws AND no
  rows from persona `b` surface in persona `a`'s recall, ever.

### 3. `mergeObservability` event/ledger interleaving (MEDIUM)
- Where: `packages/observability/src/merge.ts`.
- 6 example cases cover the dedup invariants. The 10-second dedup window has
  edge cases (events 9s apart, settlement rows + matching events) that
  enumerated tests miss.
- Action: random event+ledger sets; assert the invariants (every event
  surfaces; every settlement row with a txHash survives; no double-counting
  beyond the dedup rule; output is sorted desc by ts).

## Acceptance criteria
- Three new fuzz test files (or additions to existing test files), each
  asserting an independent semantic oracle over ~2k randomized inputs.
- Existing `validators.test.ts` BigInt-canonical oracle pattern is the
  template — non-tautological oracles only.
- No bugs found is the expected outcome; if any are, file as a follow-up.

## Notes
Test review findings #6, #14. Tracks the high-leverage parts of the
"deterministic suite hardening" workstream not yet covered.

## 2026-06-04 — Closed (MR !123)
All three fuzz files landed:
- `packages/tokenization/src/gating-schema.fuzz.test.ts` — 2000 randomized
  shapes through an independent classification oracle.
- `packages/persona/src/store.fuzz.test.ts` — adversarial FTS5 queries +
  2000 randomly-stitched noise strings; no throws, no cross-persona leaks.
- `packages/observability/src/merge.fuzz.test.ts` — 1000 random
  event+ledger scenarios + boundary tests pinning the 10s dedup window.
No production bugs surfaced.
