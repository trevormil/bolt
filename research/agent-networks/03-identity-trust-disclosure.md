---
title: "Agent Identity, Trust, Authorization & Disclosure Control"
subject: agent-identity-trust
date: 2026-05-26
status: research
note: >
  Point-in-time research snapshot (May 2026). Standards in this space are
  evolving rapidly; verify cited specs against IETF, W3C, and CNCF sources
  before acting on any implementation detail here. No product decision is
  made or implied by this document.
---

# Agent Identity, Trust, Authorization & Disclosure Control

The central question animating this document: when your personal agent talks
to a stranger's agent on your behalf, what should it disclose, how should the
peer prove who it is, and what limits should you be able to set on both sides?
Most current work addresses this for enterprise agents (corporate identity
federation, IT-managed workloads). The personal-agent version — two individuals'
private assistants negotiating an interaction — is underserved by every major
framework as of mid-2026.

---

## At a glance

| Approach | What it solves | Maturity (May 2026) | Primary governance body |
|---|---|---|---|
| **A2A Agent Cards** | Discovery and capability advertisement; cryptographically signed identity for well-known-URL agents | Production — v1.2 stable, 150+ org adopters | Linux Foundation A2A Project (donated by Google, June 2025) |
| **OAuth 2.1 + MCP auth** | Delegated access from user to agent; scoped tokens for tool calls | Spec stable (2026-03-15 MCP); implementations proliferating | IETF (OAuth) + MCP Spec |
| **OBO (On-Behalf-Of) flow** | Preserving user identity through agent delegation chains | RFC 8693 stable; IETF draft for agent-specific extension active | IETF OAuth WG |
| **Macaroons / IBCTs** | Attenuated, holder-narrowable capability tokens for multi-hop delegation | Academic + startup (SatGate, AIP paper March 2026); no dominant RFC | AIP arxiv 2603.24775; Google DeepMind "Intelligent AI Delegation" Feb 2026 |
| **W3C DIDs v1.1** | Decentralized, ledger-anchored agent identity without a central issuer | Candidate Recommendation (March 2026) | W3C DID WG |
| **W3C Verifiable Credentials + SD-JWT / BBS+** | Selective attribute disclosure without revealing the full credential | VC 2.0 stable; SD-JWT RFC 7519 extension active; BBS+ IETF draft | W3C / IETF |
| **SPIFFE/SPIRE** | Workload identity for agent processes — cryptographic identity tied to execution environment, not human operator | CNCF graduated project; active AI-agent community adoption 2025–2026 | CNCF |
| **Microsoft Entra Agent ID** | Enterprise lifecycle management of agent identities; parent-child blueprint inheritance | Public Preview (Ignite 2025); GA April 30, 2026 | Microsoft |
| **Okta for AI Agents / Auth0 XAA** | Identity governance for third-party and homegrown agents in B2B/SaaS contexts | Early Access → GA April 30, 2026 | Okta / Auth0 |
| **Visa TAP / Mastercard Agent Pay / AP2** | Agent identity attestation for commerce/payment flows | Live production pilots (Visa TAP, Mastercard first live tx Sept 2025); AP2 FIDO-donated 2026 | FIDO Alliance (AP2) |

---

## Identity and authentication

### Agent Cards (A2A Protocol)

Google announced the Agent-to-Agent (A2A) protocol in April 2025 and donated it to the Linux Foundation in June 2025. By April 2026, 150+ organizations had committed adopters, with production deployments at Microsoft, AWS, Salesforce, SAP, and ServiceNow. The current stable release is v1.2, landed March 2026.

Every A2A-compliant agent publishes an **Agent Card** at the well-known URL
`/.well-known/agent-card.json`. The card is a JSON metadata document describing:
- Agent name, description, and service endpoint
- Declared capabilities and "skills" (structured task types the agent accepts)
- Authentication requirements the caller must satisfy
- Cryptographic signature over the card, allowing a receiving agent to verify the card was issued by the domain owner

The signature is the key identity claim. An Agent Card without a signature is a
self-declaration with no attestation; a signed card proves the declaring entity
controls the domain. This is analogous to a TLS certificate for service identity —
it binds a name to a key, but says nothing about whether that service should be
trusted with *your* private data.

**Critical limitation:** A2A identity is domain-scoped and enterprise-centric.
It authenticates a service (an agent at `agent.company.com`) not an individual
acting for a person. A personal agent running on a home server or a consumer
SaaS has no natural domain authority to sign an Agent Card against. The protocol
does not address per-person agent identity or delegated personal authority.

### W3C Decentralized Identifiers (DIDs)

W3C published DID v1.1 as a Candidate Recommendation on March 5, 2026. A DID is
a resolvable URI (`did:method:identifier`) that points to a DID Document containing
the agent's public keys, service endpoints, and metadata — all without a central
identity provider. The DID owner (the agent or its controller) holds the private
key material.

For AI agents, the architecture proposed in arxiv:2511.02841 (Anonym et al.,
November 2025) equips each agent with:
1. A ledger-anchored DID as its persistent identifier
2. A set of third-party-issued Verifiable Credentials bound to that DID
3. A DID-Auth challenge-response for mutual authentication at session start

The peer-to-peer property is important for personal agents: two individuals'
agents can authenticate each other without routing through either person's
enterprise identity provider. The DID resolves to a public document; the keys
prove control; the VCs prove attributes. No central federation required.

**Practical status:** DID adoption is accelerating in crypto-native and
high-assurance contexts. For mainstream personal agents, DID tooling is early —
key management UX, rotation, and recovery are unsolved for non-technical users.
The EU digital identity wallet mandate (end-of-2026 deadline) is driving
institutional adoption that may spill over to personal agent use cases.

### SPIFFE/SPIRE for workload identity

SPIFFE (Secure Production Identity Framework For Everyone, CNCF graduated
project) provides cryptographic identity for *process workloads* rather than
human users. A SPIRE agent runs on each node; it attests the workload's
execution environment (OS, container, cloud instance metadata) and issues
a short-lived SPIFFE Verifiable Identity Document (SVID) — an X.509 certificate
or JWT bound to the workload.

The identity claim is of the form: "This is the process running as the
`frontend-agent` workload on this verified host, issued by this trust domain."
Uber reportedly issues over one billion SPIFFE-based credentials per day for
internal workloads.

Applied to AI agents (HashiCorp blog, 2025; Riptides, 2026): a SPIFFE ID can
uniquely identify an agent process and its deployment environment, enabling
mutual TLS between agents without shared secrets. The attestation roots the
identity in hardware/infrastructure, not just configuration — making it
significantly harder to spoof than an API key or a self-declared Agent Card.

**Gap for personal agents:** SPIFFE/SPIRE assumes an infrastructure operator
(a company running a SPIRE server across its fleet). There is no consumer-facing
SPIFFE deployment model. A personal agent on a laptop has no obvious way to
join a trust domain or receive SPIRE attestation. The workload-identity model
maps well to cloud-hosted personal agent services (where the hosting provider
runs SPIRE), but poorly to self-hosted personal deployments.

### Microsoft Entra Agent ID

Announced in May 2025, expanded to Public Preview at Ignite 2025, and reaching
GA on April 30, 2026. Entra Agent ID is the enterprise lifecycle management
system for agent identities within Microsoft's identity fabric.

Key capabilities:
- **Agent identity blueprints**: Templates with parent-child relationships; child
  identities inherit the parent's delegated permissions (configurable via
  `InheritDelegatedPermissions`) — reducing the consent complexity of large
  agent fleets.
- **Standard protocol support**: OAuth 2.0, MCP, and A2A.
- **Risk-adaptive access**: Same conditional access policies that apply to human
  users (MFA, location, device compliance) applied to agent identities.
- **Third-party federation**: AWS Bedrock and n8n agents can be imported via
  workload identity federation, giving them a governed Entra identity.

The governance model is enterprise-first. Entra Agent ID is the identity control
plane for organizations deploying agents, not for individuals delegating personal
authority to their own agent. The closest analog for personal use would be a
solo developer using a personal Azure tenancy — functional but architecturally
mismatched (the abstraction is IT-administered, not self-administered).

### Okta for AI Agents / Auth0 XAA

Okta entered Early Access with Okta for AI Agents in 2025, reaching GA on
April 30, 2026. Auth0's counterpart is XAA (cross-application agent authorization),
which enables B2B SaaS developers to build applications and AI tools that
participate in a broader "identity fabric."

Okta's framing: every agent — whether third-party or homegrown — gets brought
into a single control plane for authentication, governance, posture management,
threat response, and cross-application access. Non-human identities (NHIs)
including AI agents, service accounts, bots, and API keys are treated as a
unified class requiring active lifecycle management.

**Relevance to personal agents:** Both Okta and Auth0 are positioned as the
IdP an organization uses for its agents, not as the identity layer a person
uses for their personal agent. Consumer-facing agent identity is an adjacent
gap neither product addresses.

---

## Delegated authority and scoped capability

### The core problem: who authorized this action?

When an autonomous agent reads your email, schedules a calendar event, or
transfers funds, the service receiving that action needs to know:
1. Who (human) authorized it?
2. Which agent is executing it?
3. What scope was granted — and what was explicitly excluded?
4. Is this authorization still valid?

Traditional OAuth answers (1) and (3) for a single hop. It breaks down when
agent chains are 5–10 hops deep, when the agent must further delegate to a
sub-agent, or when the token must travel across trust boundaries between
different individuals' agents.

### OAuth 2.1 and MCP Authorization

The MCP specification (current stable: 2026-03-15) mandates OAuth 2.1 for
protected resource authorization. Key elements:

- **MCP server as resource server; MCP client as OAuth client**: The user
  authenticates to the authorization server; the client (agent) receives a
  scoped access token.
- **PKCE required for all flows**: Prevents authorization code interception.
- **Resource Indicators (RFC 8707)**: Tokens are tightly scoped to specific
  MCP servers, preventing mis-redemption (a token issued for one MCP server
  cannot be used at another). Mandated in the 2026-03-15 spec.
- **RFC 9728 (Protected Resource Metadata)**: Servers advertise their
  authorization server location, enabling automated discovery.
- **Incremental scope consent (2026 update)**: Clients request only the minimum
  scope needed for each operation, aligning with the principle of least privilege.
- **Role-based authorization via annotations (2026 update)**: Fine-grained
  per-tool access control using tool annotations.

The MCP auth layer answers the delegated-authority question for a single
user-to-agent-to-tool hop. It does not natively address agent-to-agent
delegation where the second agent is acting for a different user.

### On-Behalf-Of (OBO) and IETF draft extensions

RFC 8693 (OAuth 2.0 Token Exchange) defines the on-behalf-of (OBO) flow:
Agent A holds a token for User X and calls Service B as Agent A on behalf
of User X. Service B receives a new token naming both the user and the
acting agent. The `act` claim in RFC 8693 supports nested delegation chains
— each hop appends its identity, producing an auditable chain of principals.

For AI-specific scenarios, there is an active IETF draft
(`draft-oauth-ai-agents-on-behalf-of-user-01`) that extends OAuth 2.0 to
cover agentic delegation semantics, including constraints on what the agent
can do in the user's name beyond what the base OAuth flows express.

**Key invariant across all OBO variants:** the output token is the intersection
of user permissions, agent permissions, and target API permissions. A user
cannot grant an agent more access than the user has; an agent cannot grant a
sub-agent more access than the agent has. Each hop produces a strictly
more-constrained token.

### Macaroons and Invocation-Bound Capability Tokens (IBCTs)

Macaroons (Birgisson et al., Google, 2014; validated for AI delegation contexts
by Google DeepMind "Intelligent AI Delegation," February 2026) are capability
tokens with a key structural property: the *holder* can append additional
caveats (restrictions), narrowing the token's authority without contacting
the issuer. The resulting token is verifiable by any party with the root key.

This inverts the traditional revocation-centric model: instead of issuing
a broad token and revoking when needed, you issue a broad token and atturate
(narrow) it at each delegation step. The narrowed token cannot be broadened
without the issuer.

For multi-hop agent delegation:
1. User issues a broad macaroon to their personal agent (e.g., "can read
   my calendar, send emails on my behalf, but not delete anything")
2. Personal agent further attenuates before passing to a sub-agent ("only
   read calendar entries for the next 7 days")
3. Sub-agent can further attenuate again but cannot remove the parent's
   restrictions

The **AIP (Agent Identity Protocol)** paper (arxiv:2603.24775, Sunil Prakash,
March 2026) formalizes this as **Invocation-Bound Capability Tokens (IBCTs)**:
tokens that fuse identity, attenuated authorization, and provenance binding
into an append-only chain. IBCTs operate in two wire formats:
- **Compact mode**: Signed JWT for single-hop cases
- **Chained mode**: Biscuit token with Datalog policies for multi-hop
  delegation with expressive constraints

The paper notes a scan of ~2,000 MCP servers found all lacked authentication,
and that A2A agent cards contain self-declared identities with no attestation
binding — motivating AIP as a cross-cutting identity+delegation primitive.
Reference implementations are available in Python and Rust.

SatGate (commercial, 2025–2026) implements macaroon-based capability tokens
for agent route restrictions, budget limits, and MCP tool scopes verified
cryptographically without database lookups.

### Delegation depth and budget constraints

A recurring design pattern in 2025–2026 agent authorization literature:
delegation chains should encode not just scope restrictions but also
*budget constraints* — time windows, action counts, cost ceilings, or
explicit lists of permitted tool calls. This converts authorization from a
binary gate into a scoped allowance, analogous to spending limits on a
corporate card rather than either full account access or no access.

The "Right to History" paper (arxiv:2602.20214, February 2026) proposes
energy-budget governance as a hard invariant: an agent cannot exceed its
authorized action budget even if instructed to do so. This provides a
structural enforcement mechanism that complements the cryptographic
identity layer.

---

## Disclosure, minimization, and "what to expose"

### Contextual integrity as a normative frame

Helen Nissenbaum's **contextual integrity** framework (originally 2004, "Privacy
as Contextual Integrity," Washington Law Review) holds that privacy is not
about keeping information secret but about information flowing *appropriately*
— according to the norms of the context in which it was originally shared.

The framework defines appropriate flow over five parameters:
- **Data subject**: Whose information is it?
- **Sender**: Who is transmitting it?
- **Recipient**: Who is receiving it?
- **Information type**: What category of information?
- **Transmission principle**: Under what conditions or norms?

For personal agents, this framing directly addresses the "what should I expose?"
question: the agent should reveal information whose transmission is
contextually appropriate given the type of information, the identity of the
peer agent/user, and the norms of the context. Medical history shared with
a doctor's agent is appropriate; the same information shared with a scheduling
agent is not — even if both agents are operating on your behalf.

A 2026 CMU Heinz College framework extends contextual integrity by elevating
**purpose** to a constitutive parameter, enabling detection of scope creep:
an agent can be authorized to share information for purpose P but not purpose
Q, even if the same information is involved.

Research operationalizing contextual integrity for AI assistants (arxiv:2408.02373)
develops mechanisms to enforce contextually appropriate information flows,
requiring the agent to:
1. Understand the context of each potential disclosure action
2. Reason about its appropriateness under applicable norms
3. Execute only if deemed appropriate

Microsoft Research published work in January 2026 on LLM-native contextual
integrity enforcement, attempting to encode privacy norms into model prompting
and inference-time constraints rather than external policy engines.

### Selective disclosure: W3C VCs, SD-JWT, and BBS+

When an agent does need to prove something about itself or its principal, it
should prove *exactly that* and nothing more. Two cryptographic primitives
enable this:

**SD-JWT (Selective Disclosure JWT)**: An IETF extension to RFC 7519 where
individual claims are individually committed — the holder can reveal a subset
of claims from the issued credential without revealing others. If an agent
needs to prove "my principal is over 18," it reveals that claim; the issuer's
name, the principal's birthdate, and other claims remain hidden. SD-JWT is
the leading practical implementation for selective disclosure as of 2026.

**BBS+ signatures**: A different cryptographic primitive (pairing-based
signatures) where the holder can derive a *zero-knowledge proof* that they
hold a credential with certain attributes, without revealing the signature
itself. Because each derived proof looks different (unlinkability property),
BBS+ prevents the verifier from correlating multiple interactions — even if
the agent proves the same attribute repeatedly, the proofs are unlinkable.

For personal agents: selective disclosure means the agent can prove "my
principal authorized this class of action" without revealing the principal's
identity, or prove "I am authorized to schedule on behalf of a medical
professional" without revealing which medical professional. This is the
technical primitive that makes contextual appropriateness enforceable without
total transparency.

The W3C VC 2.0 data model supports both SD-JWT and BBS+; the IETF SD-JWT
RFC is active.

### PUDA and user-sovereign data architectures

PUDA (Private User Dataset Agent, arxiv:2602.08268, February 2026) is a
user-sovereign architecture for personal data: the user controls what is shared
at three graduated privacy levels:
1. **Detailed browsing history** (full resolution)
2. **Extracted keywords** (reduced resolution)
3. **Predefined category subsets** (coarsest: topical interests only)

The paper reports that sharing predefined category subsets achieves 97.2% of
the personalization performance of full history disclosure — quantifying the
privacy/utility tradeoff at the coarsest disclosure level.

For personal agents, PUDA's architecture instantiates the *disclosure ladder*
idea: the agent doesn't default to sharing all available context; it shares
the minimum level that achieves the task, and the user configures which
level applies to which contexts.

### ARIEL: personalized privacy decision-making via logical entailment

arxiv:2512.05065 (December 2025, updated March 2026) introduces ARIEL
(Agentic Reasoning with Individualized Entailment Logic). The problem
ARIEL addresses: general privacy norms fail to capture individual users'
diverse and nuanced preferences; few-shot in-context learning for
personalization is unreliable and opaque.

ARIEL's mechanism: combine an LLM for semantic reasoning with a rule-based
logical entailment layer that determines whether the user's prior decision
on a data-sharing request logically implies the same decision for a new
request. If the user previously declined to share their home address with
a ride-share agent, ARIEL infers the user would also decline to share it
with a delivery agent, without asking again.

Reported result: 40.6% reduction in F1 error rate for privacy judgments
versus standard in-context learning.

For personal agents, ARIEL represents the closest existing work to "teaching
an agent what its user wants to keep private, persistently, without per-request
prompts."

### GDPR, ICO, and regulatory framing

The UK ICO published its early views on agentic AI and data protection in
January 2026. Key positions:
- **Consent challenges**: Explicit consent is difficult in multi-agent settings
  unless users have genuine choice, including the ability to use the system
  without sharing special-category data.
- **Data minimization (GDPR Article 5(1)(c))**: For AI agents, this means
  designing context payloads so each agent receives only the data required for
  its specific task — not bulk context from the whole user profile.
- **Purpose limitation**: Personal data shared for purpose P may not be
  repurposed for Q by the receiving agent.

The EU AI Act (fully applicable August 2026) requires high-risk AI systems to
maintain logs sufficient for post-hoc auditing, adding an auditability dimension
to disclosure: what was shared must be reconstructible.

The European Data Protection Supervisor (EDPS) issued parallel guidance on
agentic AI emphasizing that the data-minimization and purpose-limitation
principles apply at every inter-agent hop, not just at the human-to-agent boundary.

### AgentDAM: data minimization as a measurable benchmark

AgentDAM (2025) is a benchmark for evaluating how well AI agents satisfy data
minimization during task execution. It operationalizes "minimum necessary data"
as a measurable property, enabling comparison of agent architectures on privacy
grounds rather than just capability grounds. The benchmark is relevant both for
evaluation (does this agent over-share?) and for training-time alignment (can
we fine-tune agents to minimize disclosure?).

---

## Trust between strangers' agents

### The two-strangers problem

All enterprise agent-auth frameworks assume a pre-existing trust relationship:
a company trusts its own agents (via Entra Agent ID, SPIFFE, etc.); a user
trusts MCP servers they explicitly configure. The harder problem — two people
with no prior relationship whose agents need to interact — is structurally
different and underserved.

The canonical scenario: User A and User B have never met. User A's personal
agent contacts User B's personal agent to negotiate a meeting time. How does
User B's agent decide:
- Is this legitimately User A's agent, or a spoof?
- What category of agent is this (personal assistant, automated scraper, etc.)?
- What should User B's agent reveal in response (calendar availability vs. full
  calendar vs. nothing)?

### A2A reputation extension proposals

A2A v1.2 (March 2026) does not include a reputation layer. However, a notable
community discussion thread (GitHub a2aproject/A2A #1631, "Proposal:
Reputation-Aware Agent Discovery") is actively exploring a trust extension
where agent cards include attestations from prior interactions. The proposal is
not merged as of May 2026 but has significant engagement from enterprise
adopters, indicating real demand.

### Agent Name Service (ANS) and trust domain discovery

Complementing A2A, an Agent Name Service (ANS) — analogous to DNS for agent
discovery — has emerged in community proposals. Combined with Agent Cards and
signed credentials, ANS would allow agents to discover and authenticate peers
by name rather than by pre-configured endpoint. The identity layer (who claims
to be `alice@agent.example.com`) would be separated from the trust layer (should
I trust that identity for this action?).

### Certified reputation and web-of-trust models

The "Certified reputation: how an agent can trust a stranger" model
(multi-agent systems literature, academia.edu) proposes that trust can be
bootstrapped from third-party attestations: Agent B can receive a credential
from a mutually trusted third party attesting that Agent A has a track record
of honest interactions. This is the agent analog of reputation systems in
e-commerce (a seller's rating from past buyers), made cryptographically
verifiable via VCs.

Practical instantiation for personal agents: a user's personal agent could
carry a credential issued by a well-known service ("this agent represents a
verified human user, not an automated crawler") that peer agents can check
without contacting the issuing service (via offline VC verification).

### The Agent Trust Problem (ATP) and Lyrie.ai

Lyrie.ai exited stealth on May 11, 2026 with the Agent Trust Protocol (ATP),
described as the first open cryptographic standard for AI agent identity
verification, and was accepted into Anthropic's Cyber Verification Program
(CVP). ATP addresses the observation: "when an autonomous agent reads email,
executes code, moves money, or signs a contract on behalf of a human operator,
the system receiving that action has no reliable way to verify who authorized
it, what scope that agent was granted, or whether its instructions have been
tampered with in transit."

ATP is very recent (May 2026); implementations and adoption are nascent.
Flagging as emerging rather than production-ready.

### Identity layering in payment contexts (TAP/AP2)

The payment networks have had to solve the two-strangers problem for agent
commerce, producing the most operationally tested approaches:

**Visa Trusted Agent Protocol (TAP)** (announced 2025, live pilots by
end-2025): TAP adds a digital proof-of-identity to every agent-initiated
transaction using cryptographically signed HTTP messages carrying the agent's
intent, verified user identity, and payment details. The proof travels
with the transaction, allowing the merchant to verify authorization without
a real-time check against the user.

**Mastercard Agent Pay / Verifiable Intent** (first live transaction
September 29, 2025): Verifiable Intent is a multi-party evidence object that
survives beyond the browsing session, intended for post-hoc dispute resolution
as well as real-time authorization.

**AP2 (Agent Payments Protocol)** (Google-proposed, donated to FIDO Alliance,
2026): A vendor-neutral mandate format now accepted by Mastercard as Verifiable
Intent. Stripe and Visa are both signed onto AP2.

The payment-context trust solution pattern: the agent carries a signed
delegation credential that proves user consent for this specific class of
action. The merchant/service does not need to contact the user; it verifies
the credential cryptographically. The credential encodes scope (this agent
can spend up to $X on category Y) and expiry.

This pattern is directly applicable to non-payment agent interactions: personal
agent A carries a signed delegation credential from its user authorizing
interaction with peer agents in context C, with disclosed attributes D and
excluded attributes E.

---

## The personal-agent gap

### Why enterprise frameworks don't fit

The entire 2025–2026 identity landscape for agents was built for one use case:
a company deploying AI agents to automate its internal workflows. Every major
platform (Entra Agent ID, Okta for AI Agents, SPIFFE, A2A enterprise flows)
assumes:
- A human IT administrator manages the identity infrastructure
- Agents operate within a known trust domain (a corporate tenancy, a
  SPIFFE trust domain, an enterprise federation)
- The agent's principal is the organization, not an individual person
- "Disclosure" means controlling which departments' data the agent can access,
  not what one person's agent reveals to another person's agent

This leaves personal agents in an identity vacuum. The closest existing
constructs are:
- A2A agent cards with domain-based signatures (works if you control a domain;
  meaningless for a consumer agent)
- OAuth 2.1 delegated access (answers user-to-agent delegation; silent on
  agent-to-agent across different users)
- W3C DIDs (technically applicable to personal agents; UX and key management
  are unresolved for non-technical users)

### The specific gap: progressive per-context disclosure

Even the most privacy-forward work (ARIEL, PUDA, contextual integrity
operationalizations) addresses disclosure from a user to their own agent, or
from an agent to tools/services. The underaddressed problem is:

> Your personal agent holds your sensitive private context — health history,
> relationship details, financial state, schedule, preferences, ongoing
> commitments. When another person's agent contacts yours, your agent must
> decide, per interaction, what to reveal. The decision is:
> - *Who is this peer agent?* (identity and authentication)
> - *What level of trust does this peer deserve?* (potentially starting at zero)
> - *What does this interaction actually require?* (minimum necessary disclosure)
> - *Have I disclosed too much already?* (cumulative exposure tracking)
> - *What would my user want?* (preference inference without per-prompt asking)

No existing framework operationalizes all five decision points together. ARIEL
handles (5) for tool calls, not agent-to-agent. PUDA handles (3) for data
services, not peer agents. A2A/OBO/DIDs handle (1) and partially (2) in
enterprise contexts.

### The progressive trust connection

Vellum's actor identity model (guardian / trusted / unknown) is the closest
existing personal-agent approximation to the first two decision points: classify
incoming parties and enforce different capabilities per class. But the model is
static at session start — it classifies *channels* (who is messaging the agent),
not individual peer agents arriving via an agentic protocol. It also has no
mechanism for:
- Upgrading trust progressively based on interaction history or cryptographic
  attestation
- Narrowing disclosure based on the *purpose* of the current interaction
- Tracking cumulative disclosure across multiple interactions with the same
  peer agent

### Proof-of-action as a dual-direction requirement

Current "proof-of-action" work (Vellum's trust ledger concept; arxiv:2602.20214)
focuses on proving to the *user* what their agent did. The peer-agent trust
dimension requires a symmetric version: your agent must be able to prove to
a peer's agent that it was authorized to make a given disclosure, and the peer's
agent must be able to prove back that it is who it claims to be. The
cryptographic tools exist (IBCTs/macaroons, VCs, OBO tokens); the product-level
integration for personal agents does not.

### Budget-constrained disclosure as an underexplored primitive

Agent authorization literature (SatGate, AIP, "Right to History") is beginning
to encode *action budgets* — limits on how many actions, at what cost, over
what time window an agent may take. The disclosure analog — a *disclosure
budget* limiting how much context an agent may reveal in aggregate, to which
peers, over a given period — does not appear in any published framework. This
is a design space gap with direct product relevance: a personal agent that
maintains a running tally of what has been revealed to each peer agent, and
refuses to exceed a user-configured disclosure ceiling, would be novel.

---

## Implications for our differentiation (observations, not a decision)

These are observations about what the research suggests, not product decisions.

**1. The personal-agent disclosure problem is not solved by any incumbent.**
A2A, MCP auth, Entra Agent ID, Okta for AI Agents — all are enterprise-facing.
The personal version of "what does my agent reveal to your agent, and under
what conditions" is an open design space. Vellum's current guardian/trusted/
unknown model is the closest approximation, but it classifies channels not
peer agents, and has no per-purpose disclosure scoping.

**2. Contextual integrity is the right normative frame; it's not yet
operationalized at the agent-to-agent level.** Research exists on operationalizing
it for user-to-agent interactions. The agent-to-agent context (where both sides
have a principal with privacy interests) is the frontier. A product that
reasons about "would my user want this revealed to *this* agent for *this
purpose*" is doing something no existing framework does end-to-end.

**3. ARIEL's preference-learning approach is directly applicable and importable.**
The key insight — that per-request privacy prompts don't scale, but user
decisions can be generalized via logical entailment — is an implementation
pattern, not just an academic result. A personal agent that silently learns
"this user doesn't share location data with service agents" from one explicit
refusal, then applies that preference autonomously, is a materially better
UX than one that asks every time.

**4. The disclosure budget primitive doesn't exist yet.** Encoding a cumulative
disclosure ceiling per peer agent (analogous to action budgets in authorization
frameworks) is a novel design. If built, it would give users visibility into
"how much has my agent told your agent, total?" — an auditable disclosure
ledger rather than just an action ledger. This aligns directly with the D1
trust thesis (legible, inspectable trust) applied to the agent-to-agent layer.

**5. The cryptographic primitives are mature enough.** SD-JWT, BBS+, macaroons/
IBCTs, OBO tokens, DIDs — the building blocks for verifiable, selective, scoped
disclosure exist in production-ready (or near-production) form. The gap is not
in the cryptography; it is in product design that assembles them into a UX a
non-technical user can reason about.

**6. Payment-context attestation is the cleanest deployed analog.** Visa TAP
and Mastercard Agent Pay solved the "two strangers' agents" trust problem in
the specific context of commerce. Their core pattern — the agent carries a
signed delegation credential encoding scope and expiry; the counterparty
verifies it offline — generalizes. It is worth studying as a design template
for personal-agent interaction authorization.

**7. The personal-agent trust problem is harder than the enterprise version.**
Enterprise agents operate within administered trust domains with IT governance.
Personal agents meet strangers. The threat model includes adversarial peer
agents trying to extract private context through seemingly-legitimate requests.
Any personal-agent disclosure system needs to be adversarially robust, not just
cooperation-facilitating.

---

## Sources

### Primary specifications and standards

- [A2A Protocol Specification (v1.2, March 2026)](https://a2a-protocol.org/latest/specification/) — Agent Card format, cryptographic signing, capabilities
- [A2A Protocol — Google Cloud Blog upgrade announcement](https://cloud.google.com/blog/products/ai-machine-learning/agent2agent-protocol-is-getting-an-upgrade) — v1.2 governance and adoption context
- [A2A GitHub repository](https://github.com/a2aproject/A2A) — Linux Foundation governance, 150+ org adopters
- [MCP Authorization specification](https://modelcontextprotocol.io/specification/draft/basic/authorization) — OAuth 2.1 for MCP; resource indicators; PKCE; incremental consent
- [MCP OAuth 2.1 spec update (2026-03-15) — dasroot.net](https://dasroot.net/posts/2026/04/mcp-authorization-specification-oauth-2-1-resource-indicators/) — RFC 8707 resource indicators mandated
- [How MCP leverages OAuth 2.1 and RFC 9728 — Gentoro](https://www.gentoro.com/blog/how-mcp-leverages-oauth-2-1-and-rfc-9728-for-authorization/) — Protected Resource Metadata
- [OAuth MCP deep dive — kane.mx](https://kane.mx/posts/2025/mcp-authorization-oauth-rfc-deep-dive/) — Technical deconstruction of OAuth 2.1 + MCP
- [IETF draft: OAuth 2.0 AI Agents On-Behalf-Of](https://www.ietf.org/archive/id/draft-oauth-ai-agents-on-behalf-of-user-01.html) — Agent-specific OBO extension
- [Microsoft Entra: OBO flow for AI agents](https://learn.microsoft.com/en-us/entra/agent-id/agent-on-behalf-of-oauth-flow) — OBO mechanics for agentic delegation
- [W3C Verifiable Credentials Overview](https://w3c.github.io/vc-overview/) — VC data model
- [arXiv:2511.02841 — AI Agents with DIDs and VCs](https://arxiv.org/html/2511.02841v2) — DID+VC architecture for peer agent authentication; November 2025
- [arXiv:2603.24775 — AIP: Agent Identity Protocol](https://arxiv.org/pdf/2603.24775) — IBCTs; Biscuit tokens; multi-hop delegation; March 2026
- [IETF draft: Agent Identity Protocol](https://www.ietf.org/archive/id/draft-prakash-aip-00.html) — AIP IETF draft submission

### Workload identity and enterprise agent identity

- [HashiCorp: SPIFFE for agentic AI](https://www.hashicorp.com/en/blog/spiffe-securing-the-identity-of-agentic-ai-and-non-human-actors) — SPIFFE/SPIRE applied to AI agents
- [Riptides: How to deliver SPIFFE identity to AI agents](https://riptides.io/blog/how-to-deliver-spiffe-identity-to-ai-agents/) — Practical SPIFFE for agent identity
- [Security Boulevard: AI, SPIFFE, and non-human identity (Workload Identity Day 0, November 2025)](https://securityboulevard.com/2025/11/ai-spiffe-and-the-rise-of-non-human-identity-takeaways-from-workload-identity-day-0/) — Uber 1B credentials/day statistic
- [Microsoft Entra Agent ID — what it is](https://learn.microsoft.com/en-us/entra/agent-id/what-is-microsoft-entra-agent-id) — Official Microsoft Learn documentation
- [Microsoft Entra Agent ID — agent identities overview](https://learn.microsoft.com/en-us/entra/agent-id/agent-identities) — Blueprint inheritance, delegation
- [Microsoft Community Hub: Entra Agent ID announcement](https://techcommunity.microsoft.com/blog/microsoft-entra-blog/surfing-the-ai-wave-manage-govern-and-protect-ai-agents-with-microsoft-entra-age/2464407) — May 2025 introduction
- [Okta for AI Agents — Early Access announcement](https://www.okta.com/blog/ai/okta-ai-agents-early-access-announcement/) — Okta positioning and capabilities
- [Okta: Governing Agentic Identity (product page)](https://www.okta.com/products/govern-ai-agent-identity/) — Product scope
- [CISO Playbook: AI Agent Identity Management 2026](https://secureflo.net/ai-agent-identity-management-a-2026-ciso-playbook/) — Practitioner framing

### Delegated authority and capability tokens

- [arXiv:2603.24775 — AIP IBCTs](https://arxiv.org/abs/2603.24775) — Invocation-Bound Capability Tokens; primary AIP paper
- [Google DeepMind "Intelligent AI Delegation" validation — earezki.com](https://earezki.com/ai-news/2026-03-11-what-google-deepmind-gets-right-about-agent-delegation-and-what-satgate-already-built/) — DeepMind February 2026 framework validating macaroon-based delegation
- [Macaroon tokens vs API keys for AI agents — SatGate](https://satgate.io/blog/macaroon-tokens-vs-api-keys) — Commercial macaroon implementation
- [DEV Community: Macaroon tokens vs API keys](https://dev.to/mattdeangit/macaroon-tokens-vs-api-keys-why-capability-based-auth-beats-identity-based-auth-for-ai-agents-4nkl) — Capability-based vs identity-based auth comparison
- [Zylos Research: Agent authentication and delegated access (April 2026)](https://zylos.ai/research/2026-04-11-agent-authentication-delegated-access-oauth-scoped-tokens) — OBO, scoped tokens, identity patterns
- [WorkOS: OAuth OBO for AI agents](https://workos.com/blog/oauth-on-behalf-of-ai-agents) — OBO flow explainer for agent contexts
- [ScaleKit: On-Behalf-Of authentication for AI agents](https://www.scalekit.com/blog/delegated-agent-access) — Scoped, auditable delegation

### Disclosure, minimization, and contextual integrity

- [Nissenbaum, "Privacy as Contextual Integrity," Washington Law Review 79 (2004)](https://digitalcommons.law.uw.edu/wlr/vol79/iss1/10/) — Foundational contextual integrity theory
- [arXiv:2408.02373 — Operationalizing Contextual Integrity in Privacy-Conscious Assistants](https://arxiv.org/pdf/2408.02373) — Technical operationalization for AI assistants
- [CMU Heinz: New Framework for Privacy and AI (March 2026)](https://www.heinz.cmu.edu/media/2026/March/new-framework-addresses-privacy-dignity-risks-posed-by-modern-ai-systems) — Purpose-as-parameter extension
- [Microsoft Research: LLM contextual privacy (January 2026) — InfoQ](https://www.infoq.com/news/2026/01/microsoft-llm-contextual-privacy/) — Model-native CI enforcement
- [arXiv:2512.05065 — ARIEL: Personalizing Agent Privacy Decisions via Logical Entailment](https://arxiv.org/abs/2512.05065) — 40.6% error reduction; December 2025
- [arXiv:2602.08268 — PUDA: Private User Dataset Agent](https://arxiv.org/abs/2602.08268) — User-sovereign data architecture; 97.2% utility at coarsest disclosure level; February 2026
- [arXiv:2509.21712 — Not My Agent, Not My Boundary? (Privacy Boundaries in AI-Delegated Sharing)](https://arxiv.org/pdf/2509.21712) — Empirical study of disclosure acceptance under AI delegation
- [Dock.io: Selective Disclosure Guide (VCs)](https://www.dock.io/post/selective-disclosure) — SD-JWT and BBS+ explained
- [ScienceDirect: Cryptographic mechanisms for selective disclosure of VCs](https://www.sciencedirect.com/science/article/pii/S2214212624000929) — Academic comparison of BBS+, SD-JWT, and related schemes
- [Ont.io: Selective disclosure as privacy primitive for AI](https://ont.io/news/selective-disclosure-ai-evaluation/) — Applied selective disclosure for AI evaluation
- [ICO: Early views on agentic AI and data protection (January 2026)](https://www.insideprivacy.com/artificial-intelligence/ico-shares-early-views-on-agentic-ai-data-protection/) — UK regulatory position
- [EDPS: Agentic AI](https://www.edps.europa.eu/data-protection/technology-monitoring/techsonar/agentic-ai_en) — EU regulatory framing
- [FPF: AI Agents and Data Protection Considerations](https://fpf.org/blog/minding-mindful-machines-ai-agents-and-data-protection-considerations/) — GDPR/consent analysis
- [Atlan: Data Privacy Controls for AI Agents 2026](https://atlan.com/know/data-privacy-for-ai-agents/) — Bounded Context Space and data minimization for agents
- [arXiv:2503.09780 — AgentDAM: Privacy Leakage Evaluation](https://arxiv.org/pdf/2503.09780) — Data minimization benchmark

### Trust between strangers

- [GitHub a2aproject/A2A #1631 — Reputation-Aware Agent Discovery proposal](https://github.com/a2aproject/A2A/discussions/1631) — Community extension proposal
- [Zylos Research: AI Agent Identity, Discovery, and Trust Frameworks (March 2026)](https://zylos.ai/research/2026-03-07-ai-agent-identity-discovery-trust-frameworks) — ANS, TAP, Digital Agent Passports landscape
- [Aembit: IAM for Agentic AI (2026)](https://aembit.io/blog/iam-agentic-ai/) — Continuous cryptographic attestation framing
- [Certified reputation: how an agent can trust a stranger — academia.edu](https://www.academia.edu/6617675/Certified_reputation_how_an_agent_can_trust_a_stranger) — Multi-agent trust theory
- [Visa Trusted Agent Protocol — investor.visa.com](https://investor.visa.com/news/news-details/2025/Visa-Introduces-Trusted-Agent-Protocol-An-Ecosystem-Lead-Framework-for-AI-Commerce/default.aspx) — TAP announcement
- [Visa TAP — Oscilar analysis](https://oscilar.com/blog/visatap) — TAP mechanics and implications
- [Mastercard Agent Pay vs Visa vs Stripe 2026 — RisingWave](https://risingwave.com/blog/mastercard-agent-pay-vs-visa-vs-stripe-agentic-commerce/) — Comparative analysis
- [Finextra: Mastercard Verifiable Intent vs Visa TAP](https://www.finextra.com/blogposting/31107/deep-dive-mastercard-verifiable-intent-vs-visa-trusted-agent-protocol) — Architectural comparison
- [shashi.co: The Agent Trust Problem Has a Proposal (May 2026)](https://www.shashi.co/2026/05/the-agent-trust-problem-has-proposal.html) — ATP / Lyrie.ai context

### Authorization and verifiable action records

- [arXiv:2602.20214 — Right to History: Sovereignty Kernel for Verifiable AI Agent Execution](https://arxiv.org/pdf/2602.20214) — Merkle audit logs, energy-budget governance, human approval; February 2026
- [arXiv:2603.20953 — Before the Tool Call: Deterministic Pre-Action Authorization](https://arxiv.org/pdf/2603.20953) — Pre-action authorization as a structural enforcement primitive
- [AIP paper on MCP server authentication gap — arXiv:2603.24775](https://arxiv.org/abs/2603.24775) — Scan of ~2,000 MCP servers finding all lack authentication
