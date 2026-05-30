---
id: 103
title: "Address & gating validation: bech32 checksum + zod parseGating + multisig safety rails"
status: open
priority: high
type: security
source: audit-2026-05-29
created: 2026-05-29
refs: ["0066-agent-vault-criteria.md", "0102-defense-in-depth-money-path.md"]
---

## Description
The two validation choke-points — `isBb1Address` and `parseGating` — are too
permissive. Consolidated cluster:

### 1. `isBb1Address` is regex-only, no bech32 checksum, no upper-length bound (HIGH)
- Where: `packages/tx/src/tx.ts:129-130` (`/^bb1[0-9a-z]{38,}$/`) and a duplicate
  copy at `packages/engine/src/vaults.ts:73-75`.
- A typo-squat address that's a *valid* bech32 (the attacker owns the wallet)
  passes; the agent reads back `"send $50 to bb1abc…xyz?"`, the user verifies
  first/last chars only, the money lands on the attacker. Also: no upper
  length, so a prompt-injected agent can submit huge "addresses" that fly
  through every spend surface and only fail at the chain — DoS knob via the
  per-persona mutex.
- Fix: use cosmjs `fromBech32` to validate the checksum on every address
  entering from an LLM, web body, or Telegram message. Drop the duplicate copy
  in `vaults.ts`. The cosmjs dep is already transitive.

### 2. `parseGating` hand-rolls 80 lines of unknown-narrowing instead of zod (MEDIUM)
- Where: `packages/web/src/server.ts:124-202`. Project standard is zod (§6 of
  the global CLAUDE.md); `VaultGating` interface is the canonical shape in
  `packages/tokenization/src/vault.ts:14`.
- Fix: declare `vaultGatingSchema` in `@vellum/tokenization`, parse with
  `safeParse` at the route — replaces 80 lines with ~10.

### 3. Multisig safety rails: duplicate signers, agent-as-signer, past-window (HIGH)
Three related gating attacks:
- **Duplicate signers** (`parseGating` and `vaultTools.create_vault`): no de-dup
  on the signers array → `[bb1a, bb1a]` is silently a 1-of-1.
  `voteTally`'s `byVoter = new Map(...)` (latest wins) compounds it.
- **Agent-as-signer**: an LLM-crafted vault can include the persona's own bb1
  address as a multisig signer → a future "cast vote" agent tool would self-
  approve. Today the agent can't sign votes (Keplr only), but the *config* is
  reachable now and the trap closes only when the vote-from-agent path lands.
- **`unlockAt` in the deep past**: `parseGating` accepts `unlockAt: 1, expiresAt: 2`
  → already-expired window; the vault is fundable but stuck — manager-revoke
  required. And `unlockAt < now` is accepted (the "time gate" badge in the UI
  shows but the lock is already open).
- Fix: in `vaultGatingSchema`, reject duplicate signer addresses, reject signer
  addresses matching the persona's own wallet, reject `unlockAt < now - epsilon`,
  reject `expiresAt < now`. Same checks in `vaultTools.create_vault`.

### 4. Period anchor uses server `Date.now()` (MEDIUM)
- Where: `packages/tokenization/src/vault.ts:67-97`.
- `resetTimeIntervals: { startTime: String(now) }` anchors the daily/weekly cap
  to the second of vault-creation, not a canonical boundary. Two consequences:
  reset times are unpredictable to the user ("I get fresh $10 at 14:23:17
  every day"), and a clock-jump-backward at create time gives a free withdrawal
  window. The agent has YOLO exec; `sudo systemsetup -setdate` is reachable.
- Fix: anchor to canonical boundary (UTC midnight for `daily`, UTC Monday for
  `weekly`, first-of-month for `monthly`) computed from current chain time, not
  wall clock. One extra RPC read in the create flow.

## Acceptance criteria
- Single `isBb1Address` (using bech32 checksum) in `@vellum/tx`; duplicate
  removed. Existing property fuzz extended with a checksum oracle.
- `vaultGatingSchema` (zod) replaces `parseGating`; all four safety rails above
  enforced; route returns 400 with a clear message.
- Period anchor uses canonical boundary; test asserts a `daily` cap created at
  any wall-clock time resets at UTC midnight.

## Notes
Joint findings: security #4, #8, #11, money path #10, #11, #12, #17.

## Status (2026-05-30) — partial via MR-2
- §1 bech32 checksum → **shipped**. `isBb1Address` in `@vellum/tx` now calls
  `fromBech32` (cosmjs) to validate the checksum on every address; a
  single-character mutation of a real address is now rejected at the boundary.
  Duplicate copy in `packages/engine/src/vaults.ts` removed. Property test in
  `validators.test.ts` covers round-trip + the typo-squat case. Tests across
  the workspace migrated to a shared `TEST_BB1` helper (real
  bech32-checksummed test addresses).
- §2 zod `vaultGatingSchema` → **shipped via MR-6**. Lives in
  `@vellum/tokenization`; `server.ts:parseGating` now delegates to
  `parseVaultGating`. The `strict()` schema + refinements close the
  project-standard violation (§6 of global CLAUDE.md).
- §3 multisig safety rails → **shipped via MR-6**. Three closures:
  duplicate-signer detection inside the zod schema (silent quorum downgrade
  closed), `validateGatingTemporal` rejects already-past `unlockAt`/`expiresAt`
  (with a 60s grace for clock skew), `validateGatingForPersona` rejects
  agent-as-signer. Wired at the web route AND the agent's `create_vault`
  tool so an LLM-crafted policy can't bypass via either surface.
- §4 period anchor canonical boundary → **deferred** (its own scope — needs
  chain-time read).
