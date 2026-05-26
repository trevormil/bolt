---
title: "Chosen Differentiators — Payment-First, Compartmentalized Personal Agent"
date: 2026-05-26
status: direction
note: >
  This crystallizes the product direction out of the research. It supersedes the
  "candidate differentiators" options in differentiation.md by selecting and
  sharpening them. Still pre-build-plan; open questions are listed at the end.
  Product name TBD (repo placeholder: vellum-project).
---

# Chosen Differentiators

## Headline

**A payment-first, compartmentalized personal agent — you control what it
spends, what it knows, and what it shares.**

Most assistants treat cost as invisible and memory as one intermingled blob.
Ours makes **economics** and **hard compartmentalization** core primitives. It
directly attacks the loudest documented gripes about the incumbent (OpenClaw's
token burn; intermingled memory that "pollutes the context window") and carries
the trust DNA from the research — expressed concretely as *budgets, vaults, and
isolation* = control.

This is the [cost thesis (D3)](./differentiation.md) elevated to primary, fused
with the economic layer from the [agent-networks work](./agent-networks/00-synthesis.md).

> **Substrate: BitBadges** (the founder's own Cosmos SDK L1). The economics bake
> into BitBadges — agent wallets via the `bb` CLI, the approval/transferability
> engine for **token budgets**, USDC-backed smart tokens for **agent vaults**
> (the headline feature), the **PaymentRequest** standard for human-in-the-loop
> funding, and the **BitBadges swap-estimate endpoint** (ETH + Cosmos) for swaps.
> Concrete wallet/balance/funding/swap decisions in
> [payment-architecture.md](./payment-architecture.md); primitive mapping in
> [bitbadges-integration.md](./bitbadges-integration.md). Strongest possible
> brand-match (it's his chain) and turns "payment-first" into a moat.
> **Dropped:** BB-402 (overengineering — standard auth suffices). **Deferred to an
> extension:** Skip:Go cross-chain swaps + a Solana wallet (the devnet has no IBC/
> Skip integrations). Open call: BitBadges as a hard core dependency vs. behind a
> payment adapter (demo portability).

## The core primitive: the unified compartment ("persona")

A **persona** is a fully walled unit bundling four things:

```
PERSONA (compartment)
  ├─ identity / voice
  ├─ its own memory store      ← zero cross-visibility
  ├─ its own skills / tools
  └─ its own budget + vault     ← scoped spend
```

- **Hard isolation.** No persona can read another persona's memory. Ever. Your
  "Finance" persona literally cannot see your "Dating" persona's memory. Not
  intermingled, not "usually separate" — structurally impossible by design.
- **Thin global layer.** Only the minimum is shared: the dispatcher/router, the
  human principal's identity, and a small set of explicitly-global preferences.
- **Cross-compartment access is explicit and audited** — never implicit. If
  something must cross, it's a logged, authorized event, not a leak.

This single primitive is **load-bearing across all three goals**: it's a
**trust/disclosure** feature, a **cost** feature (scoped context = fewer tokens),
and it composes with **payments** (each persona carries its own vault + budget).
*A persona is a walled identity with its own memory, skills, and money.* That
unification is the most defensible idea on this list.

---

## Tier 1 — Payment-first (primary differentiators)

| # | Differentiator | What it is | Backed by |
|---|---|---|---|
| 1 | **Token budgets** | Bounded spend granted to the agent, to each persona, and to *peer* agents; hard caps + human approval gate at a threshold. | [economic layer](./agent-networks/02-economic-layer.md) |
| 2 | **Agent vaults (HEADLINE)** | Unlimited USDC-backed smart vaults, one per purpose — each a 1:1-backed token collection with protocol-enforced rules (caps/allowlists/time gates). Plus a free-form `x/bank` balance for discretionary spend. | [payment-architecture](./payment-architecture.md) |
| 3 | **HITL funding** | Agent issues a BitBadges **PaymentRequest**; human approves to fund (trust gate on inflows; vault rules gate outflows). | [payment-architecture](./payment-architecture.md) |
| 4 | **Cost accounting / transparency** | A live, auditable ledger: what was spent, on what, under whose authority. Proof-of-action repurposed for money. | [cost economics](./cost-economics.md), [differentiation](./differentiation.md) |

> **Wallets:** dual — Cosmos (`bb1…`) + Ethereum (`0x…`), both required. **Swaps:**
> BitBadges swap-estimate endpoint (ETH + Cosmos). **Dropped:** BB-402, Solana,
> Skip:Go cross-chain (latter two deferred to a future extension — devnet has no
> IBC/Skip). Full design: [payment-architecture.md](./payment-architecture.md).

## Tier 2 — Cost efficiency (the anti-token-burn pillar)

| # | Differentiator | What it is | Approx leverage |
|---|---|---|---|
| 5 | **Cheap-by-default routing** | Escalate to a frontier model only when the task signals complexity. | 70–90% on mixed workloads |
| 6 | **Prompt-cache discipline** | Stable-prefix architecture from day one. | 0.89–0.97 hit rates achievable |
| 7 | **Selective tool loading** | Inject only the tools the current persona/context needs. | OpenClaw/Hermes burn ~9K tokens/call on tool defs alone |
| 8 | **Context compaction** | Summarize/prune so context doesn't grow O(n²). | 40–70% on long sessions |

(All four detailed in [cost-economics.md](./cost-economics.md). These are the
highest-leverage, lowest-risk items — pure design discipline.)

## Tier 3 — Architectural core: compartmentalized memory

Covered by the unified-compartment primitive above. Stated as a hard rule:
**memory is partitioned by persona with zero cross-visibility; the global layer
holds only what is explicitly, minimally shared.**

---

## Feasibility scoping (2–3 day build — measured, not hype)

- **Rock-solid for the timebox:** Tiers 2 + 3 (routing, caching, selective tool
  loading, compaction, hard-walled memory) are pure design discipline — fully
  achievable and demoable.
- **Token budgets + cost ledger:** very achievable as an in-system prepaid pool
  with per-call decrement + approval gate (no crypto needed).
- **The frontier (scope as conspicuous demo, not daily driver):** **x402 + agent
  vaults** are the most infra-heavy — stablecoin rails (Base/Solana) and an agent
  *holding funds* = real custody risk. Build as a **testnet/sandbox demo**;
  production-grade custody is a future milestone, not a weekend. Flagging so the
  timeline isn't overcommitted.

## How this maps to the PRD metrics

- **Cost reduction** → Tiers 1 + 2 directly (routing + budgets + transparency).
- **Extensibility** → MCP for tools/apps; personas as skill bundles.
- **Onboarding** → sub-minute install stays a supporting goal.
- **Task accuracy** → cost ledger + approval gates double as proof-of-action.
- **Great vibes** → personas give coherent, scoped personality without bleed.

## Open questions still to pin (before a build plan)

1. **"Agent vault" definition** — *resolved by the BitBadges research:* a
   **USDC-backed smart-token vault** per persona, where withdrawal policy (daily
   caps, allowlists, time gates) lives in protocol-enforced `collectionApprovals`.
   Still open: who holds the collection-manager key (human principal, per the docs).
2. **Global layer contents** — exactly what is shared across personas (principal
   identity? a few global prefs? the router only)?
3. **Dispatcher** — how does a user request get routed to the right persona
   without leaking across compartments? Manual switch, or inferred (and if
   inferred, the inference must not read compartment memory)?
4. **Budget topology** — one shared vault with per-persona sub-budgets, or fully
   separate vaults per persona?
5. **The single demo scenario** — which one interaction proves the whole thesis?
   (e.g., two personas with separate budgets; or a paid x402 call with a receipt
   and a budget gate.)
6. **Stack** — thin custom agent loop vs LangGraph; TUI vs local web for the
   ledger/budget UI.

These are the inputs to the build plan — not blockers to the direction.
