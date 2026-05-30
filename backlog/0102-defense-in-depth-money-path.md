---
id: 102
title: "Defense-in-depth on the money path: vote yesWeight clamp, vault.pay capability split, run_command keychain denylist"
status: open
priority: high
type: security
source: audit-2026-05-29
created: 2026-05-29
refs: ["0064-agent-key-security.md", "0083-multisig-vote-progress-ux.md"]
---

## Description
Three independent defense-in-depth items where the current code trusts an input
it shouldn't have to.

### 1. `voteTally.quorumMet` doesn't clamp yesWeight before arithmetic (HIGH)
- Where: `packages/engine/src/vote-tally.ts:31,41-46,52`.
- `Number(v.yesWeight) || 0` accepts `"1e3"` → 1000 → a single weight-1 voter
  contributes `1 * 1000/100 = 10` to yesWeight and clears any threshold ≤ 10.
  The chain *should* keep yesWeight in `[0,100]` but this is the agent's quorum
  decision — the consumer should not trust the chain return value absolutely.
  Plus float arithmetic at the boundary (3 × 0.33 = 0.9900…1 vs threshold 1).
- Fix: `const yw = Math.max(0, Math.min(100, Number(v.yesWeight) || 0))` and
  reject votes whose raw string isn't `/^(100|[0-9]{1,2})$/`. Scale to integer
  microweight for the threshold compare.

### 2. `vault.withdraw` and `vault.pay` share one capability (MEDIUM)
- Where: `packages/engine/src/vaults.ts:328-389`.
- Both gate on `vault.withdraw`. The comment says "pay = gated withdraw + bank
  send; no separate privilege" — but `pay` sends money to an arbitrary external
  recipient while `withdraw` only moves to the agent's wallet. Different risk
  profiles. The human can't grant "agent may withdraw but not pay vendors."
- Fix: split into `vault.withdraw` and `vault.pay`; default `vault.pay` denied
  but include both in `grantDefaultCapabilities` for back-compat. Update the
  capability tests + UI grant editor.

### 3. `run_command` denylist doesn't block keychain reads (HIGH — #64 residual)
- Where: `packages/engine/src/exec-tools.ts:36-69,225-273`.
- `redactedEnv()` strips secret env vars from the child env — but the keychain
  is queried by OS-user identity, not env. A prompt-injected agent can run
  `security find-generic-password -s vellum-agent-signer -a AGENT_SIGNER_MNEMONIC -w`,
  or `cat ~/.vellum/*.db`, or `cat ~/.config/glab-cli/config.yml`, and stream
  the seed back as tool output. ADR-0007's documented residual.
- Fix (incremental, not sandbox-grade): extend the catastrophic denylist to
  refuse `security find-generic-password`, `security export`, `defaults read`
  on vellum domains, and reads under `~/.vellum/**` + the agent data dir. Real
  sandboxing is the ADR-0004 follow-on.

## Acceptance criteria
- `vote-tally.ts` clamps yesWeight to `[0,100]` and rejects non-canonical
  strings. Property test (additive on the existing fuzz) asserts adversarial
  yesWeight values can never push quorumMet true beyond intended threshold.
- New `vault.pay` capability + default grant + UI labels updated; test asserts
  a persona with `vault.withdraw` but no `vault.pay` is denied at the pay path.
- `run_command` denylist extended; eval `security-run-command-reads-keychain`
  case (added in #107) demonstrates the agent declines, and a unit test asserts
  the denylist rejects the exact `security find-generic-password` invocation.

## Notes
Joint findings from security (#1, #15), money path (#8, #15), and the agent
key-security ADR residual (#64).

## Status (2026-05-30) — partial via MR-2
- §1 yesWeight clamp + regex → **shipped**. `voteTally` parses yesWeight via
  `parseYesWeight` which requires `/^(100|[0-9]{1,2})$/` (rejects "1e3", "1000",
  "Infinity", signed/decimal/hex, whitespace, etc.) and floors to integer
  percent in [0, 100]. Quorum comparison is now in INTEGER microweight space
  (× 100) so the 3 × 0.33 = 0.99 boundary fuzz can't push quorumMet true.
  Property test in `vote-tally.test.ts` covers an adversarial corpus.
- §2 vault.pay capability split → **cut for submission** (audit triage).
  Single-user app, no UX value in splitting; revisit if multi-user lands.
- §3 run_command keychain denylist → **deferred to MR-5**.
