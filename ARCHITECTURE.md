# ARCHITECTURE

**Status:** design (pre-build) · **Date:** 2026-05-26 · Supersedes scattered
direction notes in [`research/`](./research/) as the single E2E reference.

A payment-first, compartmentalized, trust-first personal assistant — **BitBadges-
native**, messaged via **Telegram**, managed via a **companion web app**.

---

## 1. Thesis & principles

- **Payment-first** — money is a first-class primitive (vaults, budgets, funding),
  not an afterthought.
- **Compartmentalized** — the unit is a **persona**: its own hard-walled memory,
  skills, budget, and on-chain wallet/vaults. Zero cross-persona visibility.
- **Trust-first** — fail-closed; every action is legible and auditable.
- **Core UX principle:** **the agent does all the BitBadges machinery behind the
  scenes; the human's job is to verify / approve.** Humans never touch chain
  internals — they click a link and approve (or reject).
- **BitBadges-native** — the chain (the founder's L1) is the substrate for
  wallets, budgets, vaults, and funding. Single chain, single asset model, no
  bridging in v1.

What we take from the incumbents (OpenClaw et al.), adapt, or skip is recorded in
[`research/differentiators.md`](./research/differentiators.md). The short version:
**take** markdown memory + MCP tools + model routing + sub-minute install;
**adapt** the tool-policy/Canvas ideas into payment gates + a vault/ledger UX;
**skip** 20+ channels, voice, native mobile, marketplace, npm plugins.

---

## 2. System overview

```
            ┌──────────────────────────────────────────────────────────┐
   Human ──▶│  TELEGRAM (primary, conversational)   WEB APP (companion) │
            │  • chat with the agent                • onboarding         │
            │  • inline approve buttons             • manage vaults      │
            │  • receives sign/pay links            • budgets + ledger   │
            │                                       • streamlined sign UX│
            └───────────────┬──────────────────────────────┬───────────┘
                            │                               │
                            ▼                               ▼
                  ┌───────────────────────────────────────────────┐
                  │              ORCHESTRATOR / ROUTER             │
                  │  routes each message → the right persona;      │
                  │  bounded, depth-limited; no cross-compartment  │
                  │  leakage                                       │
                  └───────────────┬───────────────────────────────┘
                                  │
              ┌───────────────────┼───────────────────┐
              ▼                   ▼                   ▼
        ┌───────────┐       ┌───────────┐       ┌───────────┐
        │ PERSONA A │       │ PERSONA B │  ...  │ PERSONA N │   (sub-agents)
        │  SOUL     │       │           │       │           │
        │  memory ▓ │       │  memory ▓ │       │  memory ▓ │  ▓ = hard-walled
        │  skills   │       │           │       │           │
        │  budget   │       │           │       │           │
        │  bb1 wallet+vaults│  bb1 wallet+vaults │  bb1 …    │
        └─────┬─────┘       └─────┬─────┘       └─────┬─────┘
              │                   │                   │
              ▼                   ▼                   ▼
   ┌──────────────────┐  ┌────────────────┐  ┌──────────────────────────┐
   │ LLM ROUTER       │  │ MCP TOOLS      │  │ BITBADGES (Meridian devnet)│
   │ cheap→escalate,  │  │ per-persona    │  │ wallets · budgets(approval │
   │ cache, compaction│  │ scoped         │  │ engine) · vaults · Payment │
   └──────────────────┘  └────────────────┘  │ Request · x/bank balance   │
                                              └──────────────────────────┘
        every tool call / spend / vault op ──▶ TRUST + COST LEDGER ──▶ surfaced
                                                                        in TG + web
   Signing: agent hot key auto-signs *within* budgets/rules;
            human signs funding + manager actions via BitBadges links.
```

---

## 3. Surfaces

### Telegram — primary (conversational)
The entrypoint. The human talks to the agent in natural language; the agent
replies, asks clarifying questions, and surfaces actions. Approvals appear as
inline buttons; anything requiring a signature is sent as a **link** (see §5.5).

### Web app — companion (manage / onboard / approve)
Where the financial state is *seen and managed* (chat can't do this well):
- **Onboarding** — connect Telegram, create the first persona, fund it.
- **Vault management** — view/create vaults, see rules, request rule changes
  (human-manager signs).
- **Budgets & ledger** — per-persona budgets, spend, and the **trust + cost
  ledger** (proof-of-action).
- **Streamlined sign/approve pages** — the target of the agent's links (a
  cleaner wrapper over BitBadges signing). The **full BitBadges UI** is the
  deep-dive fallback.

---

## 4. Agent runtime

### Orchestrator / router
Receives every inbound message (Telegram or web), resolves which **persona** it
belongs to, and dispatches to that persona sub-agent. Multi-agent but
**disciplined**: persona-scoped (not open-ended spawning), depth-limited, and
strictly no cross-compartment memory access. The ledger makes every hop legible.

### Persona / compartment — the core primitive
A persona bundles, hard-walled:
- **identity** (`SOUL`-style personality/voice),
- **memory** (its own store; zero cross-persona visibility),
- **skills** (per-persona capabilities),
- **budget** (on-chain spend caps),
- **wallet + vaults** (one `bb1` wallet per persona; its vaults hang off it).

A thin **global layer** holds only the minimum shared (principal identity, the
router, a few global prefs). Cross-persona access is explicit and audited, never
implicit.

### Memory
Per-compartment: markdown working files + a vector store for recall, partitioned
by persona. The agent reasons only over the active persona's memory.

### Tools / MCP
An **MCP client** is the extensibility path (satisfies the PRD's "connect ≥1
application"). Tools are scoped per persona; only relevant tools are loaded into
context (a cost lever — see §4 cost).

### LLM + cost layer
- **Routing:** cheap model by default, escalate to a frontier model only when the
  task signals complexity.
- **Prompt-cache discipline** (stable-prefix), **selective tool loading**,
  **context compaction**.
- **Metering:** token/$ spend tracked per turn → feeds the cost ledger.

---

## 5. BitBadges payment layer

> **Principle (restate):** the agent performs all of the below autonomously
> behind the scenes; the human only verifies/approves via links.

### 5.1 Wallets & custody
- **One `bb1` wallet per persona.** The agent holds the persona's **hot key** and
  **auto-signs within** its budgets and vault rules.
- The **human signs** the two things the agent must never do alone: **funding**
  inflows and **manager** actions (creating/altering vault rules) — via links.

### 5.2 Token budgets
Per-persona spend caps via the BitBadges **approval engine**
(`maxNumTransfers` / `approvalAmounts` per address, `ResetTimeIntervals` for
rolling windows, `transferTimes`). Protocol-enforced — a compromised agent can't
exceed them. Configured by the agent at persona setup.

### 5.3 Smart vaults — the headline feature
A vault = a **1:1 USDC-backed token collection** with **vault rules** in its
approvals (caps, allowlists, time gates). The agent **creates** vaults
autonomously and **unlimited** (one per purpose), but **sets the human as the
collection manager** — so only the human can update the rules afterward, while
the agent spends within them. Rules are protocol-enforced and non-bypassable.

### 5.4 Free-form `x/bank` balance
Besides rule-bound vaults, each persona has a plain Cosmos `x/bank` balance for
discretionary spend — a small, **capped** "petty cash" tier. Anything
significant lives in vaults.

### 5.5 PaymentRequest — HITL funding (Stripe-link style)
The agent never pulls funds. When it needs money it **spins up a BitBadges
PaymentRequest → generates a link → the human opens it and signs.** Our web app
renders a streamlined sign page; the full BitBadges UI is the fallback.

### 5.6 Trust + cost ledger (proof-of-action)
Every tool call, spend, vault op, and funding event is logged in a legible,
auditable ledger — surfaced in Telegram (summaries) and the web app (full view).
This is the trust thesis made concrete: *who did what, under whose authority,
what it cost.*

---

## 6. Request lifecycle (E2E)

1. Human messages the agent on **Telegram**.
2. **Orchestrator** resolves the **persona** and dispatches.
3. Persona **agent loop**: LLM (cost-routed) + MCP tools, reasoning only over its
   own memory.
4. If the action **spends**: check the persona's **budget + vault rules**.
   - Within limits → agent **auto-signs** and executes on BitBadges.
   - Exceeds / needs funds → agent generates a **PaymentRequest link**; human
     **approves/signs**.
   - Manager action (new vault / rule change) → agent prepares it; human signs as
     **manager**.
5. Result + a **ledger entry**; reply in Telegram; web ledger updates.
6. **Proactivity:** on a schedule, each persona reviews its budgets/vaults/threads
   and surfaces anything worth the human's attention.

---

## 7. Chain environment

The **Meridian devnet** — a standalone `bitbadges-1` chain on the founder's
droplet. Endpoints, the funded dev signer (`alice`), and access in
[`docs/runbooks/meridian-devnet.md`](./docs/runbooks/meridian-devnet.md). No EVM
endpoint → Cosmos signing path. No IBC/Skip → no swaps/bridging (deferred).

---

## 8. Tech stack (proposed)

- **Runtime:** `bun` + TypeScript, monorepo.
- **Telegram:** `grammY` (modern TS bot framework).
- **Web app:** Next.js (App Router) *or* Vite SPA + Hono API — TBD (lean Next.js;
  mirrors the Meridian app pattern). Hosts onboarding, vault/budget/ledger UIs,
  and the streamlined sign pages.
- **Chain:** the `bitbadges` SDK + `cosmjs` for signing/broadcast to the Meridian
  RPC; `bitbadgeschaind` available on the droplet.
- **Agents:** thin custom orchestrator + persona sub-agents (lean on the models;
  avoid heavy frameworks). LangGraph optional if orchestration grows.
- **Tools:** MCP TypeScript SDK (client).
- **LLM:** provider router (e.g. Claude default for quality, a cheap model for
  routine) — pinned, env-configured.
- **Storage:** `bun:sqlite` + per-compartment markdown.

---

## 9. Scope

**In v1:** Telegram + web surfaces · orchestrator + persona sub-agents ·
hard-walled per-persona memory · MCP tools · cost routing + ledger · per-persona
`bb1` wallet · token budgets · **smart vaults (headline)** · free-form balance ·
PaymentRequest funding · light proactivity · sub-minute install.

**Deferred (TBD later):** swaps (local + cross-chain), ETH/Solana wallets,
Skip:Go, voice, channels beyond Telegram, a skill marketplace, BB-402
(standard auth instead).

---

## 10. Trust & security posture

- Agent hot keys are **bounded by on-chain rules** (budgets + vault approvals) —
  fail-closed; a compromised agent can't exceed protocol-enforced limits.
- **Human gates** the two highest-stakes actions: funding (inflows) and manager
  actions (vault rule changes).
- **Compartment isolation** prevents one persona leaking another's data or
  spending another's budget.
- **Proof-of-action ledger** makes everything auditable.
- Secrets (signer keys) in env, never committed.

---

## 11. Open questions

- Free-form balance **cap** value (per persona).
- **Per-persona vs per-purpose** vault mapping (a persona may own several vaults).
- Which **MCP servers** ship in the demo (calendar? email? a BitBadges tool?).
- **Web stack** final pick (Next.js vs Vite+Hono).
- The single **demo scenario** that best shows the thesis end-to-end.
