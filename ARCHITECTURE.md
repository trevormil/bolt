# ARCHITECTURE

**Status:** design (pre-build) · **Date:** 2026-05-26 · Supersedes scattered
direction notes in [`research/`](./research/) as the single E2E reference.

A payment-first, compartmentalized, trust-first personal assistant — **BitBadges-
native**, messaged via **Telegram**, managed via a **companion web app**.

---

## 1. Thesis & principles

- **Local-first** — Vellum runs entirely on the user's machine (the OpenClaw
  model): local DBs, local filesystem, local scheduler, local daemon. **Nothing
  is hosted.** The only remote dependency is **OpenRouter** (LLM). See
  [ADR-0002](./docs/decisions/0002-local-first-terminal-native.md).
- **Terminal-native** — the primary surface is an OpenClaw-class CLI/TUI agent;
  the web app is a *local entrypoint* (installable PWA) and Telegram an optional
  remote channel (long-polling, still local). All drive one engine.
- **Payment-first** — money is a first-class primitive (vaults, budgets, funding),
  not an afterthought.
- **Compartmentalized** — the unit is a **persona**: its own hard-walled memory,
  skills, budget, and on-chain wallet/vaults. Zero cross-persona visibility.
- **Trust-first** — fail-closed; every action is legible and auditable. Local
  filesystem + cron + a long-running daemon make a **capability/permission model**
  (scoped grants, approval gates, full proof-of-action ledger) load-bearing.
- **Core UX principle:** **the agent does all the BitBadges machinery behind the
  scenes; the human's job is to verify / approve.** Humans never touch chain
  internals — they click a link and approve (or reject).
- **BitBadges-native** — the chain (the founder's L1) is the substrate for
  wallets, budgets, vaults, and funding. Single chain, single asset model, no
  bridging in v1.

What we take from the incumbents (OpenClaw et al.), adapt, or skip is recorded in
[`research/differentiators.md`](./research/differentiators.md). The short version:
**take** the local-first terminal-native runtime + filesystem access + self-set
cron + markdown memory + MCP tools + model routing + sub-minute install; **adapt**
the tool-policy ideas into payment gates + a capability/permission model + a
vault/ledger UX; the payment-first BitBadges compartments are the **differentiator**.
**Skip** hosting (all local), bridging, marketplace.

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

All surfaces are thin clients over the one local `@vellum/engine`; they share the
same local state (`~/.vellum`). None requires hosting.

### Terminal (CLI/TUI) — primary (the OpenClaw experience)
The headline surface. An interactive local agent in the terminal: chat, run
tools (filesystem, MCP), set scheduled tasks, manage personas/vaults — with the
capability/permission model gating filesystem + cron + spend. Approvals are
inline prompts; signatures the human must perform open the local web sign page.
(Tickets #34 CLI, #35 filesystem, #36 cron, #37 capabilities.)

### Web app / PWA — local entrypoint (manage / onboard / approve)
Served from localhost; **installable as a PWA** so it feels native. Where the
financial state is *seen and managed*:
- **Onboarding** — the install wizard's GUI half: OpenRouter key, wallet, first
  persona, permissions (#19).
- **Vault management** — view/create vaults, see rules, request rule changes
  (human-manager signs via Keplr).
- **Budgets & ledger** — per-persona budget, spend, and the **trust + cost
  ledger** (proof-of-action).
- **Sign/approve pages** — in-site Keplr + the share-link pay pages.

### Telegram — optional remote channel
Long-polling from the local daemon (no inbound hosting), so the user can talk to
their agent from their phone while it runs on their machine.

---

## 4. Agent runtime

### Orchestrator / router
Receives every inbound message (Telegram or web), resolves which **persona** it
belongs to, and dispatches to that persona sub-agent. Multi-agent but
**disciplined**: persona-scoped (not open-ended spawning), depth-limited, and
strictly no cross-compartment memory access. The ledger makes every hop legible.

> **Routing is deterministic (audit M5):** persona resolution is a DB lookup /
> explicit `/switch` command — **never inferred by an LLM from the message body**
> (that's a compartment-leak + misroute-charges-wrong-wallet vector). Isolation is
> enforced by tests (inject persona A's context into B → assert absent), not by
> convention.

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

### Memory (= the retrieval / RAG engine)
Per-compartment: markdown working files + a **retrieval engine** (embeddings +
hybrid BM25 + dense search + injection) for recall, partitioned by persona. The
agent reasons only over the active persona's memory. **RAG is not a separate
system — it is this retrieval layer.** Two uses, one engine: "memory of the user"
(preferences/history) and *optional* per-compartment **document ingestion**
(ground answers in a persona's own corpus). All hard-walled per persona.

### Tools / MCP / local capabilities
Tools are scoped per persona; only relevant tools load into context (a cost
lever). Beyond the BitBadges tools, the local-first runtime adds OpenClaw-class
capabilities — each gated by the **capability/permission model** (#37: scoped
grants, write/spend approval, everything in the ledger):
- **MCP client** — the extensibility path ("connect ≥1 application").
- **Filesystem** (#35) — read/write the local FS within granted roots; writes and
  sensitive paths require human approval.
- **Scheduled tasks / local cron** (#36) — the agent (or user) registers recurring
  tasks that run agent work locally; generalizes the check-in scheduler (#18).

All state is local under **`~/.vellum`** (XDG-aware): sqlite DBs, persona memory,
wallet index, scheduled tasks, logs (#39).

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
discretionary spend — a small "petty cash" tier. **Hard ceiling (≤ $25/persona),
enforced by never funding above it** — this tier has no on-chain rule enforcement,
so a prompt injection or key leak could otherwise drain it with no recourse (audit
T-01/T-05). Current free-form balance is surfaced every turn. Anything significant
lives in rule-bound vaults.

### 5.5 PaymentRequest — HITL funding (Stripe-link style)
The agent never pulls funds. When it needs money it **spins up a BitBadges
PaymentRequest → generates a link → the human opens it and signs.** Our web app
renders a streamlined sign page; the full BitBadges UI is the fallback.

### 5.6 Trust + cost ledger (proof-of-action)
Every tool call, spend, vault op, and funding event is logged in a legible,
auditable ledger — surfaced in Telegram (summaries) and the web app (full view).
This is the trust thesis made concrete: *who did what, under whose authority,
what it cost.*

> **Critical invariant (audit M1/F-01):** ledger entries for on-chain actions are
> written **only from chain-confirmed state** (tx hash + block height), **never
> from the LLM's interpretation** of a broadcast result. The LLM is never in the
> "confirmed" write path — a polling reconciler is (see §13). Without this, a
> hallucinated "payment sent" silently falsifies the entire trust thesis.

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

- **Runtime:** `bun` + TypeScript, monorepo. Ships as a **local install** — no
  hosting; a **local background daemon** (scheduler + Telegram + web) registered
  with launchd/systemd (#31), plus the CLI as an interactive client to the same
  engine + `~/.vellum` state (#39).
- **CLI/TUI:** the primary surface — an interactive terminal agent over
  `@vellum/engine` (#34).
- **Telegram:** `grammY` (long-polling from the daemon; no inbound hosting).
- **Web app / PWA:** **Vite SPA + Hono API** (bun-native), served from localhost
  and **installable as a PWA** (#38). Hosts onboarding, vault/budget/ledger UIs,
  and the Keplr sign/pay pages (plain-English tx decode — never raw hex).
- **Chain:** the `bitbadges` SDK + `cosmjs` for signing/broadcast to the Meridian
  RPC; `bitbadgeschaind` available on the droplet.
- **Agents:** thin custom orchestrator + persona sub-agents (lean on the models;
  avoid heavy frameworks). LangGraph optional if orchestration grows.
- **Tools:** MCP TypeScript SDK (client).
- **LLM:** provider router (e.g. Claude default for quality, a cheap model for
  routine) — pinned, env-configured.
- **Storage:** `bun:sqlite` + per-compartment markdown; **`sqlite-vec`** for the
  vector index (no separate process — audit M8).
- **Observability:** **Langfuse** (reuse the AgentForge W1–3 key/endpoint via env);
  **wire in Phase 0** so traces exist from day one (audit M9).
- **Evals:** golden-set harness + LLM-as-judge, run in CI; datasets/scores in Langfuse.

---

## 9. Scope

**Shipped (the !21 milestone — web/Telegram wrapper):** orchestrator + persona
sub-agents · hard-walled per-persona memory · MCP-ready agent loop · cost routing
+ ledger · per-persona `bb1` wallet · token budgets · **smart vaults (headline)** ·
free-form balance · PaymentRequest funding · in-site Keplr · light proactivity ·
Langfuse · eval suite · Telegram + web surfaces.

**Local-first direction (ADR-0002, the OpenClaw target — tickets #34–#39):**
terminal CLI/TUI as primary surface · local filesystem tools · agent-settable
cron · capability/permission model · installable PWA · `~/.vellum` local data dir
· local background daemon + autostart (no hosting) · full install/onboarding wizard.

**Deferred (TBD later):** swaps (local + cross-chain), ETH/Solana wallets,
Skip:Go, voice, channels beyond Telegram, a skill marketplace.

---

## 10. Trust & security posture

- Agent hot keys are **bounded by on-chain rules** (budgets + vault approvals) —
  fail-closed; a compromised agent can't exceed protocol-enforced limits.
- **Human gates** the two highest-stakes actions: funding (inflows) and manager
  actions (vault rule changes).
- **Compartment isolation** prevents one persona leaking another's data or
  spending another's budget.
- **Proof-of-action ledger** makes everything auditable.
- Secrets (signer keys) in env / `~/.vellum`, never committed.
- **Local blast radius (ADR-0002):** filesystem access, agent-set cron, and a
  long-running daemon are far more powerful than a web wrapper. The
  **capability/permission model (#37)** is the gate — scoped FS roots, write/spend
  approval, cron-task review, fail-closed defaults — and must land *with* those
  capabilities, not after. The exposed-API auth boundary (bearer + httpOnly
  session) already protects the local web/API; binding beyond loopback requires
  a token.

---

## 11. Observability, evals & retrieval (cross-cutting)

### Observability — Langfuse
Trace the full path — orchestrator → persona → LLM call → tool call → chain op —
as Langfuse traces/spans with token/cost attribution. Reuse the AgentForge W1–3
Langfuse key + endpoint (env, never committed). **Two complementary layers:**
Langfuse = dev/ops observability; the on-chain proof-of-action ledger (§5.6) =
user-facing trust. Wire it from the runtime skeleton so traces exist from day one.

### Evals — golden sets + CI
- **Golden task sets** per use case, with success criteria — deterministic checks
  where possible (did the right tx fire? within budget?), LLM-as-judge for
  open-ended output.
- **Budget-aware:** single-case while iterating; full-suite gated in CI (real-LLM
  eval runs cost money — don't run the whole suite on every change).
- Datasets + scores live in **Langfuse**; CI runs the suite and tracks pass-rate
  over time, split by single-step / multi-step / long-horizon.

### Retrieval / RAG
Not a separate system — it is the **memory retrieval layer** (§4): embeddings +
hybrid BM25 + dense search, per-compartment and hard-walled, serving both
"memory of the user" and optional per-persona document ingestion.

## 12. Open questions

- The 3 audited BitBadges items (USDC→vault funding on devnet, atomic manager
  handoff, sign-page plain-English decode) are **confirmed feasible** by Trevor.
  Implementation pattern: **reference the Meridian repo, then ask Trevor** at build
  time — don't guess the chain logic. (audit M2/M3/M7.)
- **Per-persona vs per-purpose** vault mapping (a persona may own several vaults).
- Which **MCP servers** ship in the demo (calendar? email? a BitBadges tool?).
- *(Resolved by the audit:* free-form cap ≤ $25/persona · web stack = Vite+Hono ·
  demo = Scenario C+A, ticket 0020 · routing = deterministic.)*

## 13. Audit hardening — must-implement invariants

From the plan audit ([research/audit/00-summary.md](./research/audit/00-summary.md)).
The design is sound; these are the non-negotiable invariants + the MVP scope.

### Chain-state reconciliation (the single most important invariant)
```
For every on-chain action:
1. BEFORE BROADCAST: fetch fresh sequence (LCD); re-query vault/budget state from
   chain (never cache); simulate the tx — reject pre-flight on sim failure.
2. AFTER BROADCAST: persist {pending_tx_hash, persona, action, amount} to durable
   storage BEFORE returning control to the LLM.
3. CONFIRM (async, out of LLM path): poll the tx hash until included or N-block
   timeout → write CONFIRMED (block height + hash) or FAILED. The LLM never writes
   a "confirmed" entry.
4. PER-PERSONA TX MUTEX: no 2nd tx from a wallet until the 1st confirms/fails.
5. ON RESTART: reconcile all PENDING entries against chain before new work.
Idempotency: treat every action as possibly-already-executed; query before re-broadcast.
```
This eliminates hallucinated-payment (M1/F-01), sequence races (M6/F-02), and
restart double-spend (F-12). Implemented in **ticket 0023**.

### Other must-fix invariants
- **Atomic vault creation** (M3): create → set human manager → lock manager-update
  perms → verify agent has zero manager capability — one tested primitive (0012).
- **Free-form cap** ≤ $25/persona, enforced (M4 / §5.4).
- **Deterministic routing** + tested isolation (M5 / §4).
- **Plain-English sign page**, no hex (M7 / 0017).

### MVP scope (≈10 tickets — 22 is weeks, not days)
**Build:** 0001 scaffold · **0002 signer→devnet (CRITICAL, first — validate a real
tx day 1)** · 0003 Telegram · 0005 agent loop + 1 MCP tool · 0006 compartments
(2 personas, sqlite-vec) · 0007 manual routing · 0008 per-persona wallet
(pre-funded) · **0023 chain-state reconciliation** · 0012+0013 one pre-funded
vault + spend · 0014 PaymentRequest funding · minimal 0011 ledger → Telegram.
**Defer:** 0004, 0009, 0010, 0015/0016, 0018, 0019, 0022, 0024, most 0025.

### Pre-mainnet hardening (deferred — devnet uses worthless tokens)
Memory provenance + ingest scanning · second-channel confirm for high-value ·
Langfuse scrub + key rotation · web CSRF/clickjacking headers · MCP responses as
untrusted · proactive runs read-only by default · prod RPC redundancy · hot keys
off bare env. Tracked in **ticket 0024**.
