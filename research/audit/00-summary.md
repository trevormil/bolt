---
title: "Plan Audit — Synthesis & Action List"
date: 2026-05-26
status: synthesis
note: >
  Consolidates the four audit passes (01 edge-cases, 02 security, 03 failure-ops,
  04 new-ideas) into a prioritized, deduped action list. Verdict: the plan is
  sound but (a) has a few must-fix design invariants, (b) is over-scoped for 2-3
  days, and (c) leaves one chain-fact unverified that gates the headline demo.
---

# Plan Audit — Synthesis & Action List

**Bottom line:** the architecture is directionally right and the differentiators
hold. The audit found **no reason to change direction** — but it found a handful
of **must-fix invariants**, an **over-scope problem** (22 tickets ≈ weeks, not
days → cut to a ~10-ticket MVP), and **one unverified chain fact** that could
sink the headline demo. All actionable below.

## Must-fix before / during build (deduped across all four audits)

| # | Finding (audits) | Severity | Action | Where |
|---|---|---|---|---|
| M1 | **Ledger must be written from chain-confirmed state, not the LLM's claim** (fail F-01/F-07, edge F-15). Otherwise hallucination silently falsifies proof-of-action — the worst possible demo failure. | CRITICAL | New invariant + ticket: broadcast → persist pending → poll tx hash → write confirmed/failed; LLM never writes "confirmed". | ARCH §5.6/§13; **new ticket 0023** |
| M2 | **USDC→vault funding path on the devnet is unverified** (edge F-01/F-07). IBC-backed vaults need USDC in a fresh backing address; the isolated devnet may lack the Noble relayer/hook. | CRITICAL | **Verify on-chain before vault tickets** — can `alice`'s `ibc/` USDC bank-send to a new backing address, or is the hook required? **BitBadges Q for Trevor.** | gate on 0012 |
| M3 | **Atomic vault creation w/ human-manager handoff + lock + verify** (sec T-09/T-15, fail F-09, edge F-04). A window where the agent is manager = it can rewrite its own caps. | CRITICAL | Vault-create must be ONE tested primitive: create → set human manager → lock manager-update perms → verify agent has zero manager capability. | 0012 (criteria) |
| M4 | **Free-form `x/bank` balance must have a hard cap** (sec T-01/T-05). Uncapped = a prompt injection or key leak drains the petty-cash tier with no on-chain recourse. | HIGH | Pick a ceiling (≤$25/persona), enforce by never funding above it, surface balance every turn. | 0010 + ARCH §5.4 |
| M5 | **Deterministic (non-LLM) routing + explicit manual persona switch for v1** (edge F-06, sec T-07/T-08, fail F-11). LLM-inferred routing is a compartment-leak + misroute-charges-wrong-wallet vector. | HIGH | Persona resolution = DB lookup / explicit `/switch`, never inferred from message body. Isolation enforced by tests. | 0007 (criteria) |
| M6 | **Per-persona tx mutex + always fetch fresh sequence** (fail F-02). Concurrent proactivity + user tx from one wallet = silent sequence-race failure. | HIGH | In-flight tx queue per persona; no 2nd tx until 1st confirmed/failed. | 0023 |
| M7 | **Sign page shows plain-English + full recipient/amount, never hex** (sec T-03, idea 4.4). Raw tx = users approve blind = demo failure. | HIGH | Streamlined sign page renders decoded msg (recipient, amount, expiry) prominently; TG message echoes recipient+amount. | 0017 (criteria) |
| M8 | **Name the vector store + web stack** (edge F-12/F-13). Both blank; either could steal a day. | MEDIUM | `sqlite-vec` (no separate process); web = **Vite SPA + Hono** (bun-native). | ARCH §8 |
| M9 | **Wire Langfuse in Phase 0, not last** (edge F-14). Backlog order guarantees it never lands. | MEDIUM | Move 0021 to Phase 0 (after the agent loop). | 0021 (phase) |

## Scope: cut to a ~10-ticket MVP (edge F-15, F-13, F-14)

22 tickets — incl. a full web app, multi-agent, vaults, evals, observability — is
2–3 *weeks*. The thesis is provable with ~10. **MVP slice** (de-risk the chain
first):

1. 0001 scaffold · **2. 0002 BitBadges signer → devnet (make this CRITICAL + first
   after scaffold — it's the highest-risk unknown; validate a real tx day 1)** ·
3. 0003 Telegram bot · 4. 0005 agent loop + 1 MCP tool · 5. 0006 compartment core
(2 personas, sqlite-vec) · 6. 0007 manual routing · 7. 0008 per-persona wallet
(pre-funded from alice) · 8. **0023 chain-state reconciliation** (the M1/M6
invariant — new, critical) · 9. 0012+0013 ONE pre-funded vault + spend ·
10. 0014 one PaymentRequest funding flow · + minimal 0011 ledger surfaced to TG.

**Defer (post-MVP / stretch):** 0004 model routing (single model for demo),
0009 approval-engine budgets (vault rules suffice), 0010 free-form balance,
0015/0016 rich web onboarding+vault-mgmt (CLI bootstrap + raw output for demo),
0018 proactivity, 0019 sub-min install, 0022 evals, 0024 security hardening,
0025 most UX polish. Keep 0017 minimal (one ledger page + sign page).

## Demo scenario — PIN IT (was open; edge F-15, ideas §2)

**Adopt Scenario C+A** (recurring payment with the vault-creation moment), ~5–7
min live on the devnet — full script in [04-new-ideas.md](./04-new-ideas.md)
§Recommended demo. Folded into ticket **0020**. Demo-day risks (single-node RPC,
sequence drift, proactivity interrupt, gas underestimate) and their mitigations
in [03-failure-ops.md](./03-failure-ops.md) §Demo-day risks.

## Cheap, high-leverage UX adopts (ideas §Top adopts → ticket 0025)

Breadcrumb approval message · receipt-after-every-chain-op · `/ledger` TG command
· plain-English vault rules + sign page · Stripe-link / YNAB-envelope / 1Password
copy framing · persona personality card · "quiet by default, loud when it matters"
proactivity. All S-cost, directly express the thesis.

## Pre-mainnet hardening (deferred → ticket 0024, NOT v1/devnet blockers)

T-02 memory provenance + ingest scanning · T-06 second-channel confirm for
high-value (Telegram-takeover) · T-10 Langfuse scrub + key rotation · T-11 web
CSRF/clickjacking headers · T-12 MCP responses as untrusted · T-13 proactive runs
read-only by default · F-05 prod RPC redundancy · hot keys off bare env
(`--keyring-backend file`/secret store). Devnet uses worthless tokens, so these
gate *real value*, not the demo.

## Accept-risk (documented, no action) 

F-09 "unlimited vaults" → cap demo at 2–3 (reframe copy) · F-10/T-06 Telegram
account security is the user's responsibility (chain caps are the backstop) ·
F-11 LLM-router signal leak (moot once routing is deterministic, M5) · F-13 shared
devnet box (health-check before demo, rate-limit retries) · T-14 replay
(Cosmos-protocol-covered).

## BitBadges questions for Trevor (resolve the top risks fast)

1. **(M2, gates the demo)** On the devnet, can `alice`'s existing `ibc/` USDC be
   **bank-sent directly to a new vault backing address**, or does the IBC-backed
   path require the Noble transfer hook (which the isolated devnet may not have)?
2. **(M3)** Can vault creation **atomically set the human as manager and lock the
   agent out of manager-updates** in one flow (so there's no agent-is-manager
   window)?
3. **(M7)** Does the BitBadges PaymentRequest/sign surface **decode to plain
   English** (msg type → readable summary) for our sign page, or do we build that
   translation layer?
