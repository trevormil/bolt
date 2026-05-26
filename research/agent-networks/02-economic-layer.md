---
title: "The Agent Economic Layer — Payments, Budgets, and Metering"
subject: agent-economic-layer
date: 2026-05-26
status: research
note: >
  Point-in-time research (May 26, 2026). This space is extremely active and
  hype-prone; every claim below is dated and sourced. "Announced" ≠ "shipped."
  No product decision is made or implied here. Several schemes cited are
  specification-stage or early-adoption.
---

# The Agent Economic Layer — Payments, Budgets, and Metering

The question this document answers: **when autonomous agents call each other or
call paid services, how do payments flow, who sets limits, and what's actually
buildable today?** This is the foundation for evaluating the "token budget
approval" interaction pattern: granting another agent permission to spend, up to
a cap, on your behalf.

---

## At a glance

| Scheme | Backer | Mechanism | Settlement | Maturity (May 2026) |
|---|---|---|---|---|
| **x402** | Coinbase / x402 Foundation | HTTP 402 response triggers stablecoin micropayment; client signs USDC transfer; facilitator settles on-chain | On-chain (Base, Solana, Stellar, others) | Production — 165M+ txns, 69K active agents (Coinbase, Apr 2026) |
| **AP2** (Agent Payments Protocol) | Google, 60+ partners | Three signed Mandates (Intent → Cart → Payment) as W3C Verifiable Credentials; payment-agnostic (cards, stablecoins, bank transfers) | Varies by rail; mandates are the auth layer, not the settlement | Early — spec v0.2 (Apr 2026); live pilots, not broad merchant deployment |
| **Stripe Agentic Commerce Protocol (ACP)** | Stripe + OpenAI | Shared Payment Tokens (SPTs) scoped by seller, time, amount; agents use SPTs without exposing credentials | Stripe's card rails | Live — deployed in ChatGPT (Sep 2025); growing merchant adoption |
| **Skyfire / KYAPay** | Skyfire (startup, $3M seed) | Programmatic agent wallets + KYA (Know Your Agent) identity layer; stablecoin-based; spend controls at wallet level | USDC/stablecoin | Early commercial — exited beta Mar 2025; Visa demo Dec 2025 |
| **PayPal Agent Ready** | PayPal | Existing PayPal merchant rails + agent-facing API; fraud/dispute resolution included | PayPal card/wallet rails | Launched Q4 2025; broadly available Jan 2026 |
| **Mastercard Agent Pay** | Mastercard | Tokenized credentials; payment passkeys; live agentic transactions | Card rails | Pilots live (HK Mar 2026, Thailand Apr 2026); first live purchase Sep 2025 |
| **Visa Intelligent Commerce Connect** | Visa | Single integration for agents; supports 4 protocols (ACP, UCP, TAP, MPP); tokenized spend controls | Card rails | Launched 2025; pilots expanding into 2026 |
| **Nevermined** | Nevermined (startup) | MCP server paywalls; per-tool-call micropayments; wraps any API; supports x402, A2A, plain HTTP | USDC; traditional rails | 1.38M txns since May 2025; active development |
| **Payman AI** | Payman AI ($13.8M raised, Visa + Coinbase Ventures) | Agent banking with hard spend limits; multi-tier approval chains; "ping human if agent exceeds allowance" | Bank transfers + card rails | In active use; Series B prep as of early 2026 |
| **Catena Labs** | Catena Labs ($30M Series A, a16z crypto) | Agent Commerce Kit (ACK) open protocol; W3C DIDs for agent identity; spending guardrails; filing for national trust bank charter | Regulated banking rails + stablecoins | ACK open-sourced May 2025; platform invite-only as of May 2026 |
| **Masumi Network** | NMKR (Cardano ecosystem) | Escrow smart contracts on Cardano; on-chain identity + public registry; agent-to-agent payments without mutual trust | ADA / Cardano | 16,900+ txns, $23K mainnet volume (Jan–Oct 2025); niche |
| **Salesforce Agentforce Credits** | Salesforce | Flex Credits ($0.10/action); Digital Wallet real-time tracking; hard credit caps per team/channel | Salesforce billing (not agent-to-agent) | GA — in production enterprise use |

---

## Payments protocols in depth

### x402 — HTTP-native stablecoin micropayments

Launched May 2025 by Coinbase, x402 operationalizes the long-reserved HTTP
`402 Payment Required` status code. The four-step flow:

1. Client requests a resource.
2. Server responds `402` with a `Payment-Required` header containing payment
   instructions (amount, chain, accepted token, facilitator URL).
3. Client constructs a signed payment payload in a `Payment-Signature` header
   and retries the request.
4. Server verifies with a facilitator (Coinbase CDP provides a hosted one with
   1,000 free monthly txns). Facilitator confirms the on-chain transfer; server
   returns the resource.

The key design property: **the entire payment is inside the HTTP exchange**,
with no separate account creation, subscription, or API key flow. An agent
can autonomously discover, pay for, and consume any x402-protected endpoint.
Permits (EIP-3009) let USDC be authorized without a pre-broadcast transaction,
keeping latency low.

**Settlement:** on-chain, primarily Base (Coinbase's L2), with Solana and Stellar
also live. USDC and EURC are the smoothest; any ERC-20 with Permit2 is
theoretically supported.

**Adoption as of May 2026:** 165M+ transactions, 69K active agents
([Coinbase April 2026 disclosures](https://docs.cdp.coinbase.com/x402/welcome));
$600M annualized payment volume. Cloudflare co-founded the x402 Foundation
(Sep 2025) and ships native Workers support. Stripe began accepting USDC via
x402 on Base (Feb 2026). GPU providers (Hyperbolic), data feeds (CoinGecko), and
MCP server wrappers (Nevermined, xpay.sh) have implemented it.

**What it does not solve:** x402 is a payment handshake, not a budget or
authorization framework. There is no native mechanism for: a budget ceiling
that auto-stops, approval delegation ("agent B can spend up to $10 of mine"),
or dispute/chargeback. The x402 Foundation's roadmap includes service discovery;
budget/delegation are out of scope.

**Honest caveat:** $600M annualized volume sounds large but is dominated by
automated test traffic and early-adopter crypto-native workloads. Mainstream
enterprise adoption has not arrived (May 2026).

---

### AP2 (Agent Payments Protocol) — Google's commerce standard

Announced September 16, 2025, AP2 is an extension to Google's A2A
(Agent-to-Agent) protocol, which standardizes agent-to-agent task delegation.
The three **Mandates** carried as W3C Verifiable Credentials:

- **Intent Mandate:** captures the user's original goal (e.g., "buy me a
  laptop under $800"); signed upfront or in real-time. This is the user's
  cryptographic delegation to the agent.
- **Cart Mandate:** locked record of exactly what items were selected and at
  what price, signed by the merchant agent. Prevents post-authorization
  price/item changes.
- **Payment Mandate:** links the payment credential (card token, stablecoin
  wallet, bank account) to the signed Cart, completing an auditable chain.

AP2 is explicitly **payment-rail-agnostic**: cards, bank transfers, and
stablecoins are all supported. The A2A x402 extension handles crypto-specific
settlement; traditional rails settle through whichever payment processor the
merchant uses.

**Backers at launch:** 60+ organizations including Mastercard, PayPal, Visa,
Adyen, American Express, Coinbase, Salesforce, Adobe, Etsy, Revolut
([Google Cloud Blog, Sep 2025](https://cloud.google.com/blog/products/ai-machine-learning/announcing-agents-to-payments-ap2-protocol)).
Passed 100 organizations by October 2025 (PayPal + Google Cloud co-announcement).

**Relationship to A2A:** AP2 ships as a formal extension. The intended stack:
MCP for tool access → A2A for agent-to-agent task delegation → AP2 for payment
authorization. These compose rather than compete.

**Maturity:** specification v0.2 in April 2026; still evolving. Reference
implementations are available on GitHub; live pilots are running but broad
merchant deployment has not landed. The Mandate framework is the most
architecturally interesting part — it gives any agent transaction a
verifiable, non-repudiable audit trail, which is absent from x402.

---

### Stripe Agentic Commerce Suite + ACP

Stripe announced the Agentic Commerce Protocol (ACP) jointly with OpenAI in
September 2025. It has been live inside ChatGPT since that date.

The core primitive is the **Shared Payment Token (SPT):** a payment credential
that agents use to initiate purchases without holding or exposing the user's
actual card details. SPTs are scoped:
- to specific sellers (a token for Nike cannot be used at Adidas),
- by time window,
- by maximum amount.

This is Stripe's answer to the authorization problem: the user or platform
grants an agent an SPT with pre-approved bounds, and the agent cannot exceed
those bounds even with full autonomy.

Stripe's broader **Agentic Commerce Suite** (Sep 2025) adds:
- Product catalog discovery for merchants so agents can find items.
- Agent-facing checkout without human UI.
- Fraud detection and dispute resolution that carries over from Stripe's
  existing rails.

**Google's Universal Commerce Protocol (UCP)** was announced January 2026 as a
competing/complementary standard; Visa's Intelligent Commerce Connect supports
both ACP and UCP, as well as Trusted Agent Protocol (TAP) and Machine Payments
Protocol (MPP), signaling the card networks are betting on multi-protocol support
rather than a winner-take-all outcome.

---

### Card network strategies (Visa, Mastercard, PayPal)

These three are retrofitting agentic payment flows onto existing card rails,
betting that merchant relationships and consumer trust outweigh crypto-native
alternatives for mainstream commerce.

**Mastercard Agent Pay** (launched Apr 2025): tokenized payment credentials for
agents; uses Mastercard Payment Passkeys (biometric-linked); completed the first
live agentic purchase of a real product (Sep 29, 2025), with live transactions in
HK (Mar 27, 2026) and Thailand (Apr 7, 2026). Planned acquisition of BVNK adds
stablecoin capabilities
([Paz.ai, Q4 2025 guide](https://www.paz.ai/blog/the-payment-networks-are-all-in-what-visa-mastercard-and-paypals-q4-moves-signal)).

**Visa Intelligent Commerce Connect**: a single integration point for merchants
and agent builders that abstracts across four protocols (ACP, UCP, TAP, MPP).
Key features relevant to personal agents: spend controls, tokenization, and
authentication "across both Visa and non-Visa cards"
([TechInformed, 2025](https://techinformed.com/visa-opens-one-integration-for-ai-agent-payments/)).
Visa predicts millions of consumers using agents for purchases by the 2026
holiday season.

**PayPal Agent Ready** (launched Oct 28, 2025; broadly available Jan 2026):
unlocks existing PayPal merchants to accept agent-initiated payments with
no additional integration. Integrates with ChatGPT, Perplexity, and Mastercard
Agent Pay simultaneously. Includes PayPal's existing fraud and buyer protection
stack, which is a meaningful differentiator vs. stablecoin-native rails where
dispute resolution is nascent
([PayPal newsroom, Oct 2025](https://newsroom.paypal-corp.com/2025-10-28-PayPal-Launches-Agentic-Commerce-Services-to-Power-AI-Driven-Shopping)).

---

### Agent-payment startups: Skyfire, Nevermined, Payman, Catena, Masumi

**Skyfire** — Stablecoin-based payment rail paired with a KYA (Know Your Agent)
compliance layer. The identity layer is what distinguishes Skyfire: every agent
gets a programmatic wallet with verifiable credentials, so merchants know *which*
agent is paying and *on whose behalf*, not just that a USDC transfer arrived.
KYAPay is the open protocol; the Skyfire platform wraps it with enterprise
onboarding (F5 partnership, Mar 2026). Exited beta Mar 2025; Visa demo Dec 2025
([BusinessWire, Dec 2025](https://www.businesswire.com/news/home/20251218520399/en/Skyfire-Demonstrates-Secure-Agentic-Commerce-Purchase-Using-the-KYAPay-Protocol-and-Visa-Intelligent-Commerce)).

**Nevermined** — Positioned as "payments middleware for MCP servers." Lets
developers wrap any MCP tool or API endpoint with a paywall; settles in USDC
or traditional rails; supports x402, A2A, and plain HTTP. Sub-cent
micropayments down to $0.001/transaction. 1.38M transactions since May 2025
with claimed 35,000% growth in one 30-day period — impressive, but Nevermined
itself publishes these figures and independent audits don't exist yet
([Nevermined blog, 2025–2026](https://nevermined.ai/blog/ai-agent-payment-systems)).

**Payman AI** — $13.8M raised (Visa Ventures, Coinbase Ventures); focused on
the *authorization and spending-limit* problem rather than the rail itself.
An agent is given a Payman "wallet" with configurable policy: `max $100/day`,
or multi-tier approval chains (agent → human approval above threshold → CFO
above another threshold). If an agent exceeds its allowance, Payman pings a
human for sign-off before any money moves. This is the closest existing product
to the "token budget with human approval gate" pattern
([Payman product page, 2025–2026](https://paymanai.com/)).

**Catena Labs** — Founded by Circle co-founder Sean Neville; $18M seed (May 2025),
$30M Series A (May 2026, a16z crypto). Pursuing a national trust bank charter
(OCC filing). Strategy: build a *regulated financial institution* for AI agents,
not just a payment middleware. The open-source Agent Commerce Kit (ACK) includes
`ACK-ID` (W3C DIDs for agent identity) and spending guardrails configurable by
humans. The bank charter pursuit is a long-term play; the ACK protocol is usable
today
([Fortune, May 20, 2026](https://fortune.com/2026/05/20/catena-labs-series-a-sean-neville-ai-native-bank/)).

**Masumi Network** — Decentralized agent payment protocol on Cardano. Escrow
smart contracts + on-chain agent identity registry allow agents from different
operators to transact without mutual trust. BMW and Generali are named enterprise
users. Niche (Cardano ecosystem); 16,900+ transactions through Oct 2025, $23K
mainnet volume — small but real production use
([Cardano Foundation case study](https://cardanofoundation.org/case-studies/masumi)).

---

## Budgeting, metering, and spend-control patterns

This is where the practical work happens — not just moving money but *governing*
how much an agent is allowed to move.

### Layer 1: Token metering (inference spend)

Before any commerce payment, there is the LLM inference bill. For personal agents
that call other agents' APIs, each inter-agent hop typically triggers at least one
LLM call on the receiving side, billed to the receiving agent's operator. The
pattern is invisible to the caller: you pay your own LLM costs; the callee pays
theirs.

**OpenTelemetry GenAI semantic conventions** (experimental as of Mar 2026) define
standard span attributes — `gen_ai.usage.input_tokens`, `gen_ai.usage.output_tokens`,
`gen_ai.request.model` — that propagate through parent-child spans in a multi-agent
trace. This means observability tools (Langfuse, LangSmith, Helicone) can now
attribute token cost across a call chain to the originating root span
([OpenTelemetry, 2025–2026](https://dev.to/x4nent/opentelemetry-genai-semantic-conventions-the-standard-for-llm-observability-1o2a)).
The standard is experimental; vendor support is inconsistent.

**Langfuse** supports automatic trace hierarchies: parent agent trace → child span
per tool call → nested span per sub-agent delegation, each with token/cost
attribution. LangSmith offers equivalent capability. These are observability
tools, not enforcement tools — they tell you what was spent, they don't cap it.

### Layer 2: API gateway enforcement (soft and hard limits)

**Kong AI Gateway** (enterprise): the AI Rate Limiting Advanced plugin enforces
token quotas per user, application, or time period. Hard stops at a daily/monthly
token ceiling; soft warnings at configurable thresholds (50%, 80%, 100%).
Cost attribution per agent, department, or business unit via the Agent Gateway
product. Enterprise-only; significant licensing overhead
([Kong docs, 2025](https://konghq.com/blog/engineering/token-rate-limiting-and-tiered-access-for-ai-usage)).

**Anthropic rate limits**: Anthropic enforces monthly spending caps at the API
account level, scaling with account tier and deposit history. Claude Code had
weekly rate limits added (Aug 2025) specifically for agentic workloads. This is
platform-level, not per-agent granularity.

**Open-source:** `tokencap` (GitHub: pykul/tokencap) — lightweight token budget
enforcement for agents; hard limits with configurable policy; zero infrastructure.
Early-stage but functionally real.

### Layer 3: Salesforce Agentforce Credits — the enterprise reference model

Salesforce Agentforce's Flex Credits model is the clearest production example of
"agent-level spend accounting":

- 1 Action = 20 Flex Credits = $0.10
- Credits pool is shared across teams/channels; a **Digital Wallet** shows
  real-time credit consumption
- Three payment models: pay-as-you-go, pre-commit, pre-purchase (highest
  discount at lowest flexibility)
- Administrators can set credit caps per department or use case; circuit-breakers
  stop actions when a cap is hit

This is not agent-to-agent payment — it is the *platform billing* model — but
it is the closest real-world instantiation of "per-action budget with a cap" at
commercial scale
([Salesforce Agentforce Pricing, 2026](https://www.salesforce.com/agentforce/pricing/)).

### Layer 4: Delegation and approval chains

**Payman AI** is the production example for human-in-the-loop spend authorization.
Policy examples:
- Flat cap: `max $100/day per agent`
- Tiered: agent auto-approves up to $50; pings human for $50–$500; escalates to
  finance above $500
- Vendor allowlist: agent can only pay from a pre-approved list of services

**AP2's Intent Mandate** is the cryptographic equivalent for commerce: the user
signs a delegation upfront (or in real-time) authorizing an agent to act within
a bounded scope. The cart + payment mandates then execute within that delegated
authority. The key insight: **the budget authorization is separable from the
payment execution**, which is the correct architecture for personal agent contexts.

**Stripe SPTs** encode the same idea at the payment-credential level: a token
scoped to a seller, time, and amount ceiling, issued to an agent without
exposing the underlying card. The agent physically cannot exceed the token's
constraints.

### Layer 5: The "token budget" pattern in LLM agent tooling

Anthropic introduced a `token_budget` parameter in Claude's system prompt
for agentic contexts — a suggestion to the model about how many tokens it should
target for thinking, intended to control cost and latency on extended thinking
tasks. This is a *model-level hint*, not an enforcement mechanism; the model can
ignore it.

The broader pattern of "giving a model a budget for its own reasoning" is distinct
from "giving an agent a dollar budget for external calls." Both matter; they are
solved by different primitives.

---

## Pricing models for agent-to-agent calls

Five models dominate the 2026 landscape, each with distinct trade-offs:

### 1. Pay-per-call (micropayment)

**Mechanism:** each API call or tool invocation triggers a microtransaction, often
via x402 + USDC or Nevermined. Typical range: $0.001–$0.05 per call.

**Best for:** high-frequency, variable-volume access to commodity data or compute
(weather, exchange rates, GPU inference time).

**Economics:** only viable below ~$0.01/call because traditional card rails
cannot profitably clear below $0.30. x402 and USDC-based rails solve the floor;
Nevermined claims $0.001 minimum.

**What breaks at scale:** an agent making 1,000 calls/session at $0.001 = $1.00;
at $0.01 = $10.00. Without a cap, an autonomous agent in a retry loop can exhaust
a budget silently. Pay-per-call without budget enforcement is dangerous.

### 2. Prepaid budget (credit pool)

**Mechanism:** a human loads a credit pool (dollars, USDC, platform credits);
the agent draws from it per call; a hard stop when the pool empties.

**Examples:** Salesforce Flex Credits, Coinbase CDP facilitator credits, Payman
wallet with deposit.

**Best for:** use cases where the human wants predictable spend ceilings, with
zero unbounded risk.

**Trade-off:** prepaying ties up capital; underestimating budget pauses the agent
mid-task.

### 3. Subscription / capacity reservation

**Mechanism:** a fixed monthly fee buys a capacity block (token volume, call
count, or conversation count). The agent draws freely up to the block.

**Examples:** OpenAI API tiers, Anthropic API tiers, Salesforce Agentforce
Conversations model ($2/conversation).

**Best for:** predictable, high-volume workloads where capacity utilization is
consistently high.

**What breaks:** bursty agent workloads rarely hit consistent utilization;
pay-per-call wins on cost for low-utilization months. Heavy agentic use can
exhaust a consumer subscription (the Hermes proxy pattern, described in
[cost-economics.md](../cost-economics.md), exploits idle capacity — it breaks
at heavy agentic load).

### 4. Outcome-based (pay per successful result)

**Mechanism:** payment tied to a completed task rather than individual calls.
Common in B2B AI services (e.g., Devin's $500/user/month covering N completed
tasks); emerging in agentic commerce (some Agentforce pricing is per resolved
customer case).

**Best for:** when the service provider absorbs cost risk and is confident in
success rates; aligns incentives.

**What breaks:** defining "successful completion" for open-ended agent tasks is
hard to make unambiguous; gaming and dispute risk is high.

### 5. Per-inference (agent-to-agent)

This is the emerging and still-unsolved model: **agent A calls agent B's
proprietary capability; agent B runs inference; who pays for B's LLM call?**

In practice as of May 2026, the answer is almost universally: **B's operator
absorbs B's inference cost**, and B charges A a per-call or subscription fee
that is supposed to cover it. This is the SaaS API model applied to agents.
No standard exists for passing actual inference cost through the call chain.

---

## The open problem: who pays when one agent taps another

This is the most interesting unresolved question in the agent economic layer.

**The specific scenario:** Personal agent A (running on behalf of User X) calls
Specialist Agent B (a knowledge service, coding assistant, or domain expert)
to answer a sub-question. B must:
1. Run its own LLM call to generate the answer.
2. Potentially call further tools (sub-agents C, D...) — each with their own
   inference cost.
3. Return the result to A.

**What exists today:**

- B's operator prices their API at some per-call or subscription rate that
  *should* cover B's average inference cost plus margin. A pays that rate. B
  absorbs variance. This is the AWS model applied to AI services.
- No protocol standard requires B to disclose its own inference cost to A. A
  has no way to know if a $0.01 API call triggered $0.08 of inference on B's
  side.
- x402 handles the A→B payment; it says nothing about B's internal cost
  structure or how B accounts for C's costs downstream.
- AP2's Mandate chain traces the authorization lineage of a commerce
  transaction, not the computational cost chain.

**The "inference leakage" problem:**

In a multi-hop chain (A → B → C → D), the caller two hops up has no
visibility into the inference cost being run on their behalf. Current agent
frameworks (LangGraph, A2A, MCP) pass context but not cost telemetry. OpenTelemetry
GenAI semantic conventions provide the vocabulary for attribution, but there is no
binding standard requiring cost propagation.

**What would be needed for a real solution:**

A complete solution requires three primitives that do not yet exist together:
1. **Declared cost capability on each agent's service card** — the agent
   registry entry states its inference cost model (per call, per token, or
   subscription). A2A's agent discovery card has no cost field yet.
2. **A2A-level cost envelope** — when A delegates to B, B's response includes
   a cost receipt (tokens consumed, inference cost at B's rate). A can
   propagate this up to X's trust ledger.
3. **Nested budget delegation** — X authorizes A with budget $5; A authorizes
   B with $2 of that; B authorizes C with $0.50 of that. Each level enforces
   its sub-budget before spending upstream budget. No standard implements this
   as of May 2026.

Payman AI's multi-tier approval chains come closest conceptually, but are
designed for human-facing banking flows, not agent-to-agent inference cost chains.
AP2's delegation mandates address authorization scope but not cost propagation.
This is genuinely open territory.

---

## Implications for our differentiation (observations, not a decision)

The user's "token budget approval" idea maps onto a real, unresolved problem.
Here is what the research reveals about what's buildable and what requires
heavy infrastructure:

### What is well-understood and buildable without crypto rails

**A per-agent dollar/token budget with a hard stop is a solved problem at the
implementation level.** The patterns are clear: a credit pool, per-call decrement,
configurable warning thresholds, and a hard stop when the pool empties. No
blockchain required. Payman, Salesforce, Kong, and `tokencap` all implement
variants. The UX of "I approve Agent B to spend up to $5 on my behalf" is:
a credit allocation to a named agent identity, stored locally, decremented on
every metered call B makes.

**Cost attribution across a call chain** is also buildable using OpenTelemetry
spans with `gen_ai.*` attributes. Every agent hop emits a child span; root span
aggregates cost. Langfuse and LangSmith already do this for observability.
Turning it into *enforcement* (stop when the root-span cost exceeds budget)
is an engineering exercise, not a research problem.

**The trust ledger angle** (from [differentiation.md](../differentiation.md)) fits
naturally here: a live display of "Agent B has spent $1.23 of your approved $5.00
on 47 tool calls since you approved it" is a concrete, demoable UX for the
progressive-trust thesis — inspectable spending, not asserted.

### What requires crypto rails or institutional infrastructure

**x402 and AP2** both require EVM-compatible wallets and USDC to function as
designed. Setting one up is not hard (Coinbase CDP provides SDKs), but
explaining USDC wallets to a non-crypto-native user is a significant onboarding
hurdle. For a personal assistant targeting mainstream users, this is a
compatibility story, not a launch-day requirement.

**Regulated agentic banking** (Catena Labs's direction) requires a bank charter
— literally years and tens of millions of dollars of regulatory work. Not a
near-term option for any new project.

**Agent identity + KYA compliance** (Skyfire's KYAPay) matters when agents
interact with third-party merchants who need to know "which agent is spending."
For intra-system personal agent use (my agent calls my sub-agents), the identity
problem is trivial — the user already controls all parties.

### The specific "approve others with token budgets" UX

This is the interaction pattern the user called out explicitly. The research
suggests:

1. **The concept is architecturally sound** and maps onto real prior art
   (AP2 Intent Mandate, Payman spending policies, Stripe SPTs all formalize
   the same delegation idea with different transport mechanisms).

2. **For personal-agent-to-personal-agent interaction** (user X grants their
   agent A permission to call agent B, with a $5 ceiling), the implementation
   is:
   - Agent B exposes a cost-per-call rate in its service description.
   - User X reviews the rate and approves a budget.
   - Agent A gets a scoped authorization (locally stored or cryptographically
     signed) that B validates before running.
   - B decrements the budget on each call; A can observe the running total
     in the trust ledger.
   - At budget exhaustion, B returns a "budget exceeded" signal rather than
     running inference.

3. **The missing standard is the inter-agent cost envelope** — there is no
   established format for B to declare its cost model to A before the
   authorization happens, or to return a cost receipt alongside its response.
   Building this is the novel piece; it sits above the existing protocol layer.

4. **Practical risk:** the economic layer is attracting enormous investment
   (Visa, Mastercard, Stripe, Google, Coinbase, and multiple funded startups
   are all moving here). A personal assistant that implements budget delegation
   at the local/intra-system level can do so today with modest engineering.
   Plugging into the emerging external payment rails (x402, AP2) is an
   extension path — additive, not foundational.

---

## Sources

- [x402 documentation — Coinbase Developer Platform](https://docs.cdp.coinbase.com/x402/welcome) — technical HTTP flow, settlement, supported chains (accessed May 2026)
- [Introducing x402 — Coinbase blog, May 2025](https://www.coinbase.com/developer-platform/discover/launches/x402) — original launch announcement
- [x402 on Stellar — Stellar Foundation, 2025](https://stellar.org/blog/foundation-news/x402-on-stellar) — multi-chain expansion
- [Cloudflare x402 launch blog, Sep 2025](https://blog.cloudflare.com/x402/) — x402 Foundation co-founding, Workers native support
- [x402 Protocol Explained — Stablecoin Insider](https://stablecoininsider.org/x402-protocol/) — transaction volume figures ($600M annualized, 119M+ txns, Apr 2026)
- [Announcing AP2 — Google Cloud Blog, Sep 16, 2025](https://cloud.google.com/blog/products/ai-machine-learning/announcing-agents-to-payments-ap2-protocol) — three Mandates, 60+ backers, A2A relationship
- [AP2 Protocol Documentation — ap2-protocol.org](https://ap2-protocol.org/) — technical spec
- [AP2 Explained — Paz.ai glossary](https://www.paz.ai/glossary/agent-payments-protocol-ap2) — v0.2 status (Apr 2026)
- [A2A Protocol one-year update — Linux Foundation, Apr 2026](https://www.linuxfoundation.org/press/a2a-protocol-surpasses-150-organizations-lands-in-major-cloud-platforms-and-sees-enterprise-production-use-in-first-year) — 150+ organizations, enterprise production use
- [Stripe Agentic Commerce Suite announcement](https://stripe.com/blog/agentic-commerce-suite) — SPTs, ACP, merchant partners
- [Stripe Sessions 2026 — machine payments and agentic commerce protocols](https://www.youtube.com/watch?v=uBGqhGRzkuU)
- [Stripe, Google partner on agentic commerce — Payments Dive](https://www.paymentsdive.com/news/stripe-google-partner-on-agentic-commerce/818915/)
- [Skyfire exits beta — BusinessWire, Mar 6, 2025](https://www.businesswire.com/news/home/20250306938250/en/Skyfire-Exits-Beta-with-Enterprise-Ready-Payment-Network-for-AI-Agents)
- [Skyfire KYAPay + Visa Intelligent Commerce demo — BusinessWire, Dec 2025](https://www.businesswire.com/news/home/20251218520399/en/Skyfire-Demonstrates-Secure-Agentic-Commerce-Purchase-Using-the-KYAPay-Protocol-and-Visa-Intelligent-Commerce)
- [KYAPay / Know Your Agent framework — Stellagent, 2026](https://stellagent.ai/insights/skyfire-kyapay-know-your-agent)
- [PayPal Agentic Commerce Services launch — PayPal newsroom, Oct 28, 2025](https://newsroom.paypal-corp.com/2025-10-28-PayPal-Launches-Agentic-Commerce-Services-to-Power-AI-Driven-Shopping)
- [Visa, Mastercard, PayPal Q4 2025 agentic moves — Paz.ai](https://www.paz.ai/blog/the-payment-networks-are-all-in-what-visa-mastercard-and-paypals-q4-moves-signal)
- [Visa Intelligent Commerce Connect — TechInformed, 2025](https://techinformed.com/visa-opens-one-integration-for-ai-agent-payments/)
- [Visa + partners complete secure AI transactions — Visa press release](https://usa.visa.com/about-visa/newsroom/press-releases.releaseId.21961.html)
- [Payman AI product page — paymanai.com](https://paymanai.com/) — spending limits, approval chains architecture
- [Payman AI $14M funding — startuphub.ai](https://www.startuphub.ai/startups/payman-ai-1773747217006) — Visa, Coinbase Ventures backing
- [Catena Labs $30M Series A — Fortune, May 20, 2026](https://fortune.com/2026/05/20/catena-labs-series-a-sean-neville-ai-native-bank/) — OCC bank charter filing
- [Catena Labs ACK open-source — BlockEden, Oct 2025](https://blockeden.xyz/blog/2025/10/28/catena-labs-building-the-first-ai-native-financial-institution/)
- [Nevermined AI agent payment systems — Nevermined blog, 2025–2026](https://nevermined.ai/blog/ai-agent-payment-systems) — MCP paywall, transaction figures
- [MCP monetization — Nevermined blog](https://nevermined.ai/blog/mcp-monetization-ai-agents)
- [Masumi Network case study — Cardano Foundation](https://cardanofoundation.org/case-studies/masumi) — enterprise users, transaction volume
- [Masumi Network — developers.cardano.org](https://developers.cardano.org/docs/build/integrate/ai-agents/masumi/) — technical architecture
- [Salesforce Agentforce pricing — salesforce.com](https://www.salesforce.com/agentforce/pricing/) — Flex Credits, Digital Wallet, caps
- [Salesforce Agentforce Credits guide — jitendrazaa.com, 2026](https://www.jitendrazaa.com/blog/salesforce/salesforce-agentforce-credits-cost-model-complete-guide-2026/)
- [Kong AI Rate Limiting Advanced — Kong docs](https://konghq.com/blog/engineering/token-rate-limiting-and-tiered-access-for-ai-usage) — token quotas, hard stops, per-agent attribution
- [Kong Agent Gateway — TechEdgeAI, Dec 2025](https://techedgeai.com/kong-unveils-agent-gateway-to-govern-multi-agent-ai-traffic-across-enterprises/)
- [OpenTelemetry GenAI semantic conventions — DEV Community, 2025](https://dev.to/x4nent/opentelemetry-genai-semantic-conventions-the-standard-for-llm-observability-1o2a) — experimental status, gen_ai.* attributes
- [Langfuse token and cost tracking — langfuse.com](https://langfuse.com/docs/observability/features/token-and-cost-tracking)
- [LangSmith cost tracking — LangChain docs](https://docs.langchain.com/langsmith/cost-tracking)
- [tokencap — GitHub: pykul/tokencap](https://github.com/pykul/tokencap) — open-source token budget enforcement
- [Build a pay-per-call MCP server — DEV Community, 2026](https://dev.to/kirothebot/i-built-a-pay-per-call-mcp-server-heres-what-the-agent-payment-stack-actually-looks-like-5a5o) — practical stack walkthrough
- [AI agent pricing models — EMA, 2026](https://www.ema.ai/additional-blogs/addition-blogs/ai-agents-pricing-strategies-models-guide) — five model taxonomy
- [API pricing models — Zuplo](https://zuplo.com/blog/8-types-of-api-pricing-models) — pay-per-request vs subscription vs credits
