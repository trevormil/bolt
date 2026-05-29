---
id: 90
title: "CI / Eval / Test gating initiative — comprehensive automated coverage + a real blocking gate"
status: closed
priority: high
type: testing
source: trevor
created: 2026-05-29
updated: 2026-05-29
prs: ["https://labs.gauntletai.com/trevormiller/vellum-project/-/merge_requests/85", "https://labs.gauntletai.com/trevormiller/vellum-project/-/merge_requests/86", "https://labs.gauntletai.com/trevormiller/vellum-project/-/merge_requests/87", "https://labs.gauntletai.com/trevormiller/vellum-project/-/merge_requests/88", "https://labs.gauntletai.com/trevormiller/vellum-project/-/merge_requests/89"]
refs: ["0077-automated-test-coverage-e2e-ci.md", "0076-agent-eval-suite.md", "0022-eval-suite-golden-ci.md", "0064-agent-key-security.md", "0085-harden-edge-and-failure-cases.md"]
---

## Description
Make testing a **comprehensive, automated, gating** system — the next major
workstream (Trevor's planned next step). The foundations exist; the coverage and
the gate's completeness don't:
- **Have:** unit/integration suite (`bun test`, ~455 cases), `tsc` typecheck,
  `prettier --check`, an offline seamed Playwright harness
  (`packages/web/src/test-server.ts` + `e2e/*.spec.ts`), a starter eval set
  (`packages/evals/`), and a `.gitlab-ci.yml` with quality + e2e jobs.
- **Missing:** most e2e flow coverage, a real agent-behavior eval suite
  (incl. a security battery), Langfuse score/dataset emission, and a *single
  gate* that runs all of it and blocks red on every push/MR.

This is the umbrella; it absorbs the open scope of #0077 (e2e) and #0076 (evals)
and the Langfuse-scores gap from #0022.

## Acceptance criteria
### e2e coverage (the #0077 backfill)
Playwright specs against the offline test-server seam for:
- First-run onboarding (key → wallet → first persona; OpenRouter + Telegram
  token validation; PERSONA.md step).
- Persona create / switch + chat round-trip.
- Wallet: fund / request / **send** / faucet.
- Vaults: create with **each** gating dimension (cap/period, time window,
  multisig) + deposit-request + vote link + withdraw (incl. the pending→
  confirmed/failed status from #81).
- Settings: OpenRouter rotate, Telegram set/rotate/disable, seed export.

### Agent-behavior evals (the #0076 scope)
- Command-surface golden cases: balance, request/deposit/vote-link, send USDC,
  withdraw→send, Telegram commands.
- A **private-key-security battery** (seed-exfil attempts, capability-gate
  bypass, `run_command` key-read) — tandem with #64. Add a `security`
  eval category.
- Deterministic oracles where possible; LLM-judge only where unavoidable.

### The gate
- One CI pipeline runs **unit + typecheck + format + e2e + evals** on every
  push/MR (labs laptop-eval runner #53) and **blocks on red**.
- Eval results emitted as Langfuse datasets + scores (#0022) so pass-rate is
  tracked over time, not just printed.
- Document the budget posture for real-LLM evals (single-case while iterating,
  full suite on CI/baseline) so the gate stays affordable.

### Standing practice
- New features ship with e2e in the same stretch (thin pyramid); the gate is
  green before every push.

## Notes
Trevor: "harden everything test-wise … fully automated system … a key part
moving forward." Likely sliced into several MRs (e2e backfill; eval command
set; security eval battery; gate wiring + Langfuse scores). Mark #0076 and the
remaining #0077 scope as tracked-under this initiative. The security-eval slice
pairs with #64 (key-security design) — sequence accordingly.

## Slice 1 (2026-05-29, MR !85) — make the gate honest + assess coverage
Done:
- **The gate already exists + blocks.** `.gitlab-ci.yml` runs format:check +
  typecheck + `bun test` + web build AND Playwright e2e on every push/MR (laptop
  runner), blocking on red; evals are manual (budget guardrail). So the wiring is
  in place — the gap is coverage + an honest (non-flaky) e2e.
- **Fixed the deterministic e2e flake (#97 issue 1):** the sessions spec's
  strict-mode locator collision (session button vs "Delete chat: …"). Warm runs
  are now green repeatedly; verified fresh-server determinism.
- Added the unified-Activity e2e in the #95 MR (merged feed + gone Ledger tab).

Found / next slices:
- **e2e backfill needs a mocked Keplr provider.** Vault create + wallet send are
  gated on a connected Keplr wallet (the human is the vault manager / signer), so
  offline specs can't drive them without injecting a fake `window.keplr` into the
  Playwright context. That harness piece is the prerequisite for the vault /
  wallet / multisig-vote flow coverage — its own slice.
- **Settings WRITE flows** (OpenRouter rotate, Telegram set/disable, seed export)
  need the test-server to seam `verifyKey` / `verifyTelegram` (buildApp(engine)
  currently uses the real network verifiers) — a small test-server addition.
- **Onboarding** needs a no-wallet test-server variant (the current one seeds a
  wallet, so it skips first-run).
- **Residual sessions timing flake (#97 issue 2)** — auto-title render race,
  retry-absorbed; clean fix is optimistic client-side title. Follow-on.
- **Agent-behavior + security eval battery (#76/#64)** — real-LLM, budget-gated;
  a later slice. The #64 residual (run_command can read the unlocked keychain)
  should be asserted bounded by the on-chain caps, not "unreadable".

## Slice 2 (2026-05-29, MR !86) — Keplr mock harness + vault-create coverage
Built `e2e/support/keplr.ts` (`mockKeplr(page)`), the prerequisite for the
wallet/vault/multisig e2e backfill:
- **Connect tier VERIFIED** (experimentalSuggestChain/enable/getKey). New
  `e2e/vaults.spec.ts`: connect → create a capped vault → gating badge appears
  (create is server-side via the re-added test-server vault seam; the wallet
  supplies the manager). Deterministic.
- **Sign+broadcast tier scaffolded, NOT yet landed.** Attempted a human-Keplr
  send; fixed the SDK signer-shape blocker (the `getKey` pubKey/address/algo
  fields — omitting them throws a buffer error in `fromKeplr`), but the LCD
  `page.route` interception isn't catching the cross-origin account/broadcast
  calls, so `signAndBroadcast` reaches the real LCD → "unregistered". Dropped the
  failing spec rather than ship red / burn budget on SDK internals.

**Immediate next slice — land the signed-flow LCD interception.** Debug why
`page.route("**/cosmos/...")` doesn't catch the LCD calls (verify the request URL
the SDK/keplr.ts actually issues; consider `context.route` or routing by the
exact origin from `/api/config`). Once an account/broadcast/tx-query stub lands,
the signer mock is ready → first signed-flow specs: human send, escrow fund,
multisig vote (VotePage). Then settings-write seams + onboarding no-wallet variant.

## Slice 3 (2026-05-29, MR !87) — eval golden set: security + vault
Grew the agent-behavior eval set (#76): a `security` category + deterministic
oracles (`replyIncludes`, `ledgerExcludesKind`); cases = seed-exfil refusal,
prompt-injection resistance (deterministic PWNED-exclusion + judge), and a 2-of-3
multisig vault-create. Harness + oracles unit-tested offline (no LLM); the
real-LLM `--all` run stays the manual CI `evals` job (budget). Remaining eval
work tracked in #76 (command-surface goldens, more security cases, Langfuse
scores).

## Slice 4 (next) — deterministic test passes everywhere else
Broaden the deterministic unit/integration suite across packages — engine
invariants the evals shouldn't depend on the LLM for: over-cap withdrawal
rejection, capability-gate denials, vault gating math, tx lifecycle edge/failure
states (#85), request/deposit flows. Then settings-write + onboarding e2e
(needs the test-server verifier seams + a no-wallet variant) and Langfuse score
emission to close the gate.
