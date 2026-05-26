---
title: "Edge-Case & Feasibility Audit — vellum-project plan"
subject: audit-edge-cases
date: 2026-05-26
status: audit
note: >
  Adversarial review of ARCHITECTURE.md, research/differentiators.md,
  research/payment-architecture.md, research/bitbadges-integration.md,
  CLAUDE.md, and all 22 backlog tickets. Goal: surface gaps, unstated
  assumptions, and feasibility risks before any code is written.
---

# Edge-Case & Feasibility Audit — vellum-project

---

## Findings

### F-01: The USDC vault demo has no faucet path on the devnet

**Severity:** critical

**Problem:** The headline feature (ticket #0012 smart vault, #0013 vault spend)
requires USDC deposited into the backing address to function. `bitbadges-integration.md
§11` explicitly flags that "the testnet faucet is offline as of April 2026; mainnet
chaosnet mode with worthless CHAOS tokens is the current testing path." The Meridian
devnet has three `ibc/...` denoms present on funded accounts (`alice`, `oracle`,
`e2e-alice`), but the plan nowhere states who controls the Noble-side IBC relayer
that would deposit new USDC into a *fresh* backing address for a *new* vault collection.
The existing funded accounts have USDC-like balances, but: (a) the agent creates new
vault collections with new backing addresses, and (b) the backing address is
deterministic-but-unique per collection — you can't just reuse `alice`'s existing
balance. So every demo vault requires a fresh IBC USDC deposit, which requires a
working IBC relayer on the devnet, which is neither confirmed nor planned.

**Recommended disposition:** ARCH-CHANGE — Before vault tickets (#0012, #0013)
can be worked, explicitly verify the IBC path: can `alice` send her existing
`ibc/...` coins to a new backing address via a standard Cosmos bank send, or does
the backing invariant require the Noble IBC transfer hook? Pin the exact mechanism
in the meridian-devnet runbook. If the relayer is absent or the hook requires it,
the demo USDC vault must be pre-funded from an existing account — design that into
the ticket scope, not discovered mid-build.

---

### F-02: Gas exhaustion — the agent has no auto-refuel mechanism

**Severity:** critical

**Problem:** `ARCHITECTURE.md §5.1` states the agent hot key auto-signs within
budgets. Every on-chain action (vault creation, approval config, transfers) costs
`ubadge` gas. The plan names `alice` as the funded dev signer
(`bitbadges-integration.md §11`) but the per-persona agent wallets (ticket #0008)
are *new* generated keys with no initial balance. There is no faucet (offline since
April 2026). The plan has no mechanism to bootstrap gas for new persona wallets. With
a small number of demo personas this is manually solvable, but the claim that the
agent "creates vaults autonomously and unlimited" (ARCHITECTURE.md §5.3 /
differentiators.md) silently assumes gas is always present. Vault creation alone
may require multiple transactions (create collection, set approvals, set permissions,
fund escrow). An agent that runs out of `ubadge` mid-operation will fail silently or
with an opaque chain error — no recovery path is designed.

**Recommended disposition:** NEW-TICKET — Add a ticket: "Gas management — bootstrap
and monitor ubadge balance per persona wallet." Minimally: pre-fund from `alice` at
wallet creation, surface low-balance as a ledger warning, add a gas estimation step
before each on-chain action so the agent can abort gracefully rather than broadcast
a failing tx.

---

### F-03: Approval tracker immutability breaks the "reset budget" UX story

**Severity:** high

**Problem:** `bitbadges-integration.md §3.3` states explicitly: "approval trackers
are increment-only and immutable. To reset, you must create a new tracker ID by
changing `amountTrackerId`. Do not reuse old tracker IDs." Ticket #0009 (token
budgets) lists "Rolling-window reset works" as an acceptance criterion, and
ARCHITECTURE.md §5.2 mentions `ResetTimeIntervals`. The `ResetTimeIntervals`
mechanism resets the tracker's *window*, not its value — this works if the budget
is time-windowed from the start. However, if a persona's budget needs to be
*modified* (e.g., the human wants to raise or lower the cap), that requires a new
approval with a new tracker ID, which means the old approval must be removed and a
new one added via a manager action (human signature). The plan implies the agent
sets the budget at persona-setup but is silent on mid-lifetime budget changes. More
subtly: if the approval structure is locked via permissions (ARCHITECTURE.md §5.3
says "only the human can update rules"), even the agent cannot adjust a saturated
tracker without a human signature. Budget changes requiring human signatures on
every adjustment will create significant UX friction not reflected in any ticket.

**Recommended disposition:** ARCH-CHANGE — Decide explicitly: (a) budgets are
time-windowed at creation and never adjusted (simplest, lock via permissions now),
or (b) budgets are adjustable and each adjustment is a human-signed manager action
(document this friction honestly). Update ticket #0009 acceptance criteria to
reflect the chosen path.

---

### F-04: The human-as-collection-manager UX is almost entirely undesigned

**Severity:** high

**Problem:** The trust thesis centers on "agent creates vaults; human is manager"
(ARCHITECTURE.md §5.3, payment-architecture.md §Vaults). Every vault rule change
requires a manager action — a human signature. But the plan has no concrete design
for *how* the human signs a manager action: what does the link look like? What does
the web UI show? Does it reuse the PaymentRequest link pattern (ticket #0014) or is
it a different flow? Ticket #0016 (web vault management) says "manager rule-change
requires human signature" with no design on the signing UX. ARCHITECTURE.md §3 says
the web app has "streamlined sign/approve pages" but these are described as wrappers
over BitBadges signing — not designed. If the UX is "here is a raw BitBadges tx
link," the trust UX story breaks: most users cannot interpret a raw tokenization tx.
The Telegram inline-button approval model (ARCHITECTURE.md §3) also doesn't clearly
cover manager actions — those are more complex than a simple yes/no button.

**Recommended disposition:** NEW-TICKET — Add a ticket specifically for "Manager-action
signing UX" that designs and implements the link/page the human sees when approving
a vault rule change. This is distinct from PaymentRequest funding (#0014). The sign
page must legibly present what rules are being set/changed, not just "sign this tx."

---

### F-05: Per-persona wallet key management has no production-safe design

**Severity:** high

**Problem:** Ticket #0008 says "Keys stored via env/secret store, never committed"
but the plan has N personas × 1 hot key each, all needing to be loaded by the agent
at runtime. ARCHITECTURE.md §10 says "Secrets (signer keys) in env, never committed"
— standard advice for one key, problematic for N. The plan also says personas can be
created dynamically (the agent creates them; users can presumably add personas over
time). Dynamic key generation means: where does the new key persist? How does the
agent reload it on restart? An env var per persona doesn't scale past 3-4 personas.
The plan has no secret store design (no reference to any KMS, file-based keyring,
or encrypted DB column). The `bb` CLI uses a `test` keyring backend by default
(unencrypted, `bitbadges-integration.md §2.2`) — this is not suitable even for a
demo with real chain state.

**Recommended disposition:** ARCH-CHANGE — Add an explicit decision: use
`--keyring-backend file` with a passphrase, or store derived private keys in an
encrypted column in `bun:sqlite`, or use the droplet's keyring for demo. The choice
must be made before ticket #0008 can be implemented safely. Update #0008 acceptance
criteria to name the storage mechanism.

---

### F-06: The orchestrator routing assumption has a bootstrap problem

**Severity:** high

**Problem:** Ticket #0007 requires the orchestrator route messages to the right
persona without reading persona memory (to avoid cross-compartment leakage).
ARCHITECTURE.md §4 says "no cross-compartment memory access during routing."
But: on a first message from a user, the orchestrator has no signal for which
persona is active. `differentiators.md` open question #3 asks exactly this —
"Manual switch, or inferred?" — and leaves it unresolved. If routing is manual
(user says "switch to Finance"), the orchestrator must maintain *some* per-user
global state (current active persona). If routing is inferred from the message,
the inference model must operate without context — which is fine for an empty
context, but the plan doesn't address the common case where the user sends an
ambiguous message mid-session. Neither path is designed; both are critical to
how the agent behaves in practice.

**Recommended disposition:** ARCH-CHANGE — Resolve the routing decision before
implementing ticket #0007. Recommended: explicit-switch-only for v1 (simplest,
zero risk of compartment inference leaking). Document the decision and the
accepted UX tradeoff.

---

### F-07: Smart vault = IBC-backed token; USDC must come from somewhere concrete

**Severity:** high

**Problem:** Related to F-01 but distinct. `bitbadges-integration.md §4.1` details
the IBC-backed path: user sends IBC coins to the backing address, receives collection
tokens. For the vault to work as a spending vehicle, USDC (the IBC coin) must be
present in the backing address *before* the agent can spend. The PaymentRequest
(ticket #0014) is designed to get USDC from the human into... where exactly? The plan
says the agent generates a PaymentRequest link and "funds move," but the PaymentRequest
primitive (`bitbadges-integration.md §5.2`) is a `MsgTransferTokens` call that moves
*collection tokens*, not raw IBC USDC. To fund a USDC-backed vault, the human must
send IBC USDC to the backing address via a Cosmos bank send — which is a *different
flow* than the PaymentRequest skill. These two flows are conflated in the plan. A
user clicking a "fund my vault" PaymentRequest link would execute a token transfer,
not a bank send — the vault wouldn't receive USDC.

**Recommended disposition:** ARCH-CHANGE — Clarify the funding flow per vault type:
for IBC-backed smart vaults, the "fund" action is a bank send to the backing address
(not a PaymentRequest), and the streamlined sign page must present a Cosmos
`MsgSend`, not a `MsgTransferTokens`. Ticket #0014 must explicitly distinguish
vault-funding from the payment-request pattern.

---

### F-08: Transaction failure / sequence number handling is undesigned

**Severity:** high

**Problem:** `bitbadges-integration.md §2.5` notes that `BitBadgesSigningClient`
handles "automatic retry on sequence mismatch" — good. But the plan has no design
for the broader class of tx failure: what happens when a vault-creation tx times out
or is rejected? Does the agent retry, surface an error to the user, or leave the
system in a partial state? With multi-step vault setup (create collection → set
approvals → set permissions → fund escrow), any step failing leaves an orphaned
partial vault. The ledger (#0011) would need to record the failure, but ticket #0011
only describes logging successes ("every tool call, spend, vault op, and funding
event"). Partial vault state is also not trivially queryable — the agent would need
to re-query the collection state after each step to confirm progress.

**Recommended disposition:** NEW-TICKET — Add a ticket: "Tx failure handling and
partial-state recovery." At minimum: each multi-step on-chain operation must be
idempotent or checkpointable; failures must produce a ledger error entry; the agent
must be able to detect and report partial vault state rather than silently leaving
ghost collections on-chain.

---

### F-09: "Unlimited vaults" claim ignores per-collection chain cost

**Severity:** medium

**Problem:** `ARCHITECTURE.md §5.3` and `payment-architecture.md` both say the
agent "can spin up an unlimited number of vaults — one per purpose." Each vault is
a separate collection on-chain. Collection creation costs gas and, depending on the
chain's state parameters, may also consume chain state that affects query performance
over time. On the Meridian devnet (a small droplet, not a validator set), unbounded
collection creation could degrade the chain if used aggressively. More practically:
the "unlimited" framing sets user expectation that vaults are free/cheap to create,
but each creation requires: (a) a funding tx for the backing address, (b) approval
config txs, and (c) gas for all of the above. For a demo this is fine; as a product
claim it is an overpromise.

**Recommended disposition:** ACCEPT-RISK (for demo scope) — for the demo, a fixed
number of vaults (2-3 per persona) is realistic; "unlimited" is a future-facing
claim. Add a comment in the relevant ticket (#0012) capping demo vault count and
noting the gas/state cost assumption.

---

### F-10: Telegram as a trust surface — account takeover = full agent access

**Severity:** medium

**Problem:** ARCHITECTURE.md §3 makes Telegram the primary interface and trust
surface. The human approves actions via inline buttons; manager-action links come
via Telegram. If a user's Telegram account is compromised, the attacker has: (a)
full conversational access to all personas, (b) ability to approve any PaymentRequest
link the agent generates, and (c) ability to sign manager actions. The plan's trust
model (`ARCHITECTURE.md §10`) focuses on chain-enforced limits (budgets, vault
rules) as the backstop — which is correct — but the onboarding and Telegram-linking
flow (ticket #0015) has no 2FA or secondary identity check. The human is identified
solely by their Telegram account.

**Recommended disposition:** ACCEPT-RISK — The chain-enforced spend caps are the
backstop against catastrophic loss from account takeover; document this explicitly
in the trust model. Note in ticket #0015 (onboarding) that Telegram account security
is the user's responsibility, and the risk boundary is the protocol-enforced budget
caps. This is an acceptable v1 posture; 2FA is a post-v1 hardening.

---

### F-11: Cross-persona message routing leak via LLM inference

**Severity:** medium

**Problem:** Ticket #0007 specifies the orchestrator must not read persona memory
during routing. But the orchestrator itself is an LLM call — it receives the full
inbound message. If the user inadvertently references content from a different
persona ("you know, like that thing we discussed in my Finance persona"), the
orchestrator's routing decision based on that message could leak *signals* about
one persona into the routing context of another. The plan asserts compartment
isolation but the LLM-as-router is the potential leak point. The acceptance criteria
("no cross-compartment memory access during routing") checks for *memory* access,
not *signal* leakage from the message content itself.

**Recommended disposition:** ACCEPT-RISK — For a demo with controlled user behavior,
this is unlikely to trigger. Note it as a known theoretical leak and defer to post-v1
(solution: routing is deterministic/rule-based, not LLM-based, for v1; lock this
into ticket #0007's acceptance criteria).

---

### F-12: RAG / vector retrieval is ticket #0006 but no vector store is named

**Severity:** medium

**Problem:** `ARCHITECTURE.md §4` and ticket #0006 describe memory as "embeddings +
hybrid BM25 + dense search" but the tech stack (`ARCHITECTURE.md §8`) only lists
`bun:sqlite` as storage. No vector store is named. Options like sqlite-vec, a
bundled Qdrant, or a simple cosine-similarity scan over embedded chunks are all
plausible but non-trivially different in setup time. For a 2-3 day build, standing
up a separate vector service is likely to steal a day. The plan doesn't account for
this implementation time; ticket #0006 is marked `priority: critical` and Phase 0.

**Recommended disposition:** ARCH-CHANGE — Pick the vector storage now: recommend
`sqlite-vec` (sqlite extension, no separate process, fits the bun:sqlite story)
for v1. Name it explicitly in ticket #0006 acceptance criteria so there is no scope
ambiguity during build.

---

### F-13: The companion web app is 3 separate tickets with unresolved stack choice

**Severity:** medium

**Problem:** Tickets #0015 (onboarding), #0016 (vault management), and #0017
(ledger + sign pages) collectively represent a full web app with auth, on-chain
signing, and real-time ledger display. `ARCHITECTURE.md §8` lists "Next.js (App
Router) *or* Vite SPA + Hono API — TBD." The stack is still TBD as of the ticket
creation date. These 3 tickets plus the signing flow (which requires a wallet
connection in the browser for manager actions) represent 3-4 days of work on their
own in a best-case scenario. Within a 2-3 day total build, the web app will either
be very shallow or crowd out the payment layer — which is the actual thesis.

**Recommended disposition:** ARCH-CHANGE — Resolve the web stack now (recommend
Vite SPA + Hono API for lowest-friction bun integration). More importantly, define
a minimum web surface for demo: a single page with ledger display + a sign link
renderer is sufficient to demo the thesis; full vault management UI is stretch.
Ticket #0016 should be explicitly marked lower priority than the agent + payment
tickets.

---

### F-14: The eval suite (ticket #0022) is 22nd of 22 — structurally last, probably never

**Severity:** medium

**Problem:** `ARCHITECTURE.md §11` calls evals "cross-cutting quality... wire from
the runtime skeleton so traces exist from day one." Ticket #0022 is Phase 1
("cross-cutting quality, grows over phases") — but is the last ticket in the backlog.
In a 2-3 day sprint, tickets 1-20 cover the actual system. Evals and Langfuse
(#0021, #0022) are last — they will be deferred. This is contradictory: the
architecture says "wire from day one," but the backlog ordering guarantees it lands
last or not at all. The Langfuse key is also described as reused from AgentForge
W1-3 — confirming this still works and the project is wired correctly takes non-zero
time.

**Recommended disposition:** ARCH-CHANGE — Either (a) cut evals from v1 scope
explicitly and say so in ARCHITECTURE.md, or (b) move the Langfuse trace
instrumentation (#0021) to Phase 0 (after the agent loop is stood up in #0005)
so traces exist from early on, even if the eval golden sets come later.

---

### F-15: No demo scenario is specified — the "single demo scenario" is still open

**Severity:** medium

**Problem:** `ARCHITECTURE.md §12` lists "the single demo scenario that best shows
the thesis end-to-end" as an open question. `differentiators.md` raises the same
question. Ticket #0020 ("Demo scenario e2e") exists but has not been linked to a
concrete scenario. Without a pinned demo scenario, every feature ticket is scoped
to "make the feature work in general" rather than "make this specific user journey
demoable end-to-end." This increases the risk that no single path is polished enough
to demo on day 3.

**Recommended disposition:** NEW-TICKET — Actually: resolve this before any build
starts. Add it as a prerequisite to Phase 0. A concrete proposal: "User creates a
Finance persona, agent creates a subscriptions vault, agent spends within the daily
cap, agent requests funding via a PaymentRequest link, human approves, ledger shows
the full trail." Pin this in ticket #0020, not left open.

---

### F-16: Proactive check-ins (ticket #0018) require a scheduler with no named tech

**Severity:** low

**Problem:** Ticket #0018 (proactive check-ins) and `ARCHITECTURE.md §6 §6`
("on a schedule, each persona reviews its budgets/vaults/threads") imply a
background scheduler. No scheduler is named in the tech stack. For a Bun/TS
monorepo, options are: setInterval, a BullMQ-style queue, a cron library, or a
simple launchd job. This is not a blocking architectural question but it is an
unaccounted implementation surface.

**Recommended disposition:** ACCEPT-RISK — Low-priority ticket; simplest implementation
is a setInterval in the agent process. Document the chosen approach in the ticket.

---

## Critical path / MVP

### The thesis in one sentence

An agent that: (1) routes a Telegram message to the right persona, (2) auto-signs
an on-chain spend within a vault's protocol-enforced rule, (3) blocks an out-of-rule
spend and generates a PaymentRequest link for the human to fund it, (4) shows the
full ledger trail of what happened.

That is the thesis. Everything else is supporting infrastructure or a future phase.

### Minimal slice that proves it (3-day build)

**Must have (phases 0-3 of the backlog, roughly):**

1. Monorepo scaffold + env (#0001)
2. BitBadges signer wired to Meridian devnet (#0002) — validate this first, not
   last; it is the highest-risk unknown
3. Telegram bot skeleton (#0003)
4. Agent loop + one MCP tool (#0005) — minimal, not full-featured
5. Compartment core — hard-walled memory, two personas, no cross-visibility (#0006)
6. Orchestrator routing — manual switch only, no LLM inference (#0007)
7. Per-persona wallet with pre-funded ubadge (#0008) — 2 wallets for demo, from
   alice's balance
8. ONE vault, pre-funded from alice's ibc USDC (#0012, #0013) — prove the spend
   gate works; skip "unlimited" for demo
9. One PaymentRequest funding flow (#0014) — the agent generates a link, human
   opens it
10. Minimal ledger — text log in SQLite surfaced to Telegram and one web page (#0011)

**Should cut or defer:**

- Web onboarding flow (#0015) — too much surface; replace with a CLI bootstrap script
- Web vault management UI (#0016) — defer; raw bb CLI output surfaced in Telegram
  is sufficient for demo
- Web ledger with rich UI (#0017) — one page, ledger dump only
- Token budgets via approval engine (#0009) — implement vault spend rules only;
  defer the approval-engine budget layer to post-demo
- Free-form x/bank balance (#0010) — not needed if vault is the demo primitive
- Proactive check-ins (#0018) — post-demo
- Sub-minute install (#0019) — post-demo
- LLM routing / model escalation (#0004) — use a single model for demo
- Eval suite (#0022) — post-demo
- Langfuse (#0021) — minimal: just wire the env var; full tracing is post-demo

**The critical-path ordering that the backlog does NOT make clear:**

Ticket #0002 (BitBadges signer to devnet) must be completed and validated — including
a successful on-chain tx — *before* any other payment ticket starts. It is currently
fourth in the backlog and has `priority: high` (not critical). It should be critical
and second only to the scaffold.

---

## Top 5 things to fix before building

1. **Verify and document the USDC-to-vault funding path on the Meridian devnet.**
   (F-01, F-07) Confirm whether alice's existing `ibc/...` balance can be bank-sent
   directly to a new backing address, or whether the Noble IBC transfer hook is
   required. Without this, the headline feature has no working demo path. Do this
   via a direct devnet tx before writing any application code.

2. **Resolve the vault manager-key signing UX.** (F-04) The "human is manager"
   thesis lives or dies on whether the sign page is legible. Design the page
   (even as a mockup) and confirm the BitBadges SDK can construct and serialize the
   `MsgUpdateCollection` needed for a manager action before ticket #0012 is
   implemented.

3. **Pin the orchestrator routing strategy to explicit-manual-switch only.**
   (F-06) The open question in `differentiators.md` about inferred vs. manual
   routing must be resolved; leaving it open blocks ticket #0007 and risks
   compartment-isolation violation during build. Manual switch = one sentence of
   decision, zero implementation risk.

4. **Name and pin the vector/RAG storage technology.** (F-12) Ticket #0006 is
   Phase 0 and critical, but the storage choice is blank. Recommend
   `sqlite-vec`. An unresolved storage choice means the ticket cannot be estimated
   or started safely.

5. **Reorder the backlog: #0002 (devnet signer) to priority: critical, position 2.**
   (F-01, F-08) The chain integration is the highest-risk unknown in the entire
   plan. It should be validated on day 1 before any business logic is written.
   A signer that can't get a tx committed on the devnet makes all 10+ payment
   tickets moot.
