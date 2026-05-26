---
title: "Security & Trust Audit — vellum-project"
subject: audit-security
date: 2026-05-26
status: audit
note: >
  Threat-model audit of the vellum-project design (pre-build, devnet phase).
  Grounded in ARCHITECTURE.md, research/payment-architecture.md,
  research/bitbadges-integration.md, research/comparison/06-security-trust.md,
  and research/agent-networks/03-identity-trust-disclosure.md.
  Blast-radius figures assume Meridian devnet balances (worthless CHAOS/ubadge
  tokens); all "real value" notes apply when real USDC or mainnet funds are loaded.
---

# Security & Trust Audit — vellum-project

Scope: the full attack surface of an autonomous agent that holds signing keys,
spends money on the BitBadges chain, is messaged via Telegram, has a companion
web app, runs per-persona sub-agents, enforces token budgets, manages smart
vaults (agent creates / human is manager), and funds itself via signed
PaymentRequest links.

---

## Threat table

| # | Threat | Vector | Impact | Existing mitigation (per plan) | Residual risk | Severity | Recommended control |
|---|--------|--------|--------|--------------------------------|---------------|----------|---------------------|
| T-01 | **Prompt injection → unauthorized spend** — a malicious Telegram message, ingested document, or MCP tool-result injects instructions that cause the agent to sign and broadcast a transfer exceeding intended purpose | Telegram message body; RAG-retrieved memory; MCP tool response containing adversarial text | Spend up to the full free-form `x/bank` balance (uncapped at design time — see "Open questions" §1 in payment-architecture.md) plus any vault allowances within currently configured approval rules | Budget caps via approval engine; vault rules (daily caps, allowlists); fail-closed posture; ledger | Free-form balance is explicitly uncapped at design time; injected instruction reaching auto-sign path can drain petty-cash tier with zero human gate; vault outflows also auto-signed within rules, so a well-crafted injection that identifies an allowed recipient can hit the daily cap in one turn | **CRITICAL** | ARCH-CHANGE: hard-code a free-form balance ceiling before any real value; add a secondary intent-classifier pass before any spend action; log + surface all spend to Telegram proactively so human notices fast |
| T-02 | **RAG/memory injection (persistent)** — attacker plants instructions in a document the agent ingests; instructions survive into future sessions via the per-persona memory store | Per-persona document ingestion (ARCHITECTURE.md §4 "optional per-compartment document ingestion"); memory retrieval at later turns | Instructions persist across sessions; can activate on a future unrelated query (Hermes "Promptware" attack class, research/comparison/06-security-trust.md §Hermes); could prime the agent to approve attacker-controlled PaymentRequest | Hard-walled per-persona memory prevents cross-persona spread; retrieval is per-compartment | No provenance tracking described in plan; retrieved memories treated as ground truth by LLM; a single poisoned document ingest could bias indefinitely many future turns; no memory-version or quarantine mechanism described | **HIGH** | NEW-TICKET: implement memory provenance tagging (source URL/filename + ingest timestamp stored with each vector chunk); treat retrieved chunks as untrusted input with explicit labeling in system prompt; add document-ingest scanning for override-style instructions before committing to the store |
| T-03 | **PaymentRequest phishing — link sent to wrong target** — attacker or confused agent generates a PaymentRequest for an attacker-controlled recipient and sends the link to the human; human approves without scrutinizing the recipient | Agent generates PaymentRequest (ARCHITECTURE.md §5.5); link delivered via Telegram | Human signs away funds to attacker address; on-chain settlement is final and irreversible | Human must sign (HITL gate); proof-of-action ledger exists post-hoc | The streamlined sign page (web app) abstracts BitBadges internals — if the page does not prominently display the full recipient address and amount before signing, humans will approve based on the agent's narrative framing, not the on-chain details | **HIGH** | ARCH-CHANGE: the streamlined sign page MUST render the full `bb1...` recipient address, USDC amount, and expiry in large type before the sign button is reachable; add a 5-second forced delay; the Telegram message delivering the link must include recipient+amount in plain text so it is visible before the human even opens the link |
| T-04 | **PaymentRequest link tampering / replay** — a signed PaymentRequest link is intercepted, modified, or reused after approval | Link delivered over Telegram (plaintext transport within TG's channel encryption); no link-signing or expiry in current plan | Funds routed to wrong address, or same payment fulfilled twice | PaymentRequest standard uses on-chain time-window expiry (implicit expiration via `transferTimes`); payer-gated via `initiatedByListId` | Plan explicitly chooses PaymentRequest over escrowed Payment Protocol for simplicity (payment-architecture.md §Funding); the PaymentRequest approval is a single one-time `MsgTransferTokens` — the `initiatedByListId` ensures only the intended payer can fire it, so replay by a third party is blocked on-chain; modification of the link would corrupt the collection ID / token ID and fail chain validation; replay by the same payer is limited by approval counters | **MEDIUM** | ALREADY-COVERED (on-chain): replay by third party blocked; same-payer replay limited by `maxNumTransfers=1`; link tampering causes tx failure; confirm `maxNumTransfers` is explicitly set to 1 in every generated PaymentRequest collection; add a `NEW-TICKET` for link expiry display on the sign page |
| T-05 | **Agent hot-key compromise — blast radius** — the agent process's private key (one per persona) is exfiltrated via OS vulnerability, env-var leak, or MCP tool exploit | Process memory; env vars (per plan: "Secrets (signer keys) in env, never committed" — ARCHITECTURE.md §10); MCP tool injection; Langfuse trace content | Attacker can auto-sign any transaction the approval engine allows: drain free-form balance (no vault rules apply) and hit the full daily/cap on every vault's outflow approval | Protocol-enforced budget caps on vaults; human manager gate on rule changes | Free-form balance has no on-chain enforcement (explicitly flagged as uncapped, payment-architecture.md §1); compromised key + uncapped free-form tier = full petty-cash loss; vault daily caps are the actual bound on vault losses (e.g. if daily cap = $50, attacker can drain $50/day until human notices); key compromise is not detected by design — no key-rotation or alerting mechanism described | **HIGH** | NEW-TICKET: (a) quantify and hard-set free-form balance ceiling (e.g. ≤$10 per persona); (b) consider process isolation for key material (separate signer process — the "CES pattern" from vellum commercial, research/comparison/06-security-trust.md §Vellum credential handling) rather than env-var; (c) add spend-rate alerting: if a persona spends >X% of daily budget in one turn, surface to human immediately |
| T-06 | **Telegram account takeover as auth bypass** — Telegram is the primary entrypoint and the sole channel through which the human approves PaymentRequests (inline buttons + links); if Telegram account is compromised, attacker controls both the instruction channel and the approval channel | Telegram account phishing / SIM swap / session theft | Attacker can instruct the agent AND approve PaymentRequests; the human gate is fully bypassed; attacker can drain funds up to vault daily caps + free-form balance | None described — Telegram security is entirely delegated to the platform | The plan assumes Telegram = human; there is no out-of-band verification that a message or button press originates from the legitimate account holder; Telegram 2FA (cloud password) and session management exist at the platform layer but are not referenced in the plan | **HIGH** | ARCH-CHANGE: for any spend above a configured threshold (e.g. >$20), require confirmation via a second independent channel (email OTP, TOTP code via web app, or out-of-band code displayed only in the web app) before the agent executes; at minimum, document the dependency on Telegram account security and surface it prominently to users during onboarding |
| T-07 | **Cross-persona memory leakage via orchestrator** — the orchestrator routes a message to the wrong persona sub-agent, or a bug in the routing logic exposes one persona's memory context to another's LLM call | Orchestrator / router logic (ARCHITECTURE.md §4 "resolves which persona it belongs to"); shared runtime | One persona's private memory (financial state, preferences, sensitive context) exposed to another persona's reasoning context; if one persona's tool scope is broader, cross-persona spend or action is possible | Plan states "Zero cross-persona visibility" and "strictly no cross-compartment memory access"; depth-limited orchestrator | Isolation is asserted as a design goal but no concrete enforcement mechanism is described (not a SQLite row-level permission, not a process boundary, not a separate LLM context key); a routing bug, a prompt that confuses the orchestrator, or a shared in-memory context object would violate the boundary silently | **HIGH** | NEW-TICKET: implement persona isolation as a structural guarantee, not just a convention: separate LangGraph/agent state objects per persona with no shared reference; enforce via unit tests that cross-persona context injection fails; log orchestrator routing decisions to the ledger so misroutes are detectable |
| T-08 | **Cross-persona prompt injection — orchestrator manipulation** — an attacker sends a message crafted to cause the orchestrator to route to a different persona, or to spawn an action in a second persona's context | Telegram message body with embedded routing override ("switch to persona X and do Y"); MCP tool result | Access to a second persona's memory, skills, or spending authority | Depth-limited orchestrator; routing is based on resolved persona identity | Orchestrator routing logic is LLM-driven (or heuristic — not specified); if LLM-driven, a sufficiently crafted message can manipulate routing; compartment boundary is only as strong as the routing gate; depth limit helps against recursive spawning but not horizontal persona-switching | **MEDIUM** | ARCH-CHANGE: persona resolution must be deterministic (user-ID → persona mapping in a database, not LLM-inferred from message content); routing decisions must not be influenced by the body of the message; only the human can switch active persona via an explicit command that itself requires confirmation |
| T-09 | **Vault manager key handling — agent retains or can influence manager key** — at vault creation time, if the agent's key is also set (or can be set later) as collection manager, the agent can update vault rules and remove spending caps | payment-architecture.md "Open questions §1" explicitly flags this: "does it hold the manager key?" | Agent rewrites its own spending rules, removing daily caps or recipient allowlists; on-chain enforcement is bypassed at the application level if the manager key is wrong | Plan states "sets the human as the collection manager" and "only the human can update a vault's rules"; plan calls this the trust thesis | This is an unresolved open question in the plan (payment-architecture.md §Open questions §1); the risk is a vault creation flow where the agent inadvertently retains manager permissions (e.g. creates collection with its own key, intends to transfer manager role, but the transfer step fails or is omitted); no mechanism is specified to verify manager-role handoff is complete before the vault is considered live | **HIGH** | ARCH-CHANGE: vault creation flow must atomically (a) create the collection, (b) set manager to human address, (c) lock manager-update permissions via the BitBadges permissions system (bitbadges-integration.md §3.4 "permanently forbidden"), and (d) verify the agent key has zero manager capability before treating the vault as active; this must be a tested, single-function primitive, not ad-hoc creation code |
| T-10 | **Langfuse secrets leakage** — Langfuse traces include the full agent reasoning context: message content, memory snippets, tool call arguments, and potentially key material or PII | ARCHITECTURE.md §8 "Langfuse observability"; §11 "trace the full path including tool call"; plan reuses AgentForge W1-3 Langfuse key | If Langfuse key is compromised, full conversation history including financial context is exposed; if a trace accidentally includes a signer key value (e.g. logged in a tool arg), the key is exfiltrated | Plan states secrets are never committed; Langfuse key is env-var | No scrubbing of trace content is described; Langfuse traces are sent to an external endpoint; the plan explicitly traces "tool call → chain op" which includes transaction details and wallet addresses; PII (user preferences, financial state) flows to Langfuse by design | **MEDIUM** | NEW-TICKET: (a) implement a trace scrubber that redacts bb1 addresses above a configurable sensitivity level, key-material patterns, and PII before sending to Langfuse; (b) document what categories of data flow to Langfuse and get explicit user consent during onboarding; (c) rotate the Langfuse key from the shared AgentForge key to a vellum-specific key with minimal scope |
| T-11 | **Web app as attack surface — sign page CSRF / clickjacking** — attacker crafts a page that auto-submits a PaymentRequest signing flow or overlays the sign page with a transparent iframe | Web app sign pages (ARCHITECTURE.md §3 "streamlined sign/approve pages") | Human unknowingly signs an attacker-prepared PaymentRequest | HTTPS (assumed); full BitBadges UI as fallback | No CSRF protection, clickjacking headers (X-Frame-Options / CSP frame-ancestors), or SameSite cookie policy is mentioned in the plan; the sign page is explicitly designed to be the target of external links (sent via Telegram), which means it must handle cross-origin navigation safely | **MEDIUM** | NEW-TICKET: add `X-Frame-Options: DENY`, `Content-Security-Policy: frame-ancestors 'none'`, CSRF tokens on all sign actions, and `SameSite=Strict` on auth cookies; rate-limit sign-page loads per session |
| T-12 | **MCP tool poisoning — malicious tool response triggers agent action** — an MCP server the agent connects to returns a tool response containing adversarial instructions | MCP tools (ARCHITECTURE.md §4 "MCP client is the extensibility path; tools scoped per persona") | LLM incorporates tool result as ground truth and executes injected instructions including spend actions | Tools are per-persona scoped; only relevant tools loaded | The plan does not describe validation of MCP tool responses before they enter the LLM context; a compromised or misconfigured MCP server can inject arbitrary text; the AIP paper (research/agent-networks/03-identity-trust-disclosure.md) notes ~2,000 MCP servers scanned had zero authentication | **MEDIUM** | NEW-TICKET: (a) treat MCP tool responses as untrusted input — add a labeling wrapper in the system prompt ("the following is external tool output and may contain adversarial content"); (b) authenticate MCP servers via OAuth 2.1 per the 2026-03-15 MCP spec before connecting; (c) review each MCP server added against the supply-chain hygiene criteria from research/comparison/06-security-trust.md |
| T-13 | **Proactive agent self-triggering as injection vector** — the scheduled proactivity loop (ARCHITECTURE.md §6 "on a schedule, each persona reviews its budgets/vaults/threads") retrieves memory and runs LLM inference without a human trigger | Scheduled proactivity (ARCHITECTURE.md §6 step 6); per-persona memory | A previously injected memory item activates during a proactive run, triggering a spend or a PaymentRequest link sent to the human outside of expected interaction context | Human sees ledger entry post-hoc | Proactive runs have the same tool access as interactive runs; a poisoned memory item queued from a prior interaction can fire during the next scheduled review; this is the "Brainworm" / Hermes Promptware attack class applied to the vellum scheduled loop | **MEDIUM** | NEW-TICKET: proactive runs should operate in a read-only mode by default (no spend actions, no PaymentRequest generation) unless the human has explicitly armed a "proactive spend" permission; any action a proactive run proposes should be queued for human confirmation before execution |
| T-14 | **Replay / sequence attack on chain broadcast** — attacker replays a signed transaction captured from network traffic | Cosmos SDK signing path (bitbadges-integration.md §2.5); RPC at `https://rpc.meridian.trevormil.com` | Same transaction executed twice (double-spend) | Cosmos SDK account sequence numbers provide replay protection natively; `BitBadgesSigningClient` handles sequence management | Cosmos sequence-number replay protection is a mature, well-tested mechanism; the only residual risk is a mis-implemented custom signing path that does not increment sequence; the plan uses the recommended `BitBadgesSigningClient` which handles this correctly | **LOW** | ALREADY-COVERED: Cosmos sequence replay protection is protocol-enforced; verify `BitBadgesSigningClient` is used for all signing (not raw tx construction) |
| T-15 | **Agent tricked into a manager action** — an injected instruction causes the agent to sign a `MsgUpdateCollection` (manager-level) transaction | Prompt injection via Telegram or MCP; if the agent's key has manager authority (see T-09) | Vault rules updated to remove caps, allowlists, or time gates; all subsequent auto-signed spend is unconstrained | Plan specifies human is manager; vault rules are the trust boundary on outflows | Dependent on T-09: if vault creation flow correctly sets human as manager and removes agent manager authority, this attack is blocked at the protocol layer; if T-09 is not resolved, this is a critical escalation path | **HIGH (conditional on T-09)** | ARCH-CHANGE: same fix as T-09 — atomically remove agent manager capability at vault creation; additionally, never load MsgUpdateCollection into the agent's tool set (exclude it from the permitted message types the agent can construct) |

---

## Trust-boundary diagram

```
                       ┌─────────────────────────────────────────────────────────────┐
HUMAN                  │  HUMAN SIGNING AUTHORITY (manager key — held by human only) │
(Trevor, at keyboard)  │                                                             │
                        └─────────────────┬───────────────────────────────────────────┘
                                          │ signs via BitBadges links (web app sign page)
                                          │ gates: vault rule changes, PaymentRequest inflows
                                          │
                        ┌─────────────────▼───────────────────────────────────────────┐
TELEGRAM / WEB APP     │  PRIMARY HUMAN INTERFACE (Telegram + web app)               │
                        │  • Telegram: message input, inline approval buttons, links  │
                        │  • Web app: vault/budget/ledger view, sign pages           │
                        │  ⚠ SINGLE CHANNEL: TG account compromise = full bypass     │
                        └─────────────────┬───────────────────────────────────────────┘
                                          │ inbound messages (UNTRUSTED)
                                          │
                        ┌─────────────────▼───────────────────────────────────────────┐
ORCHESTRATOR            │  ORCHESTRATOR / ROUTER (persona resolution)                │
                        │  • maps message → persona                                  │
                        │  • must be deterministic (not LLM-inferred)               │
                        │  ⚠ routing logic is a privilege boundary: misroute =      │
                        │    cross-persona data/fund exposure                        │
                        └──────────┬──────────────────────────────────────────────────┘
                                   │ dispatches to correct persona
                    ┌──────────────▼──────────────┐
PERSONA SUB-AGENT   │  PERSONA (hard-walled)      │   ... (N personas)
(one per persona)   │  memory / skills / budget   │
                    │  bb1 hot key (env var)       │
                    │  ⚠ key = blast-radius floor │
                    └────────────┬────────────────┘
                                 │ tool calls + chain ops
           ┌─────────────────────┼──────────────────────────────┐
           ▼                     ▼                              ▼
┌──────────────────┐   ┌──────────────────┐      ┌──────────────────────────┐
│  MCP TOOLS       │   │  LANGFUSE        │      │  BITBADGES CHAIN         │
│  (untrusted      │   │  (external SaaS) │      │  ┌──────────────────┐   │
│   responses)     │   │  ⚠ full trace    │      │  │ x/bank balance   │   │
│                  │   │   content flows  │      │  │ (NO on-chain cap)│   │
└──────────────────┘   │   here incl. PII │      │  └──────────────────┘   │
                        └──────────────────┘      │  ┌──────────────────┐   │
                                                  │  │ VAULT (smart     │   │
                                                  │  │ token collection)│   │
                                                  │  │ ON-CHAIN rules:  │   │
                                                  │  │ daily cap        │   │
                                                  │  │ allowlist        │   │
                                                  │  │ time gate        │   │
                                                  │  │ HUMAN = manager  │   │
                                                  │  └──────────────────┘   │
                                                  └──────────────────────────┘

KEY:
  ──► auto-signed by agent hot key (within approval rules)
  ··► human signature required
  ⚠  identified trust-boundary weakness
```

**Where the human gate actually sits:**

1. **Inflows only** — PaymentRequest (human signs to fund); agent never pulls autonomously.
2. **Vault rule changes** — human is collection manager; on-chain enforcement prevents agent from altering rules (if T-09 is correctly resolved).
3. **Inline Telegram approvals** — for any action the agent surfaces as needing confirmation (currently unspecified which actions trigger this).

**What the on-chain approval engine actually mitigates (quantified):**

- Vault outflow losses are bounded by the configured daily cap × the number of days before the human notices and revokes access (e.g. $50/day cap → $350 if human is away a week).
- Free-form `x/bank` balance losses are **unbounded by protocol** until a ceiling is set — this is the highest-risk tier.
- On-chain replay protection (Cosmos sequence) is complete.
- Manager-key protection is complete *only if* the vault creation flow correctly and atomically removes agent manager authority (T-09).

---

## Must-fix before handling real value

The following are blocked on devnet with toy tokens but become critical the moment real USDC or mainnet $BADGE is loaded. Listed in priority order.

**1. Set and enforce a free-form `x/bank` balance ceiling (T-01, T-05)**
The plan explicitly leaves this "open" (payment-architecture.md §Open questions §2). Without a ceiling, a prompt injection or key compromise drains the full petty-cash tier with zero on-chain recourse. Decision needed: pick a ceiling (e.g. ≤$10 or ≤$25), enforce it by never funding above it, and surface the current free-form balance in the Telegram ledger summary every turn.

**2. Atomic vault creation with manager-role handoff verification (T-09, T-15)**
The vault creation primitive must: create collection → set human address as manager → lock manager-update permissions via the BitBadges permissions engine (set `canUpdateCollectionApprovals` to permanently forbidden for the agent's key) → verify on-chain that the agent key has zero manager capability before returning success. This must be a single tested function, not ad-hoc code. Until this is implemented and tested, every vault is potentially agent-controlled.

**3. PaymentRequest sign page: full recipient + amount display before signing (T-03)**
The streamlined sign page must prominently display the full `bb1...` recipient address, USDC/token amount, and link expiry before the sign button is reachable. The Telegram message delivering the link must also include recipient and amount in plain text. Humans cannot verify what they are signing if the UI abstracts the details.

**4. Telegram account = single point of failure for both instruction and approval (T-06)**
Before handling real value, implement a secondary confirmation channel for spends above a user-configured threshold. The minimum viable option is a TOTP code displayed only in the web app that must be entered in Telegram to confirm a high-value PaymentRequest. This ensures a Telegram-account-level attacker cannot unilaterally drain funds.

**5. Persona isolation: structural enforcement, not convention (T-07, T-08)**
Before multi-persona mode carries any real balances, cross-persona isolation must be verified by automated tests (inject persona A's context into persona B's agent call; assert it is absent). The orchestrator's routing decision must be deterministic and based on a database lookup, not LLM inference from message content.

**6. Memory provenance and document-ingest scanning (T-02, T-13)**
Before enabling per-persona document ingestion with real user data, add provenance tagging to all vector chunks (source + timestamp) and a scanning pass that rejects documents containing override-style instructions (patterns like "ignore previous instructions", "you are now", "transfer funds to"). The proactive loop must default to read-only mode.

**7. Hot-key storage: move off bare env-var (T-05)**
For mainnet keys, store private keys in the OS keychain or a separate signer process, not in a raw environment variable. At minimum, use `--keyring-backend file` (encrypted keyring) rather than `--keyring-backend test` (unencrypted). The current plan note ("Secrets (signer keys) in env, never committed") is insufficient for mainnet custody.

**8. Langfuse: rotate key and add trace scrubbing (T-10)**
Before real user data flows, rotate from the shared AgentForge key to a vellum-specific key. Implement a scrubber that redacts bb1 wallet addresses, private key patterns, and user PII categories from trace content before sending to Langfuse. Get explicit user consent to the data categories flowing to Langfuse during onboarding.

---

## Mitigations already provided by the plan (honest accounting)

The following threats are substantially mitigated by the design as written and do not require new work — they are noted here to avoid double-counting:

- **Vault outflow caps (T-01 partial, T-05 partial)**: Protocol-enforced daily caps via `maxNumTransfers` + `approvalAmounts` + `ResetTimeIntervals` genuinely bound vault losses. A compromised agent or injected instruction cannot exceed these limits; this is not an app-layer promise, it is on-chain enforcement per bitbadges-integration.md §3.3.
- **Agent never pulls funds (T-03 partial)**: The PaymentRequest-only funding model is a real structural defense. The agent cannot autonomously credit itself; every inflow requires a human-signed transaction.
- **Cosmos replay protection (T-14)**: Sequence-number replay protection is complete at the protocol layer and handled automatically by `BitBadgesSigningClient`.
- **Compartment isolation by design (T-07 partial)**: The intent is correct. The gap is enforcement, not the design principle.
- **Human manager gate on vault rules (T-09 partial)**: The plan correctly identifies that the human should be the collection manager. The gap is the atomicity and verification of the handoff at creation time.
- **Proof-of-action ledger (all spend threats)**: The ledger provides after-the-fact detection and auditability, which bounds the window of undetected abuse even when prevention fails.
