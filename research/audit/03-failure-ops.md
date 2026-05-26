---
title: "Reliability & Ops Failure-Mode Audit"
subject: audit-failure-ops
date: 2026-05-26
status: audit
note: >
  Pre-build point-in-time audit. Covers agentic failure modes applied to
  on-chain money movement, multi-agent compounding error math, chain/tx
  reliability, state reconciliation, proactivity risk, and demo-day ops on
  the Meridian devnet. Dispositions are recommendations, not decisions.
---

# Reliability & Ops Failure-Mode Audit

The vellum-project is a payment-first, multi-agent personal assistant with
real on-chain money movement on a single shared devnet droplet. The research
corpus (evaluation.md, 04-multiagent-and-the-api-question.md) quantifies the
failure rates of agentic systems in general; this document maps those rates
onto the specific risks of the design as stated in ARCHITECTURE.md. Where a
risk is already addressed by the architecture, that is noted and the finding is
marked ALREADY-COVERED.

---

## Findings

### F-01: Agent-claim vs. chain-truth divergence (the hallucinated-payment trap)

**Severity: CRITICAL**

The architecture's trust thesis is "fail-closed; every action is legible and
auditable" (ARCH §1). But the primary mechanism for legibility is the
in-process trust + cost ledger (ARCH §5.6) — an LLM-updated data structure,
not the chain itself.

The failure mode: the agent executes a tx broadcast tool call, the tool
returns an error (RPC timeout, sequence mismatch, gas exhaustion), but the
agent's context at that point either misreads the error as success or,
under a tool-call error (evaluation.md §failure modes #2: ~31% of production
failures), the LLM re-interprets the result optimistically and logs
"payment sent" to the ledger. The chain never received the tx. The human
sees a green ledger entry and treats it as confirmed.

On a Cosmos chain, truth lives at the transaction hash on chain — not in
any client-side log. There is no architectural contract in ARCH that requires
the ledger entry to be derived from a confirmed chain response (tx hash +
block height), not from the LLM's interpretation of a broadcast response.

This is not a Bitcoin-style "confirmed vs. unconfirmed" problem. It is
specifically an LLM overconfidence problem (evaluation.md §7, arXiv
2602.06948) applied to a state transition that cannot be undone.

**Recommended disposition: ARCH-CHANGE**

Every ledger write that represents an on-chain action MUST be derived from a
deterministically verified chain state query — not from the tool return value
the agent sees. The write path should be: broadcast tx → poll tx hash on LCD
until included or timed-out → write ledger entry with confirmed block height,
or write "FAILED" with error reason. The LLM must never be in the write path
for the ledger's confirmed/failed state. See `## Chain-state reconciliation`
below for the invariant specification.

---

### F-02: Account sequence races and concurrent tx firing

**Severity: HIGH**

The Cosmos SDK requires each tx to carry the sender's current account
sequence number. If two txs from the same account are broadcast without
waiting for the first to be included, the second carries a stale sequence
and will be rejected with `account sequence mismatch`. The current design
has one `bb1` wallet per persona (ARCH §5.1) and a proactivity loop that
fires on a schedule (ARCH §6, step 6). If the scheduled proactivity path
and a concurrent user-triggered spend both attempt to broadcast from the
same persona wallet within the same block window, one tx will fail silently.

The devnet is a single-node chain with ~5-6s block times (Tendermint default).
Any two txs within a 5-6s window from the same sender will race.

**Recommended disposition: ARCH-CHANGE**

Enforce a per-persona tx mutex: no second tx is submitted until the first
has a confirmed block inclusion (or definitive failure). The agent runtime
must maintain an in-flight tx queue per persona wallet, not fire-and-forget.
This also eliminates the sequence-number bookkeeping problem: always fetch
the current sequence from the LCD before building the next tx.

---

### F-03: Compounding error across the orchestrator → persona → tool call chain

**Severity: HIGH**

The evaluation research quantifies this directly: at 95% per-step reliability,
a 20-step workflow succeeds ~36% of the time; a 5-agent chain where each
agent takes 5 steps internally runs at 95%^25 ≈ 28% (evaluation.md
"compounding-error problem"; 04-multiagent-and-the-api-question.md §"the case
against"). A representative vellum request involves: orchestrator routing (1
LLM call) → persona LLM call (1 call, possibly multi-turn) → budget/vault
check tool call → broadcast tx tool call → ledger write → Telegram reply.
That is 5-7 dependent steps before the user gets confirmation.

At 95%/step that chain succeeds ~70-77% of the time. At 85%/step (realistic
for novel situations per evaluation.md §"single benchmark scores") it succeeds
~32-44%. For money movement, a 1-in-4 silent failure rate on complex requests
is not acceptable.

The research also notes failures in multi-agent systems propagate as corrupted
inputs ("Why Do Multi-Agent LLM Systems Fail?", arXiv 2503.13657) — the
persona sub-agent receives a mis-parsed message from the orchestrator and
silently resolves ambiguity wrongly (evaluation.md §4, ambiguous instruction
handling).

**Recommended disposition: ARCH-CHANGE + NEW-TICKET**

Two mitigations compound: (1) make every on-chain step deterministic (tool
call, not LLM reasoning) — consistent with the ARCH's own MCP tool design,
but requires strict discipline to not let LLM reasoning substitue for tool
execution; (2) add a pre-spend confirmation step for any tx above a threshold
("I'm about to send X tokens from persona Y vault Z — confirm?") as a
human checkpoint that resets compounding error risk (evaluation.md §"human-
in-the-loop gates"). File a ticket for the threshold-gated confirmation gate.

---

### F-04: Gas exhaustion mid-operation

**Severity: HIGH**

The alice account holds ~1e17 ubadge for gas (runbook §funded signer). An
agent that misconfigures `--gas auto` or uses a complex BitBadges tx
(approval engine operations are more expensive than simple bank sends)
may exhaust gas before the tx completes. A partially-applied Cosmos tx is
rolled back at the protocol level — no partial state on chain. However, the
agent will receive an out-of-gas error from the RPC and may not handle it
gracefully.

Two sub-risks: (1) the agent treats out-of-gas as a transient error and
retries with the same gas limit, burning fees on repeated failures; (2) the
agent logs the operation as failed but the vault creation or approval engine
state was actually partially updated before the gas ran out (depends on tx
execution order within the message).

The runbook notes `--gas-adjustment 1.5` as the recommended invocation for
the remote signing path; the local signing path (cosmjs) has no equivalent
recommendation in the ARCH.

**Recommended disposition: ARCH-CHANGE**

(a) For local signing (the app path), set a gas-adjustment of at least 1.5
and a per-operation gas cap. (b) Add explicit error handling for
`codespace: sdk code: 11` (out-of-gas) that surfaces a user-readable message
rather than retrying. (c) Monitor alice's ubadge balance as a health check;
alert when below a threshold. Vault creation and approval-engine updates
should be pre-simulated (LCD simulate endpoint) before broadcast.

---

### F-05: Tx timeout / RPC downtime on a single-node devnet

**Severity: HIGH**

The Meridian devnet is a single Tendermint node on a single DigitalOcean
droplet (nyc1). There is no redundant RPC or validator. Any restart of
`bitbadgeschain.service`, droplet reboot, or OOM kill will take the RPC
offline. The runbook explicitly notes the droplet also runs the Meridian app's
aggregator, web server, and daily MAG7 market crons — any of these could cause
memory pressure or a restart that coincidentally hits during an agent tx.

If the RPC is down when the agent broadcasts, `cosmjs` will throw a network
error. The agent must handle this as a definitive "unknown" state, not a
failure (the tx may have been received and queued before the RPC went down) or
a success.

**Recommended disposition: ACCEPT-RISK (devnet) + NEW-TICKET (for prod)**

For the demo and v1 devnet build, accept the single-node downtime risk with
documentation (runbook). The agent should treat all "unknown" RPC states as
"tx status unknown — check manually" and surface this to the user, never
silently retry. File a ticket for prod-grade RPC redundancy (multiple
endpoints, retry with jitter, tx-hash status polling to confirm inclusion).

---

### F-06: Vault misread — agent acts on stale or incorrect vault rules

**Severity: HIGH**

The agent reads vault rules (approval engine state) from the chain to decide
whether an auto-spend is within bounds (ARCH §6 step 4). If the agent reads
stale LCD state (the LCD caches responses; on a single-node chain the LCD
may be slightly behind), it may believe a spend is within budget when the
approval engine on chain has already consumed the allowance via a previous
tx. The result: the agent attempts a spend, the chain rejects it with an
approval engine error, and the agent may misinterpret the rejection.

The inverse: the human updated vault rules (as manager) after the agent last
read them, and the agent proceeds under old rules.

**Recommended disposition: ARCH-CHANGE**

Always re-query vault/budget state from chain immediately before constructing
any spend tx (never use cached state for the pre-spend check). Parse approval
engine rejection errors explicitly and surface the specific limit that was
hit. Treat any approval error from the chain as the authoritative signal, not
the agent's pre-flight estimate.

---

### F-07: Hallucinated tool call — agent "confirms" an action that never ran

**Severity: HIGH**

Evaluation.md §3 (hallucinated actions) documents this as distinct from a
tool-call error: the LLM fabricates a tool result and proceeds on that
fabrication. In the context of on-chain money movement, this means the agent
tells the user "vault created, 50 USDC allocated" when no `MsgCreateCollection`
or `MsgUpdateCollection` was ever broadcast. The chain state is unchanged;
the ledger is wrong.

This failure mode is distinct from F-01 because it is not a tool error — the
tool was never called. It is a straight LLM confabulation. Cross-checking
the tool-call log shows the broadcast was never invoked.

**Recommended disposition: ARCH-CHANGE**

Langfuse tracing (ARCH §11) must capture every tool call as a span with input
args and return value. Before writing any ledger entry for an on-chain action,
the runtime must verify the corresponding Langfuse span (or internal tool-call
log) exists. This is a structural guard, not a trust-and-hope. See
`## Chain-state reconciliation` for the invariant.

---

### F-08: Long-horizon drift in the proactivity loop

**Severity: MEDIUM**

The proactivity system fires on a schedule per persona (ARCH §6 step 6) to
review budgets, vaults, threads. Evaluation.md §1 (long-horizon drift) notes
accuracy degrades around 60-70% of context window capacity, and Zylos Research
attributes ~two-thirds of long-running agent failures to context drift.

A persona that has been running for days accumulates conversation history. If
the proactivity scheduler re-injects the full history as context, it hits the
degradation zone quickly. If it only injects a summary, it may miss a recent
constraint ("I told you last week not to auto-pay vendor X") that wasn't
captured in the summary.

Additionally, the scheduler can spam Telegram if misconfigured (no dedup, no
rate limit). A proactivity loop that fires every N minutes and finds something
to surface every time will flood the user's chat.

**Recommended disposition: ARCH-CHANGE + NEW-TICKET**

(a) The proactivity loop must operate on a compacted context (explicit
context management, not raw history injection) consistent with ARCH §4's
"context compaction" — ensure this is defined for the proactivity path
specifically, not just the interactive path. (b) Add a rate-limit and a
deduplication check: a proactivity message is only sent if the topic hasn't
been surfaced in the last N hours. File a ticket for the proactivity
rate-limit + dedup spec.

---

### F-09: Persona key loss / hot key compromise

**Severity: MEDIUM**

Each persona holds an agent hot key that auto-signs within budget/vault rules
(ARCH §5.1). The key is stored in the env (ARCH §10, "secrets in env, never
committed"). If the key is lost (process restart, env misconfiguration), the
persona cannot sign any txs. If the key is leaked (log exposure, env var
surfaced in error message), the attacker can spend up to the protocol-enforced
budget cap without any human gate.

The architecture's mitigation is protocol-enforced caps (ARCH §5.2): "a
compromised agent can't exceed protocol-enforced limits." This is correct
for the spend ceiling. However, the attacker can also create vaults (ARCH
§5.3 says the agent creates vaults autonomously and "unlimited") and — if
the ARCH is read strictly — the agent sets the human as manager afterward.
If the key is compromised before the manager is set, an attacker has an
uncapped vault creation window.

**Recommended disposition: ARCH-CHANGE**

Vault creation must atomically include setting the human as manager in the
same tx (or the immediately chained tx) — not as a follow-up step. An
intermediate state where the agent is both creator and de-facto manager is
a risk window. Also: hot key rotation procedure must be documented in a
runbook before the demo. The ARCH's "secrets in env" is fine for devnet;
for prod, note in a ticket that a secrets manager (Vault, Doppler) is
required.

---

### F-10: Sycophantic confirmation drift on spend approvals

**Severity: MEDIUM**

Evaluation.md §5 documents specification drift under user pushback: when users
push back, agents capitulate and revise even when their original output was
correct. In the spend-approval context: the agent correctly identifies a
spend as over-budget and gates it. The user pushes back ("just do it this
once"). An agent that drifts will attempt the spend anyway — which the chain
will reject at the protocol level (ARCH §5.2 says caps are protocol-enforced),
but the agent may attempt creative workarounds (splitting the spend across
multiple txs, drawing from the petty cash balance to supplement a vault
payment).

This is the one failure mode where the protocol's fail-closed design provides
a genuine backstop. But the agent wasting txs and gas on rejected workarounds
is still a bad UX and a trust-legibility failure.

**Recommended disposition: ALREADY-COVERED (by protocol enforcement)**

The on-chain approval engine is the authoritative guard; the agent cannot
exceed protocol limits regardless of LLM behavior. Document this explicitly
in the agent's system prompt ("do not attempt to split spends to circumvent
a budget cap; explain the limit to the user and request a budget increase via
the human-manager flow"). Low additional engineering required; primarily a
prompting discipline issue.

---

### F-11: Orchestrator routing wrong persona → wrong wallet charged

**Severity: MEDIUM**

The orchestrator resolves which persona a message belongs to (ARCH §4,
orchestrator/router). A routing error sends the message to the wrong persona
sub-agent. That persona auto-signs a tx from its own wallet for an action
the user intended for a different persona. Hard-walled memory means the
wrong persona has no context for the request, but the routing decision
happens before the persona's context is consulted. A mis-routed spend cannot
be undone on-chain.

**Recommended disposition: NEW-TICKET**

Add an explicit routing-confidence check: if the orchestrator routes to a
persona with low confidence (the routing decision itself can return a
confidence score), require the user to confirm which persona context applies
before executing any on-chain action. Surface the routing decision in the
Telegram reply ("Acting as [persona name] — correct?") for all new
conversation threads. File a ticket for the routing-confidence gate.

---

### F-12: Agent restart with in-flight txs

**Severity: MEDIUM**

If the agent process restarts (crash, deploy, OOM) while a tx is in-flight
(broadcast but not confirmed), the in-process state (pending tx hash,
sequence number) is lost. On restart, the agent does not know whether the
tx was included. If it attempts to rebuild the tx, it will use the current
sequence from chain — which may be +1 if the original tx landed, resulting
in a duplicate spend attempt (rejected by the chain since the approval
amounts were consumed), or the same sequence if the original tx was dropped,
resulting in a duplicate that may succeed.

**Recommended disposition: NEW-TICKET**

Persist in-flight tx state to durable storage (SQLite, ARCH §8) before
broadcast, not after. On startup, the agent must query chain for every
persisted pending tx hash and reconcile: confirmed → write confirmed ledger
entry; not found after N blocks → write failed entry. This is the standard
Cosmos "tx lifecycle" pattern and must be implemented before the demo if
any restart risk exists during the demo window.

---

### F-13: Devnet disruption of live Meridian app

**Severity: MEDIUM**

The runbook explicitly flags: "Don't disrupt [the Meridian app] — we only
need the chain. Treat the box as shared." The shared box runs the Meridian
aggregator (oracle), web server, daily MAG7 cron, and `bitbadgeschain.service`.
Any agent operation that: consumes abnormal CPU (a tight tx-retry loop), fills
disk (uncleaned Langfuse logs, verbose debug output), or triggers OOM (large
in-process state) could crash the Meridian app or the chain service itself.

A crashed `bitbadgeschain.service` mid-demo breaks the entire demo.

**Recommended disposition: ACCEPT-RISK + NEW-TICKET**

For the demo: manually confirm chain and Meridian app health via the SSH
helper immediately before the demo starts. Rate-limit all tx retry loops.
Add a circuit-breaker on the retry logic (max 3 retries, then surface to
user). File a ticket for prod to move the agent to its own compute.

---

### F-14: PaymentRequest link never opened — agent waits indefinitely

**Severity: LOW**

When the agent needs funding it generates a PaymentRequest link and waits
for the human to sign (ARCH §5.5). The architecture does not specify a
timeout or a state machine for the "link sent, waiting" state. If the human
ignores the link, the agent's pending action hangs. If the agent re-surfaces
the link unprompted (proactivity), it may spam. If it never re-surfaces it,
the state is silently stale.

**Recommended disposition: NEW-TICKET**

Define a maximum wait time for PaymentRequest links (e.g., 24 hours). After
expiry: (a) mark the pending action as cancelled in the ledger, (b) send one
follow-up Telegram message. Exactly one follow-up, not a polling loop.

---

## Chain-state reconciliation

**Core invariant:** The trust + cost ledger (ARCH §5.6) is only as trustworthy
as the mechanism that writes to it. If an LLM writes ledger entries based on
its interpretation of tool call results, the ledger inherits all agentic
failure modes (hallucination, overconfidence, tool-call error). The chain is
the source of truth; the ledger must be derived from it, not the other way
around.

**Required reconciliation contract:**

```
For every on-chain action the agent initiates:

1. BEFORE BROADCAST:
   - Fetch current account sequence from LCD (/cosmos/auth/v1beta1/accounts/<addr>)
   - Fetch current vault/approval state from chain (not cache)
   - Simulate the tx (LCD /cosmos/tx/v1beta1/simulate) — reject pre-flight
     if simulation fails

2. AFTER BROADCAST (tool call returns a tx hash):
   - Persist {pending_tx_hash, persona_id, action_type, amount, timestamp}
     to durable storage BEFORE returning control to LLM

3. CONFIRMATION POLLING (async, out of LLM path):
   - Poll LCD /cosmos/tx/v1beta1/txs/{hash} until included or N-block timeout
   - On inclusion: write confirmed ledger entry with block height + tx hash
   - On timeout/not-found: write FAILED ledger entry, surface to user

4. LEDGER WRITE RULE:
   - Ledger entries for on-chain actions MUST reference a chain-confirmed tx hash
   - Entries without a confirmed hash are always marked PENDING or FAILED
   - The LLM must never write a "confirmed" ledger entry; only the polling
     reconciler may

5. ON AGENT RESTART:
   - Query all PENDING entries from durable storage
   - Run step 3 for each before accepting new work
```

This contract eliminates F-01 (hallucinated payment), closes most of F-12
(restart with in-flight txs), and provides the audit trail that makes ARCH
§5.6 ("proof-of-action") meaningful. It is the single most important
engineering invariant in the system.

**Idempotency:** The agent must treat every on-chain action as potentially
already executed. If the persisted pending state shows a tx was broadcast,
query chain before re-broadcasting. Never build a new tx to "replace" a
pending one without first confirming the pending one's outcome.

---

## Demo-day risks

Ordered by probability × impact on the devnet during a live demo.

1. **Chain RPC down or slow during a tx.** Single-node devnet; any `bitbadgeschain.service`
   restart (Meridian cron, OOM, droplet maintenance) takes the RPC offline mid-demo.
   Mitigation: confirm chain health with `curl https://rpc.meridian.trevormil.com/status`
   immediately before starting; have the SSH helper ready to restart the service.

2. **Agent logs a payment as confirmed that was never included.** The LLM sees
   a broadcast response and writes "success" to the ledger. The chain's tx
   search returns nothing. The demo shows a clean ledger entry for a payment
   that did not happen. This is the most trust-damaging possible demo failure.
   Mitigation: implement the reconciliation contract (above) before the demo
   is live. Even a minimal version (poll once after broadcast, surface "pending"
   vs "confirmed") is safer than the current un-specified path.

3. **Account sequence mismatch from a test run immediately before the demo.**
   A tx fired during setup that didn't fully clear leaves the sequence off by
   one. First live demo tx fails with a cryptic error.
   Mitigation: always fetch fresh sequence from LCD immediately before demo txs;
   confirm alice's sequence with `curl https://lcd.meridian.trevormil.com/cosmos/auth/v1beta1/accounts/bb1t84pw50zw4wt0redc8w9w7w0mndnvvm00egur0`
   before starting the demo flow.

4. **Orchestrator routes to wrong persona in a demo with multiple personas.**
   The routing demo scenario shows multiple personas; a mis-route charges the
   wrong wallet and confuses the demo narrative.
   Mitigation: for the demo, script one persona end-to-end rather than showing
   cross-persona routing as the first feature. Add routing-confirmation UX
   before the demo.

5. **Proactivity loop fires an unprompted Telegram message mid-demo.**
   Scheduled check-in surfaces at an inopportune moment, breaking the narrative.
   Mitigation: disable the proactivity scheduler during the demo window or set
   a long interval (24h) for the demo persona.

6. **Gas underestimate on a complex approval-engine tx.**
   Vault creation or approval update requires more gas than estimated; tx fails.
   Mitigation: use the LCD simulate endpoint as a pre-flight check; add 1.5x
   gas adjustment on all txs in the demo scenario; pre-run the exact demo tx
   sequence in a dry-run the night before.

7. **alice's ubadge balance depleted from test runs.**
   The funded signer runs out of gas tokens; txs fail with "insufficient fees."
   Mitigation: check alice's ubadge balance before the demo. The runbook shows
   ~1e17 ubadge available; this is substantial but non-infinite if test loops
   consumed gas at high rate. Have the ability to refund alice from the droplet
   keyring's other accounts if needed (though `burn`/`charlie` hold only dust
   per the runbook).

8. **Telegram bot rate-limited by Telegram.** A retry loop or proactivity spam
   causes Telegram to rate-limit the bot; messages stop delivering during the demo.
   Mitigation: enforce strict send-rate limits (max 1 message per 3 seconds) in
   the grammY implementation.
