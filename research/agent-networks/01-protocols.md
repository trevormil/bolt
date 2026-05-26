---
title: "Agent-Interop Protocol Landscape"
subject: agent-protocols
date: 2026-05-26
status: research
note: >
  Point-in-time snapshot (late May 2026). This space is moving faster than
  almost anywhere in tech: protocols are merging, spinning off, and being
  donated to foundations on a monthly cadence. Treat any governance or
  adoption claim here as "true as of the date above, verify before acting."
  No product decision is made or implied — this is raw landscape mapping.
---

# Agent-Interop Protocol Landscape

The thesis we are evaluating is a **trust, economic, and disclosure layer for
personal agents talking to each other** — the "HTTP of personal agents." Before
committing to that direction, we need to know: who has already built this, which
layers of the stack are contested, and where the genuine white space is. This
document maps every serious protocol in the field.

The short answer: the existing protocols are almost entirely an **enterprise and
infrastructure story**. Every major initiative is solving agent-to-agent
coordination within or between corporate deployments. Personal-agent trust —
specifically the question of what happens when _your_ agent talks to _my_ agent,
who authorized what, and what each party is owed disclosure of — is the least-
addressed layer in the stack.

---

## At a glance

| Protocol | Primary backer | Layer it addresses | Transport / discovery | Maturity (May 2026) |
|---|---|---|---|---|
| **A2A** (Agent2Agent) | Google / Linux Foundation (AAIF) | Agent-to-agent task delegation | HTTP + JSON-RPC 2.0 + gRPC; `/.well-known/agent.json` | Stable (v1.0, Mar 2026); 150+ orgs |
| **MCP** (Model Context Protocol) | Anthropic / Linux Foundation (AAIF) | Agent-to-tool/resource | stdio; Streamable HTTP (SSE deprecated) | Mature; donated to AAIF Dec 2025; 10K+ servers |
| **AGNTCY / SLIM** | Cisco Outshift / Linux Foundation | Discovery + secure transport stack | SLIM (gRPC-based pub/sub); OASF directory | Early-production; donated LF Jul 2025 |
| **ANP** (Agent Network Protocol) | Open-source community / W3C CG | Identity + P2P networking | HTTP with DID auth; `did:wba` method | Experimental; W3C CG since Jun 2025 |
| **ACP** (Agent Communication Protocol) | IBM / Linux Foundation (merged into A2A Aug 2025) | REST-based agent invocation | HTTP/REST | Merged; IBM now on A2A TSC |
| **LMOS** | Eclipse Foundation | Enterprise orchestration platform | HTTP/WebSocket/queues; central registry | Active development; ADL released Oct 2025 |
| **AGORA** | Open-source (academic) | Meta-protocol negotiation | HTTPS/JSON; LLM-driven protocol selection | Research/experimental |
| **AITP** | NEAR AI | Agent interaction + payments | HTTPS/JSON; threaded sessions | Early RFC; limited adoption |
| **Coral** | Coral Protocol (web3-adjacent) | MCP-based multi-agent coordination + payments | Built on MCP; Solana-backed payments | v1 launched 2025; experimental |
| **LOKA** | Academic (arxiv Apr 2025) | Decentralized identity + ethics governance | DID + VC + post-quantum crypto | Paper only; no production implementation |
| **Visa TAP** | Visa | Agent commerce trust (payment context) | Cryptographic signatures over HTTP | Pilot 2026; payment-specific |
| **Mastercard Verifiable Intent** | Mastercard / Google | Agent-authorized transaction proof | FIDO/W3C standards; open-sourced Mar 2026 | Commerce-specific; open spec |
| **FIPA-ACL** | FIPA consortium (IEEE) | Agent communication semantics | Custom; IIOP | Defunct (activity ceased ~2010); academic legacy |
| **KQML** | DARPA (academic) | Knowledge-sharing speech acts | Custom | Defunct; 1990s origin |

---

## A2A — Agent2Agent Protocol

**Who is behind it.** Google announced A2A on April 9, 2025, at Google Cloud
Next with 50+ technology partners at launch. Google donated the project to the
Linux Foundation in June 2025. In December 2025, A2A's home became the
Agentic AI Foundation (AAIF) — a directed fund under the Linux Foundation,
co-founded by Anthropic, OpenAI, Google, Microsoft, Amazon, and Block, among
49 inaugural member organizations. IBM joined the A2A Technical Steering
Committee in August 2025 when ACP merged in.

**What problem it solves.** A2A addresses agent-to-agent task delegation across
organizational and framework boundaries. Two agents built by different vendors,
in different languages, on different platforms, can exchange work without either
exposing its internal state, memory, or tools. The protocol is explicitly
complementary to MCP: MCP is the agent-to-tool interface; A2A is the
agent-to-agent interface.

**Technical mechanics.**

*Discovery.* Every A2A server publishes an **Agent Card** — a JSON document at
`/.well-known/agent.json` (per RFC 8615). The Agent Card declares: agent name,
description, service endpoint URL, supported authentication schemes (Bearer,
OAuth 2.0 flows, OpenID Connect, API keys, mutual TLS), capabilities (streaming,
push notifications), and skills (with input/output mode annotations). Starting
v0.3 (July 2025), Agent Cards can be cryptographically signed, allowing a
receiving agent to verify that the card was issued by the domain owner.

*Transport.* HTTP + JSON-RPC 2.0 as the primary wire format. v0.3 added
Protocol Buffers / gRPC as a first-class alternative for latency-sensitive
deployments. v1.0 formally stabilized both paths.

*Task lifecycle.* A2A defines seven task states: `SUBMITTED`, `WORKING`,
`COMPLETED`, `FAILED`, `CANCELED`, `INPUT_REQUIRED`, and `AUTH_REQUIRED`. This
last state — `AUTH_REQUIRED` — is a notable design choice: an in-flight task can
pause and surface an authentication requirement mid-stream rather than failing
silently.

*Streaming.* Server-Sent Events for real-time task progress. Events are
delivered in-order and MUST NOT be reordered. Long-running tasks can push
incremental results.

*Push notifications.* Webhook-based async delivery when the client cannot poll:
agents POST to a client-registered URL. The client manages webhook lifecycle via
four operations: create, get, list, delete.

*Message model.* Messages carry `role` ("user" or "agent") and contain `Parts`
— typed content units supporting plain text, binary files, URLs, and structured
JSON. Results are returned as `Artifacts` associated with a task, separating
output data from communication.

*Multi-turn sessions.* `contextId` groups related tasks; `taskId` identifies
individual tasks. Clients reference prior context to continue a conversation
thread.

*Trust and economic features.* None. A2A has no built-in mechanism for
reputation, cost disclosure, capability pricing, human consent chains, or
auditability of agent actions on behalf of a person. The spec explicitly
focuses on technical interoperability and leaves trust policy to the
application layer.

**Maturity and adoption.** As of March 2026 (v1.0 release), 150+ organizations
support A2A including Google, Microsoft, AWS, Salesforce, SAP, ServiceNow,
Workday, and IBM. The GitHub repository has 22K+ stars. The SDK ecosystem spans
Python, JavaScript, Java, Go, and .NET. Production deployments are confirmed
across multiple enterprise verticals. This is the strongest-traction agent
protocol in the field — by significant margin.

**v1.0 additions (March 2026).** Multi-tenancy support (one endpoint hosts
multiple agents securely), signed Agent Cards, modernized security flows
(deprecated patterns removed), heterogeneous environment support,
backward-compatible AgentCard evolution with a dual-version negotiation path for
migration from v0.3.

---

## MCP — Model Context Protocol

**Who is behind it.** Anthropic published the initial MCP specification in
November 2024. In December 2025, Anthropic donated MCP to the Agentic AI
Foundation (AAIF) under the Linux Foundation, with OpenAI and Block as
co-founders of the foundation. Sam Altman publicly endorsed MCP in March 2025;
OpenAI adopted it across the Agents SDK and ChatGPT desktop. By early 2026,
every major AI provider — Anthropic, OpenAI, Google, Microsoft, Amazon — had
adopted MCP.

**What problem it solves.** MCP is an agent-to-tool/resource interface, not a
peer-to-peer agent protocol. This distinction matters and is consistently
blurred in popular coverage. An MCP client (typically an LLM host application)
connects to an MCP server (a capability provider), which exposes tools,
resources (data sources), and prompts. The LLM calls tools through the client;
the server executes them and returns results. There is no defined notion of
"two agents of equal standing talking to each other" in the core spec.

The analogy that has spread widely: MCP is USB-C (connects devices to
peripherals); A2A is HTTP (connects peers). The analogy is directionally correct
but not precise — MCP does have bidirectional primitives, and some implementations
stretch it toward agent-agent use.

**Technical mechanics.**

*Transport.* Two supported transports as of the 2025-11-25 spec:
- **stdio** — for local integrations; the host launches the MCP server as a
  subprocess and communicates via stdin/stdout with newline-delimited JSON-RPC.
- **Streamable HTTP** — the server runs as an independent process, exposed over
  a single HTTP endpoint that supports both POST (sending messages) and GET
  (opening an SSE stream for server-to-client events). This replaced the earlier
  HTTP+SSE transport (deprecated in mid-2025) and supports stateless and stateful
  operation modes.

*Protocol.* JSON-RPC 2.0 for all message encoding. UTF-8 required.

*Primitives.* Three core capability types:
- **Tools** — callable functions with a JSON Schema-described input/output
  contract. The LLM decides when to call them.
- **Resources** — data exposed for context inclusion (files, database records,
  API responses). URI-addressed.
- **Prompts** — parameterized prompt templates the server offers to the client.

*Capability negotiation.* Client and server exchange capability lists during
initialization handshake, allowing progressive feature negotiation without hard
versioning breaks.

*Governance.* AAIF steering committee; specification updates go through a public
RFC process. The community registry (launched November 2025) indexes servers by
capability.

**Ecosystem scale.** 10,000+ active servers, 177,000 registered tools, 97 million
monthly SDK downloads as of early 2026. The largest server ecosystem in the
agent infrastructure space.

**The stretch toward agent-agent.** Some teams are deploying MCP servers that
expose agent capabilities — effectively treating an agent as a "tool" callable
via MCP. This works technically but loses A2A's richer semantics (task
lifecycle, streaming, multi-turn context, push). As of May 2026, the official
position from both Anthropic and the AAIF is that MCP and A2A are complementary,
not competitive: use MCP for tools/data, A2A for agent-agent.

**Security posture.** MCP has a documented security surface area that is becoming
one of the field's most active research topics. Known attack classes (as of
OWASP MCP Top 10, 2025): tool poisoning (malicious instructions embedded in tool
descriptions, invisible to the user but read by the model), prompt injection via
tool responses, and rug-pull attacks (a trusted server silently updates its tool
definitions post-approval with no re-verification by default). The postmark-mcp
npm package backdoor (first in-the-wild malicious server, September 2025) and
multiple CVEs in the Anthropic reference implementation confirm this is not
theoretical. The stdio transport's trust model (anything the subprocess returns
is trusted) is a particular attack surface for supply-chain compromise.

---

## AGNTCY / SLIM

**Who is behind it.** Cisco Outshift incubated AGNTCY with Galileo, LangChain,
Google, Dell, and Red Hat as core contributors. The project launched on GitHub
in March 2025. Cisco donated it to the Linux Foundation in July 2025.

**What problem it solves.** AGNTCY targets the infrastructure layer that sits
underneath agent-to-agent protocols like A2A: how do agents find each other in
the first place, and how do they communicate securely at the network level?
AGNTCY self-describes as "the Internet of Agents" — an open, quantum-safe
foundation enabling discovery, identity, secure transport, and observability for
multi-agent systems.

**Technical mechanics.**

*OASF (Open Agentic Schema Framework).* An OCI-based extensible data model for
describing agents' attributes and ensuring unique identification. OASF can
describe A2A agents, MCP servers, and other agent types. Schema documentation
is at `schema.oasf.outshift.com`.

*Agent Directory.* Discovery registry built on OASF. Organizations run
independent directory instances that synchronize, collectively forming the
Internet of Agents inventory. The directory knows about A2A agent cards and MCP
server descriptions.

*SLIM (Secure Low-Latency Interactive Messaging).* The transport/messaging layer.
SLIM extends gRPC to support multiple interaction patterns: pub/sub,
request/reply, streaming, and fire-and-forget. It provides cryptographic
identity verification and access control at the network level. This is the
distinguishing technical contribution of AGNTCY — a transport designed
specifically for agent workloads, not adapted from existing web infrastructure.

*Identity.* Decentralized technology-backed agent identity for trustworthy
cross-organizational interaction. (Details are less specified than ANP's DID
approach — uncertain as of May 2026 how this is implemented at the cryptographic
layer.)

*Observability.* Telemetry collectors and performance evaluation tooling are
first-class in the AGNTCY stack, reflecting Cisco's network-management heritage.

**Relationship to A2A and MCP.** AGNTCY is designed to be compatible with and
complementary to both. The Agent Directory can index A2A agents. SLIM can carry
A2A messages. The model is: AGNTCY is the plumbing/infrastructure layer;
A2A/MCP are the application-layer protocols that run on top of it.

**Maturity.** Under active development post-Linux Foundation donation. Production
readiness is early-stage; Cisco and partners are the primary implementers.
Cisco joined the AAIF in 2025, tightening the governance alignment with MCP and
A2A.

---

## ANP — Agent Network Protocol

**Who is behind it.** An independent open-source community project led primarily
by Chang Gaowei and James Waugh. The team presented at the W3C WebAgents CG in
February 2025. The W3C AI Agent Protocol Community Group held its inaugural
meeting in June 2025, with ANP as a primary input.

**What problem it solves.** ANP is a decentralized identity and networking
foundation for agents — the question of "how do any two agents on the open
internet prove who they are to each other and establish a secure channel, without
a central authority?" ANP's answer is W3C Decentralized Identifiers (DIDs).

**Technical mechanics.**

*Identity model.* Each agent has a DID document, primarily using the `did:wba`
(Web-Based Agent) method — a custom DID method built on the `did:web` standard,
optimized for agent communication. DID documents contain public keys for
asymmetric cryptography. ANP implements a **dual authorization model**: agent
keys for routine autonomous operations, and separate human authorization keys
for high-risk actions (fund transfers, sensitive data access). This is one of
the few protocols that explicitly models human-agent key separation.

*Discovery.* Two complementary mechanisms:
- **Active discovery**: `.well-known/agent-descriptions` publishes a
  CollectionPage of agent description documents in JSON-LD format with pagination.
- **Passive discovery**: Agents register with search service agents that crawl
  and index description documents.

*Transport.* HTTP/HTTPS with DID-based authentication headers on initial contact,
followed by token-based verification for subsequent requests. Supports wrapping
existing protocols (OpenAPI, JSON-RPC, WebRTC) via a meta-protocol negotiation
layer.

*Security.* ECDHE protocol for end-to-end encrypted agent-to-agent
communication. Minimal disclosure principle: only transmit necessary fields.
Hierarchical key management with local encrypted storage and operation logging.

*Economic/trust layer.* ANP acknowledges that a meta-protocol incentive structure
is needed but states this "still requires in-depth research." It is the one
protocol that articulates the gap but has not filled it.

**Maturity.** Experimental. The W3C community group process is the closest
thing to standards track. No significant production deployments confirmed.
The technical white paper was published on arxiv as of late 2025. The
value of ANP is its identity model — the `did:wba` approach and the
human/agent key separation are more rigorous than A2A's current auth model.

---

## ACP — Agent Communication Protocol (now merged into A2A)

**Who was behind it.** IBM Research launched ACP in March 2025 to power the
BeeAI Platform, an open-source platform exploring agent interpretability.
BeeAI and ACP were donated to the Linux Foundation shortly after launch.

**What problem it solved.** ACP was a lightweight, REST-over-HTTP protocol for
agent invocation. Its key differentiator was MIME-type-based message structure
(rather than predefined formats) and the ability for agents to carry their own
metadata, making them discoverable even in air-gapped or secure environments
without requiring a central registry.

**Technical mechanics.** REST/HTTP. Synchronous and asynchronous interaction modes.
Peer-to-peer invocation model (agents can call each other as equals, not through
a hierarchical orchestrator). Python and TypeScript SDKs. Primary implementation
via the BeeAI Framework.

**Merge with A2A.** In August 2025, IBM formally merged ACP into A2A and joined
the A2A Technical Steering Committee. The BeeAI team is contributing its
technology and expertise into the A2A project rather than maintaining a
separate protocol. This is a meaningful data point: a well-resourced, well-
designed protocol decided the ecosystem benefit of consolidation outweighed
competitive differentiation. ACP's REST-native approach and MIME-type flexibility
influenced A2A v1.0's design.

---

## LMOS — Language Model Operating System

**Who is behind it.** The Eclipse Foundation. LMOS is an open-source project
under Eclipse governance, targeting enterprise-scale AI agent orchestration.
The Agent Definition Language (ADL) was announced in October 2025.

**What problem it solves.** Enterprise agent lifecycle management: defining,
deploying, routing, and monitoring AI agents across an organization. LMOS is
a platform, not just a protocol — the closest analog is Kubernetes for agents.

**Technical mechanics.**

*ADL (Agent Definition Language).* A structured, model-neutral language and
visual toolkit for defining agent behavior in a maintainable way, explicitly
addressing "the complexity of traditional prompt engineering." ADL is
model-agnostic.

*ARC Agent Framework.* JVM-native Kotlin runtime for developing and extending
AI agents. Enterprise-oriented.

*LMOS Platform.* Orchestration layer for agent lifecycle management, discovery
via a central registry, semantic routing (routing requests to agents based on
capability semantics), and observability.

*Protocol layer.* JSON-LD for agent/tool descriptions. Multiple transport options
(HTTP, WebSocket, message queues). The central registry and Scheduler Router
centralize coordination — architecturally distinct from the P2P approaches of
ANP and AGORA.

**Maturity.** Active development under Eclipse Foundation governance. The ADL
addition in October 2025 represented a significant maturation of the project.
Primarily an enterprise/Kotlin/JVM story with limited consumer-facing relevance.

---

## AGORA

**Who is behind it.** An independent open-source research project. Described in
comparison analyses as of 2025.

**What problem it solves.** AGORA proposes a meta-protocol layer: rather than
specifying a fixed agent communication format, AGORA lets LLM agents
autonomously negotiate which communication protocol to use by reading a Protocol
Document written in natural language. Agents agree on a protocol on-the-fly
rather than having one pre-imposed.

**Technical mechanics.** Protocol Documents specify agent communication behavior
in a mix of natural language and code. LLMs read the PD and generate appropriate
protocol implementations dynamically. HTTPS for transport; JSON for formatting.
Identity layer uses W3C DID-based authentication and end-to-end encryption.

**Assessment.** Intellectually interesting but practically immature. The reliance
on LLM agents correctly interpreting and implementing a protocol from natural
language introduces a class of reliability and security problems that fixed-
schema protocols avoid. Remains largely theoretical as of May 2026, with no
confirmed production deployments. Worth tracking as a long-term direction for
LLM-native protocol negotiation, but not a current competitor.

---

## AITP — Agent Interaction & Transaction Protocol

**Who is behind it.** NEAR AI. Published as an RFC in 2025.

**What problem it solves.** AITP is the most explicit attempt to combine agent
communication with economic transactions in a single protocol. It is also the
protocol most explicitly designed for the personal-agent scenario: it imagines
a user's personal AI assistant coordinating with service agents to complete
real-world tasks that involve both information exchange and payment.

**Technical mechanics.** HTTPS/JSON for transport. **Threaded sessions** for
structured multi-turn conversations between agents. **Capability modules**
(extensible specifications) allow agents to declare support for specific
interaction types. The most developed module, **AITP-01 (Payments)**, implements:
- Unified payment channel for one-time payments, metered services, and
  authorization/capture flows
- Payment requests (Quotes) that flow upstream through agent chains until they
  reach an agent or UI capable of handling them
- Any agent in the chain can accept, modify, or reject a Quote

The threading model means AITP explicitly models multi-hop agent delegation:
your personal agent talks to a travel agent, which talks to an airline agent,
with payments flowing through the same thread.

**Maturity.** Early RFC stage. NEAR AI is integrating AITP into their hub at
`app.near.ai`. Limited third-party adoption as of May 2026. AITP's conceptual
architecture is the most relevant to a personal-agent trust/economic layer of
any protocol in this survey — but its current implementation maturity and
NEAR/blockchain heritage make it a niche player rather than a mainstream choice.

---

## Coral Protocol

**Who is behind it.** Coral Protocol, a startup operating at the intersection
of multi-agent infrastructure and web3. Solana partnership for payment
infrastructure. Arxiv paper published May 2025.

**What problem it solves.** Coral builds on MCP to provide multi-agent
coordination: standardized message formats, team formation (assembling trusted
agent groups dynamically), and — on roadmap for Q4 2025 — agent-to-agent
payments via the CORAL token, an on-chain reputation system, and a
decentralized agent marketplace.

**Technical mechanics.** Built on MCP as the transport substrate. The Anemoi
architecture introduces a semi-centralized multi-agent pattern to avoid
single-planner bottlenecks. Remote agents for distributed deployment. v1
launched 2025.

**Assessment.** The token-based payment and reputation components are the
differentiated claim, but the blockchain/CORAL token dependency creates friction
for mainstream consumer adoption. Worth watching; the reputation layer concept
is directly relevant to the personal-agent trust thesis. Maturity is
experimental.

---

## LOKA Protocol

**Who is behind it.** Academic — arxiv preprint, April 2025 (v2 also on arxiv).

**What problem it solves.** LOKA (Layered Orchestration for Knowledgeful Agents)
is a systems-level architecture proposal for ethically governed, interoperable
AI agent ecosystems. It explicitly addresses the questions that all the
infrastructure protocols above avoid: who is the agent, can its actions be
audited, and can autonomous agents reliably align with human values?

**Architecture layers:**
- **Identity layer (UAIL)**: Universal Agent Identity Layer; each agent manages
  its own digital identity using DIDs and Verifiable Credentials; eliminates
  reliance on centralized identity providers.
- **Governance/Ethics layer (DECP)**: Decentralized Ethical Consensus Protocol;
  agents make context-aware decisions grounded in shared ethical baselines;
  integrates consequentialist, deontological, and virtue ethics frameworks.
- **Security layer**: Post-quantum cryptography anchored in DIDs and VCs.

**Assessment.** LOKA is a research framework, not an implementation. No production
code exists. Its value here is as a clear articulation of the problems that
infrastructure protocols (A2A, MCP, AGNTCY) are not solving: identity
accountability, ethical auditability, and the governance of autonomous agents
acting in the world. The DECP idea in particular — a decentralized mechanism for
agents to agree on what constitutes ethical action in a given context — is
unprecedented in the production protocol space.

---

## Commerce-layer protocols: Visa TAP and Mastercard Verifiable Intent

These deserve separate treatment because they represent the one domain where
personal-agent trust and economic accountability have received real, production-
grade investment — but within the narrow context of payment authorization.

**Visa Trusted Agent Protocol (TAP).** Visa's Trusted Agent Protocol addresses
the problem of AI shopping agents being blocked by merchant bot-mitigation
systems. TAP uses cryptographic signatures to convey: agent intent (browsing vs.
purchase authority), consumer recognition tokens (device identifiers, loyalty
accounts), and payment credentials (hashed, tokenized, or IOU). Signatures are
merchant-specific, time-bound, and non-replayable. Available as open source on
GitHub. Pilot deployments underway in 2026.

**Mastercard Verifiable Intent.** Announced March 5, 2026, co-developed with
Google. Verifiable Intent creates tamper-resistant cryptographic proof that a
consumer authorized a specific AI agent action at a specific moment — linking
identity, instructions, and transaction outcome in a single record. Built on
FIDO Alliance, EMVCo, IETF, and W3C standards. Uses Selective Disclosure
(only the minimum data each party needs is shared). Open-sourced at
`verifiableintent.dev`. Aligned with Google's Agent Payments Protocol (AP2).

**What these tell us.** The financial industry has decided that personal-agent
authorization needs cryptographic proof at transaction time. Neither Visa TAP
nor Mastercard Verifiable Intent extend to general agent actions (browsing a
website, sending an email, reading a calendar) — they are payment-specific. But
the underlying pattern — a verifiable, privacy-preserving proof that a human
authorized a specific agent action — is the pattern a general personal-agent
trust layer would need to generalize.

---

## Historical prior art: KQML and FIPA-ACL

The problem of agents communicating is not new. Two 1990s-era research
protocols defined the modern vocabulary and — critically — demonstrate which
design choices cause adoption failure.

**KQML (Knowledge Query and Manipulation Language)**, 1990. Initiated under
DARPA's Knowledge Sharing Effort. KQML treated messages as speech acts:
performative-based communication where messages express intentions (ask, tell,
subscribe, achieve) rather than just data. KQML was elegant for academic
distributed AI systems — clean, theoretically grounded, and well-specified
within its domain.

**FIPA-ACL**, late 1990s. The Foundation for Intelligent Physical Agents
(FIPA, established 1996, later IEEE-absorbed) formalized KQML's insights.
FIPA-ACL defined 20+ performatives (inform, request, propose, refuse, agree,
failure, etc.) with mandatory fields (sender, receiver, content, ontology,
language) and a formal semantics rooted in the BDI (belief-desire-intention)
model of agency. The specification was more rigorous than KQML; the governance
was more formal (FIPA consortium, not an individual's paper).

**Why they failed to achieve adoption:**

1. **Implementation complexity without clear payoff.** The BDI semantics required
   implementing cognitive agent models to use the protocol correctly. Most real
   systems were not BDI agents and had to paper over the mismatch.
2. **Ontology binding.** Communication required shared ontologies — structured
   vocabularies describing the domain. Building and maintaining ontologies at
   scale was expensive and fragile. Service-oriented architectures (SOAP/WSDL)
   with narrow, bespoke contracts proved more practical.
3. **The web overtook them.** HTTP + REST emerged as a simpler, transport-first
   model that required no shared cognitive model. When REST worked "well enough"
   for service composition, the complexity tax of FIPA became unjustifiable.
4. **Academic governance, not commercial pull.** FIPA had no Google, no Anthropic,
   no trillion-dollar deployment pressure. The standards were correct in principle
   and invisible in practice.

**What KQML/FIPA got right that the current generation is rediscovering:**
- Speech act theory as a frame: the distinction between a message that informs
  and a message that requests is real and matters for agent reasoning. A2A's
  `INPUT_REQUIRED` / `AUTH_REQUIRED` task states echo this.
- Identity and ontology matter at scale: the current generation is re-learning
  the identity problem (ANP, LOKA, AAIF governance) and the ontology problem
  (OASF, ADL).
- Governance body without commercial pull = dead standard.

**The lesson for this project.** The 1990s iteration solved a real problem and
produced real insight, but the deployment context (pre-web, academic, no LLMs)
meant agents never materialized at scale. The current generation has LLMs —
which arguably dissolve the ontology problem (natural language _is_ a shared
ontology) — plus trillion-dollar commercial pull. The failure modes to avoid are
implementation complexity and governance without adoption pressure.

---

## Layer map: contested vs open

The current protocol landscape organizes into five loosely-defined layers. The
degree of contestation in each layer differs significantly.

### Layer 1 — Transport

**What it is.** Wire-level encoding and framing: HTTP, gRPC, stdio, WebSocket.

**Status: largely SETTLED.** HTTP + JSON-RPC 2.0 is the strong default for
agent-to-agent communication (A2A, ACP). gRPC is a supported alternative for
performance-sensitive paths (A2A v0.3+). stdio is the standard for local
agent-to-tool connections (MCP). SLIM (AGNTCY) is a contender at the transport
layer but occupies a niche aimed at infrastructure teams rather than application
developers.

### Layer 2 — Discovery

**What it is.** How an agent finds another agent and learns what it can do.

**Status: CONTESTED but converging.** A2A's `/.well-known/agent.json` (Agent
Cards) is the strongest current proposal — it follows web conventions, is
simple to implement, and has the most adoption. AGNTCY adds a directory layer
on top for broader ecosystem indexing. ANP provides a DID-based alternative
for decentralized discovery. LMOS uses a central registry (more enterprise-
friendly, less open-internet-friendly). No single standard has won.

The **meaningful gap**: all discovery mechanisms assume the discovered agent is
willing to be found and has published its capabilities. None address discovery
when agents are personal (private by default, disclosed selectively) or when
the _terms_ of engagement — not just the capabilities — need to be advertised.

### Layer 3 — Identity and authentication

**What it is.** How agents prove who they are and under whose authority they act.

**Status: ACTIVELY CONTESTED and underspecified.** This is the most fragmented
layer in the stack.

A2A defers to standard web auth (OAuth 2.0, OIDC, API keys, mTLS) declared in
the Agent Card. This is pragmatic and integrates with existing enterprise IAM —
but it gives no answer to "who authorized this agent to act, and what's the
scope of that authorization as a human principal?"

ANP's `did:wba` and dual-key model (agent keys vs. human authorization keys)
is the most rigorous answer to this question but has no production adoption.

The academic papers on authenticated delegation (arxiv January 2025) propose
extending OAuth 2.0/OIDC with agent-specific credentials and natural-language-to-
access-control translation. Agentic JWT proposals (September 2025) extend
standard JWTs with delegation chain semantics. HDP (Human Delegation Provenance,
April 2025) proposes cryptographic capture of human authorization context in
multi-agent chains.

None of these are in any production protocol.

**The gap for personal agents specifically.** Enterprise IAM (which A2A defers to)
solves "is this agent authorized to act on behalf of Company X within Company X's
IAM system." It does not solve "is this agent authorized to act on behalf of
_me_, a human individual, with the scope I actually intended, and can any
counterparty verify that?" This is the personal-agent identity gap.

### Layer 4 — Semantics and task model

**What it is.** The shared vocabulary for what agents are doing: task types,
capability descriptions, skill ontologies.

**Status: EARLY/CONTESTED.** A2A's task lifecycle (seven states) and skill
descriptions in Agent Cards provide a minimal vocabulary. LMOS's ADL is more
expressive but JVM-specific. OASF (AGNTCY) is OCI-based and schema-extensible.
No common skill/capability ontology has emerged.

This is an area where the "ontology problem" that killed FIPA could resurface.
The current escape hatch is natural language skill descriptions ("this agent
books travel"), which LLMs can interpret without a formal ontology — the LLM
as ontology bridge is a real and underappreciated enabler.

### Layer 5 — Trust, economics, and disclosure

**What it is.** The mechanisms that govern what is owed between interacting
agents and the humans behind them: authorization proof, consent chains, economic
accounting, disclosure of data use, reputation.

**Status: ALMOST ENTIRELY OPEN.**

The only production-grade work in this layer is in the payment authorization
context (Visa TAP, Mastercard Verifiable Intent), and those are scoped to
financial transactions. Outside of payments:

- No protocol defines what an agent must disclose to a user about its
  interactions with other agents.
- No protocol defines how a receiving agent should know what scope a
  calling agent was authorized for.
- No protocol defines reputation or past-behavior signals between agents.
- No protocol defines economic accounting (what did my agent spend interacting
  with your agent).
- No protocol defines human consent chains that travel with a task as it
  delegates across agent boundaries.

AITP (NEAR AI) attempts payments. LOKA (academic) attempts ethics governance.
ANP acknowledges the incentive/economic layer but leaves it to future research.
Coral Protocol has a roadmap item for on-chain reputation. None have reached
production at general scope.

---

## Implications for our differentiation (observations, not a decision)

The research above is neutral landscape mapping. The following observations
follow from the data and are offered as inputs to the product direction decision
— not as that decision.

**1. The enterprise/personal-agent split is stark and real.**

Every production-grade protocol (A2A v1.0, MCP, AGNTCY) is solving the
enterprise multi-agent case: company-deployed agents coordinating within or
across organizations, under corporate IAM. The personal-agent case — _your_
agent acting for you in the world, talking to other agents, with you as the
human principal — is architecturally acknowledged (ANP's dual key model,
AITP's threading model, the academic delegation papers) but has no production
protocol.

The gap is not that personal agents can't _use_ A2A or MCP. They can and will.
The gap is that A2A and MCP have no answer to "what did your agent disclose to
my agent, did you actually authorize it, and what do we each owe each other?"
— the trust, disclosure, and accountability questions that matter specifically
when individuals are the principals.

**2. Riding existing protocols vs. building a new layer.**

A personal-agent trust layer does not need to compete with A2A or MCP. The
more tractable framing: build a layer _above_ or _alongside_ A2A that adds
the missing human-principal semantics. Several design patterns are plausible:

- An **authorization envelope** that travels with A2A tasks, carrying a
  verifiable proof of human delegation scope (extending the authenticated
  delegation research).
- A **disclosure manifest** attached to A2A Agent Cards that describes what
  data the agent collects, how it handles it, and what the human has authorized
  — analogous to Mastercard's Verifiable Intent but general-purpose.
- A **ledger pattern** where agent interactions are logged in a human-readable
  format that the human can audit — not blockchain-based, just structured and
  portable.

**3. The KQML failure mode to avoid.**

The 1990s protocols failed partly due to implementation complexity and partly
due to governance without commercial pull. The implication: any personal-agent
trust layer that requires new agent-to-agent protocol adoption faces a cold-
start problem. A layer that _extends_ an existing protocol (A2A, MCP) or that
works as an opt-in metadata layer on top of existing HTTP infrastructure is more
likely to achieve adoption than a new transport/protocol requiring full
ecosystem buy-in.

**4. The payment sector has done the proof-of-concept work.**

Visa TAP and Mastercard Verifiable Intent demonstrate that cryptographic proof
of human authorization for agent actions is technically feasible, can be built
on existing web standards (FIDO, W3C), and can be open-sourced. The pattern
generalizes. The question is whether someone builds the general-purpose version
before the enterprise protocol stack (A2A + AAIF) closes the gap at the
foundation layer.

**5. The AAIF's scope.**

The Agentic AI Foundation has every major AI lab and cloud provider. If the AAIF
decides to standardize a human-delegation or personal-agent trust layer as part
of A2A or MCP, that would fill the gap with enormous adoption leverage. As of
May 2026, the AAIF roadmap does not include this — the focus is on enterprise
interoperability. The gap is open, but the window may not be permanently open.

---

## Sources

- [A2A Protocol specification (latest)](https://a2a-protocol.org/latest/specification/)
- [A2A v1.0 announcement](https://a2a-protocol.org/latest/announcing-1.0/)
- [Linux Foundation: A2A Protocol surpasses 150 organizations](https://www.linuxfoundation.org/press/a2a-protocol-surpasses-150-organizations-lands-in-major-cloud-platforms-and-sees-enterprise-production-use-in-first-year)
- [Google Developers Blog: Announcing A2A](https://developers.googleblog.com/en/a2a-a-new-era-of-agent-interoperability/)
- [A2A GitHub](https://github.com/a2aproject/A2A)
- [MCP joins Agentic AI Foundation (Dec 2025)](https://blog.modelcontextprotocol.io/posts/2025-12-09-mcp-joins-agentic-ai-foundation/)
- [Linux Foundation: Agentic AI Foundation formation announcement](https://www.linuxfoundation.org/press/linux-foundation-announces-the-formation-of-the-agentic-ai-foundation)
- [Model Context Protocol specification: Transports (2025-11-25)](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)
- [MCP Wikipedia entry](https://en.wikipedia.org/wiki/Model_Context_Protocol)
- [Why MCP deprecated SSE and went with Streamable HTTP](https://blog.fka.dev/blog/2025-06-06-why-mcp-deprecated-sse-and-go-with-streamable-http/)
- [Cisco Outshift: Building the Internet of Agents — Introducing AGNTCY](https://outshift.cisco.com/blog/building-the-internet-of-agents-introducing-the-agntcy)
- [AGNTCY documentation](https://docs.agntcy.org/)
- [Cisco joins AAIF](https://blogs.cisco.com/news/innovation-happens-in-the-open-cisco-joins-the-agentic-ai-foundation-aaif)
- [Cisco Outshift donates AGNTCY to Linux Foundation (Jul 2025)](https://www.nextplatform.com/ai/2025/07/29/ciscos-outshift-incubator-sends-agentic-ai-protocol-to-the-linux-foundation/100917)
- [Agent Network Protocol white paper](https://agent-network-protocol.com/specs/white-paper.html)
- [ANP GitHub](https://github.com/agent-network-protocol/AgentNetworkProtocol)
- [ANP presentation at W3C WebAgents CG (Feb 2025)](https://agent-network-protocol.com/blogs/posts/anp-w3c-webagents-presentation.html)
- [W3C AI Agent Protocol Community Group progress (Jun 2025)](https://agent-network-protocol.com/blogs/posts/w3c-agent-protocol-progress-202506.html)
- [ACP merges with A2A under Linux Foundation (Aug 2025)](https://lfaidata.foundation/communityblog/2025/08/29/acp-joins-forces-with-a2a-under-the-linux-foundations-lf-ai-data/)
- [IBM Research: Agent Communication Protocol](https://research.ibm.com/blog/agent-communication-protocol-ai)
- [ACP GitHub](https://github.com/i-am-bee/acp)
- [Eclipse LMOS introduction](https://eclipse.dev/lmos/docs/introduction/)
- [Eclipse LMOS ADL announcement (Oct 2025)](https://newsroom.eclipse.org/news/announcements/eclipse-lmos-redefines-agentic-ai-industry%E2%80%99s-first-open-agent-definition)
- [Comparative analysis: MCP, ANP, Agora, agents.json, LMOS, AITP](https://agent-network-protocol.com/blogs/posts/agent-communication-protocols-comparison.html)
- [AITP: Agent Interaction & Transaction Protocol](https://aitp.dev/)
- [AITP GitHub](https://github.com/nearai/aitp)
- [Coral Protocol arxiv paper (May 2025)](https://arxiv.org/abs/2505.00749)
- [LOKA Protocol arxiv paper (Apr 2025)](https://arxiv.org/abs/2504.10915)
- [VentureBeat: LOKA universal agent identity layer](https://venturebeat.com/ai/beyond-a2a-and-mcp-how-lokas-universal-agent-identity-layer-changes-the-game/)
- [Authenticated Delegation and Authorized AI Agents (arxiv Jan 2025)](https://arxiv.org/abs/2501.09674)
- [HDP: Human Delegation Provenance Protocol (arxiv Apr 2025)](https://arxiv.org/pdf/2604.04522)
- [Visa Trusted Agent Protocol](https://developer.visa.com/capabilities/trusted-agent-protocol)
- [Mastercard Verifiable Intent](https://www.mastercard.com/us/en/news-and-trends/stories/2026/verifiable-intent.html)
- [Mastercard open standard announcement (Mar 2026)](https://www.dbbnwa.com/articles/mastercard-unveils-open-standard-to-secure-autonomous-ai-agent-payments/)
- [MCP Security: OWASP MCP Top 10](https://www.practical-devsecops.com/mcp-security-guide/)
- [Agent Communications Language (KQML) — Wikipedia](https://en.wikipedia.org/wiki/Agent_Communications_Language)
- [FIPA-ACL vs KQML comparison](https://www.academia.edu/88620133/Agent_Communication_Languages_Comparison_Fipa_Acl_and_KQML)
- [Zylos Research: Agent Interoperability Protocols 2026](https://zylos.ai/research/2026-03-26-agent-interoperability-protocols-mcp-a2a-acp-convergence)
- [A2A v0.3 upgrade blog (Google Cloud)](https://cloud.google.com/blog/products/ai-machine-learning/agent2agent-protocol-is-getting-an-upgrade)
- [MCP and A2A — the analogy explained (Medium)](https://medium.com/@aftab001x/mcp-and-a2a-the-protocols-building-the-ai-agent-internet-bc807181e68a)
- [FIDO Alliance: standards for trusted AI agent interactions](https://fidoalliance.org/fido-alliance-to-develop-standards-for-trusted-ai-agent-interactions/)
