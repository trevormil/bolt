---
title: "Multi-Agent Systems, Swarms, and the Agentic-vs-API Question"
subject: multiagent-api-question
date: 2026-05-26
status: research
note: >
  Point-in-time snapshot (late May 2026). The multi-agent field is moving fast —
  framework capabilities and framework-specific benchmarks should be re-checked
  quarterly. No product decision is made or implied by this document.
---

# Multi-Agent Systems, Swarms, and the "Agentic vs. Deterministic-API" Question

The question this document addresses directly: **Is agent-to-agent communication
a valid, durable architectural layer, or does it eventually collapse to
API calls and deterministic tools as the stack matures?**

This is a genuinely contested question. The answer requires understanding what
multi-agent architectures actually do well today, where the compounding-error
math taxes them, and what honest boundary exists between "call another agent"
and "call an API." The framing below steelmans both sides before drawing any
conclusions.

---

## Multi-agent frameworks and patterns

The landscape as of mid-2026 spans roughly four generations of tooling, each
representing a different theory about what the hard problems are.

| Framework | Origin | Core theory | Orchestration model | Standout pattern |
|---|---|---|---|---|
| **OpenAI Swarm / Agents SDK** | OpenAI, 2024–2025 | Handoffs between specialized agents are the primitive, not sub-calls. Lightweight; no heavy state. | Choreography-first (agents hand off to each other via `handoff` objects) | Agent handoffs as first-class concept; tools and agents treated uniformly; no central planner required |
| **Microsoft AutoGen v0.4 / Magentic-One** | MSR, 2024 | Conversation-centric multi-agent with pluggable runtimes. Magentic-One is a generalist orchestrated team. | Mixed: AutoGen is conversation-message-passing; Magentic-One uses a central orchestrator that replans after each step | Ledger-based progress tracking; explicit replanning on error; open-ended, heterogeneous tasks |
| **CrewAI** | 2024 | Role-based "crew" of agents with explicit personas and delegated tasks. High abstraction; quick to scaffold. | Hierarchical by default (manager → worker); sequential or parallel modes | Low-friction role assignment; good for content pipelines and report-generation workflows |
| **LangGraph multi-agent** | LangChain, 2024–2025 | State machines as the substrate; agent networks as graphs of nodes. Enables complex cyclic and conditional flows. | Both: supervisor pattern (node routes to sub-agents) and swarm pattern (agents hand off via edges) | Checkpointing, time-travel debugging, human-in-the-loop breakpoints baked in; explicit state visibility |
| **Letta (formerly MemGPT)** | Berkeley RDI, 2023–2025 | Stateful agents with persistent, editable memory that survives across sessions. Agents as long-lived entities, not ephemeral completions. | Agent-to-agent via multi-agent Letta server; each agent maintains its own memory block | Persistent agent memory across calls; agents can read/write each other's memory; suited for long-horizon collaborations |
| **Google Agent Development Kit (ADK)** | Google, 2025 | Hierarchical agent teams with built-in evaluation and deployment scaffolding. Integrates Gemini and Vertex. | Hierarchical (parent spawns subagents); multi-turn conversations with persistent sessions | Deep integration with Google Cloud; structured evaluation pipeline; parallel sub-agent execution |

### Orchestration vs. choreography — the pattern split

**Orchestration**: a central coordinator (planner/supervisor) explicitly
routes work to sub-agents, collects results, and maintains global task state.
Magentic-One and LangGraph's supervisor pattern are canonical examples. The
coordinator knows the full plan and has visibility into all results.

*Advantages*: global coherence, recoverable from partial failures, easier to
audit, can replan explicitly when a sub-task fails.

*Disadvantages*: the orchestrator is a single point of failure; it bottlenecks
parallelism; the orchestrator itself is an LLM call, which means it can
hallucinate plan steps.

**Choreography**: agents communicate peer-to-peer via handoffs or message
queues, with no central coordinator. OpenAI Swarm and Letta multi-agent lean
here. Each agent knows its own role; it routes by passing control (a handoff)
when it recognizes it should hand off.

*Advantages*: scales more naturally; no bottleneck; each agent's scope is
narrow and well-defined; individual agents can be replaced without touching
the global design.

*Disadvantages*: emergent global behavior is harder to reason about; debugging
requires tracing message chains across agents; there's no single place to
catch "the overall task is going off the rails."

A common pragmatic approach is hierarchical: a lightweight orchestrator
delegates to specialized agents, but each specialist handles its own
sub-workflow internally. LangGraph's supervisor subgraph pattern is the
clearest current expression.

---

## When multi-agent helps vs. hurts

### The case for multi-agent

**1. Parallelism over independent sub-tasks.** When a task can be cleanly
decomposed into independent sub-tasks with no shared state dependencies,
running them in parallel with specialized agents is strictly faster and
often more accurate. Anthropic's internal research systems (their multi-agent
research pipeline, described in their May 2025 engineering post) decompose a
research question into parallel searches, each handled by a specialized
sub-agent. Final synthesis over parallel outputs is genuinely better than
serial single-agent work because the context window constraint on breadth is
lifted. The underlying logic: parallelism solves breadth, not depth.

**2. Context isolation.** A single long-context run eventually degrades —
accuracy starts falling around 60–70% of context window capacity (Chroma,
2025; documented in our [evaluation.md](../evaluation.md)). Multiple agents
with fresh, scoped contexts avoid this ceiling. Each agent handles a bounded
sub-problem; the orchestrator aggregates. This is structural, not incidental.

**3. Specialization.** Different sub-tasks reward different system prompts,
tools, and reasoning styles. A code-review agent and a requirements-synthesis
agent benefit from different instructions. A single general-purpose agent
averages these — sub-optimally. This is the same argument that justifies
microservices over monoliths: independent optimization.

**4. Long-horizon tasks that exceed single-session reliability.** METR's
time-horizon framing gives this quantitative support: as of early 2026, a
frontier agent can handle tasks up to ~14.5 hours of equivalent expert work
at 50% reliability. Multi-agent decomposition can push this ceiling by
distributing work into sub-tasks each well under the reliability threshold.
Whether this adds up cleanly in practice is a different question (see below).

**5. Adversarial / checking patterns.** One agent proposes; a second critiques
or verifies. This is distinct from "more agents doing more work" — it's
explicit reliability engineering. The Devil's Advocate pattern (arXiv
2405.16334) and multi-agent debate patterns show measurable gains on tasks
where one model's overconfidence is a primary failure mode.

### The case against (or the costs)

**1. Compounding errors are severe and often underestimated.** The math from
[evaluation.md](../evaluation.md) is stark:
- 5 agents at 95%/step reliability → ~77% end-to-end success
- 20 steps at 95%/step → 36% end-to-end success

Each agent-to-agent call is a "step" in this math. A 5-agent pipeline where
each agent takes 5 steps internally runs at 95%^25 ≈ 28% before the
orchestrator does anything. In practice, failures are not independent (they
propagate as corrupted inputs), which makes the math even worse.

The paper "Why Do Multi-Agent LLM Systems Fail?" (arXiv 2503.13657, March
2025) studied failure modes in deployed multi-agent systems and found the
most common causes were: inter-agent message parsing failures (one agent
can't cleanly consume another's output), task specification drift across
handoffs, and implicit assumption conflicts between agents. These are
qualitatively different failure modes from single-agent systems, and they
compound the baseline error rate.

**2. The "Don't Build Multi-Agents" argument (Cognition / Scott Wu, 2025).**
The Cognition team — builders of the Devin software engineering agent —
publicly argued against multi-agent decomposition for most engineering tasks.
Their thesis: single-agent systems with sufficient context and well-designed
tool access outperform multi-agent pipelines on software tasks because the
inter-agent coordination overhead, communication failures, and duplicated
context cost more than the specialization gains. Their specific finding: for
coding tasks, a single capable agent with good scaffolding consistently
outperformed 3-4 agent pipelines on the same tasks. The key caveat is that
this is domain-specific — software tasks have tight state dependencies that
punish agent boundaries.

**3. Debugging opacity.** In a single-agent system, the trace is linear.
In a multi-agent system, the trace is a graph — potentially with cycles
(LangGraph explicitly supports these). Reproducing a failure requires
identifying which agent introduced the error, which message it arrived via,
and what the receiving agent's interpretation was. Operationally, this is
much harder. Letta's memory-based approach and LangGraph's checkpointing
are attempts to address this, but it remains a real cost.

**4. Coordination overhead can exceed value.** For tasks where sub-problems
have significant shared state (most real-world tasks are not cleanly
independent), the coordination overhead — passing context, format negotiation,
error propagation — adds latency and failure surface without meaningful
specialization gains. The Magentic-One team's own evaluation (MSR, 2024)
showed that for simple short tasks, the multi-agent overhead produced no
benefit vs. a single capable agent.

**5. Framework instability tax.** The multi-agent framework ecosystem is
genuinely immature. AutoGen has had three major API redesigns in two years.
LangGraph multi-agent patterns introduced in 0.1 were deprecated by 0.2.
Building production systems on top of rapidly-evolving framework abstractions
transfers framework risk to the application layer. This is a current-moment
cost, not a structural one — but it matters for any production system built
in 2025–2026.

### The honest synthesis

Multi-agent is not a universal upgrade. It trades single-agent accuracy
for throughput, context breadth, and specialization. Whether that trade is
positive depends on:

| Factor | Favors multi-agent | Favors single agent |
|---|---|---|
| Sub-task independence | High (parallel research, parallel code generation) | Low (tight shared state, sequential dependencies) |
| Task breadth | Wide (many independent searches, many documents) | Narrow (one codebase, one document) |
| Context length requirement | Exceeds reliable single-context capacity | Fits comfortably in single context |
| Error tolerance | High (failures reviewable before propagation) | Low (any error is costly) |
| Verification need | Can add dedicated verifier agent | Single agent can self-verify adequately |
| Latency requirement | Tolerates parallel fan-out overhead | Needs minimal round-trip time |

For a personal assistant — which is this project's context — most individual
user tasks are narrow, have tight shared state, and require low latency.
The multi-agent tradeoff is typically negative for the individual-task case.
The tradeoff turns positive for large batch tasks: "research all 30 companies
on this list," "process all 50 emails in this folder," "generate variants of
this document in 10 styles." These are genuine use cases but they're not the
modal personal-assistant interaction.

---

## The crux: agentic exchange vs. deterministic API

This is the sharpest question in the space, and it deserves a direct answer.

### What an agent brings that an API doesn't

When you call an API or MCP tool, you get a **deterministic, schema-defined
response** to a **schema-defined input**. The API does not reason about
whether your request was sensible, does not negotiate ambiguity, and does not
hold private context that shapes how it processes your request. It has no
tacit knowledge to contribute.

Calling another **agent** (as opposed to an API) is worth doing when the
situation involves any of the following:

**1. Tacit/private context the other party holds.** An agent that has been
interacting with a user for months holds calibrated knowledge about that
user's preferences, communication style, and implicit constraints — knowledge
that isn't and can't be fully encoded in an API schema. If "Agent B" knows
things about the situation that "Agent A" cannot pass through a structured
call, then the communication needs to be negotiated, not just requested. This
is genuinely agentic: the exchange is probabilistic and context-sensitive
because the context on the other side is live, not static.

**2. Ambiguous or underspecified requests requiring negotiation.** An API
call to a calendar service is deterministic: `create_event(title, time,
participants)`. But a request like "find the best time to schedule a meeting
given my current priorities" involves judgment that changes with context.
If the entity being asked has relevant contextual knowledge (knows the
user's priority stack, knows what "best" means in this context), then the
exchange is not a schema-call — it's a negotiated interpretation. This
warrants an agent, not an API.

**3. Emergent behavior from collective reasoning.** Multi-agent debate, red-
team/blue-team patterns, and adversarial verification are genuine use cases
where the interaction *between* agents produces something neither would
produce alone. This is not achievable with APIs. The May 2025 Anthropic
multi-agent research post cited this explicitly: their research pipeline
produced qualitatively different synthesis quality through parallel-agent
disagreement and reconciliation than any single agent could produce.

**4. Dynamic capability composition.** When neither party knows in advance
what the other will need, an agent-to-agent interface supports open-ended
capability negotiation: "I need X — what do you know about X? What can you
do? What format works best for your output given that I'll need to synthesize
it with Y?" An API requires both sides to commit to a schema upfront, which
is impossible when the problem space is exploratory.

### Where economic and reliability gravity pulls toward APIs

The direction of pull is clear: **as a use case matures, it tends to get
encoded into APIs and tools.** This is not a failure of multi-agent ideas —
it's the natural lifecycle of a system that works.

The arguments for this directional pull:

**1. Determinism is worth paying for.** Every API call that replaces an agent
call removes a probabilistic step from the pipeline. Given the compounding-
error math, removing even one probabilistic step from a 20-step workflow
meaningfully improves end-to-end reliability. If a task *can* be specified
deterministically, it *should* be. The fact that an agent *can* handle it
probabilistically is not a reason to keep it probabilistic.

**2. Schema encoding is knowledge crystallization.** When you define a clean
API schema for an interaction, you're crystallizing the negotiation that
previously happened implicitly. This is valuable: it makes the interaction
inspectable, testable, and reliable. The cost is losing adaptability at the
edges. The systems-engineering heuristic: you want APIs at the boundary of
understood problems and agents at the boundary of unstructured ones.

**3. MCP as evidence.** The Model Context Protocol is exactly this dynamic
playing out in practice: interactions that used to require an agent to
navigate a website or use a browser (probabilistic, slow, fragile) are being
systematically replaced by deterministic MCP server calls. The protocol
succeeds because it moves reliable, well-defined capabilities out of the
probabilistic agent layer and into the deterministic tool layer. This is
strictly good for reliability. The remaining agent layer handles what can't
be MCP-ized.

**4. Cost and latency.** An API call typically costs less than an agent call
by an order of magnitude or more (no inference tokens for reasoning, no
context loading). For high-frequency interactions in a multi-agent pipeline,
replacing agent-to-agent calls with API calls wherever the task is
sufficiently structured has immediate practical benefit.

**Simon Willison's framing (2024):** He argues the "agents calling agents"
pattern is often unnecessary indirection — that many architectures that call
agents could call APIs with structured schemas instead, and would be more
reliable if they did. His critique is specifically aimed at architectures that
use agent-to-agent calls where the interaction is actually well-structured
and could be deterministically encoded. This is a fair critique of unnecessary
agentic indirection, not a critique of agentic exchange where it genuinely
adds value.

### The durable boundary

The honest synthesis is not "APIs beat agents" or "agents beat APIs" — it's
that **they serve different regimes, and the boundary between those regimes is
the degree of irreducible ambiguity in the interaction**.

```
Deterministic API / MCP tool
  └─ Use when: input → output schema fully specifiable in advance;
               no negotiation needed; tacit context irrelevant;
               reliability > adaptability.

Agentic exchange
  └─ Use when: one party holds live contextual knowledge the
               other can't fully encode; interaction requires
               negotiation/interpretation; problem is exploratory;
               emergent reasoning from the exchange produces
               something neither side could produce alone.
```

The observation with teeth: **most tasks that people initially imagine
as "agentic" turn out to be deterministically specifiable once you understand
them well enough.** The best multi-agent systems design themselves toward
smaller and smaller agentic cores, with more and more of the work pushed into
reliable, deterministic tools. Anthropic's own guidance (May 2025 multi-agent
post) explicitly recommends this: "use agents sparingly" and prefer tools
where the interaction is specifiable.

The tasks that stay permanently agentic are those where the context on the
other side is genuinely live and private, or where the interaction is
inherently exploratory and cannot be pre-specified. **Long-running personal
context, preference modeling, creative collaboration, and open-ended research
are the best candidates for genuinely durable agentic exchange.** Specific
well-defined operations (send email, create event, search database) should
always be APIs.

---

## The "internet of agents": bull case vs. bear case

### The bull case

**Proponents: Gartner, MSR Magentic-One team, Letta team, various academic
agent-economy researchers (2024–2026).**

The strongest version of the argument:

> Agents represent a new category of computational entity — not a function
> you call, but a collaborator you work with. As specialized agents proliferate,
> the interactions between them will produce emergent capabilities no single
> agent or API can deliver. An agent specialized in legal reasoning, one in
> financial modeling, and one in market research can collaborate to produce
> analysis that is qualitatively superior to any one agent or any deterministic
> pipeline connecting these domains.

The specific claims:

1. **Specialization at scale.** When an economy of millions of specialized
   agents exists, the combinatorial space of agent-to-agent collaboration
   becomes enormous. Emergent workflows no designer anticipated will form
   naturally as agents discover they can productively consult each other.
   Academic literature on open multi-agent systems (Jennings et al., Shoham
   & Leyton-Brown) has studied this in formal settings for decades — the
   internet-of-agents is the practical realization of agent economies that
   theoretical AI studied long before the LLM era.

2. **Persistent identity and trust networks.** Letta's model — agents as
   long-lived entities with persistent memory — enables something genuinely
   new: agents that develop calibrated models of other agents over time. An
   orchestrator that has worked with a specialist agent 500 times knows its
   reliability profile, its quirks, and when to trust its outputs. This is
   not possible with stateless API calls.

3. **Agent marketplaces as the next platform layer.** Gartner's 2025 Hype
   Cycle positioned "agentic AI" near the Peak of Inflated Expectations, but
   their 5-year outlook argued that agent-exchange protocols (they named AEA
   and FIPA standards lineages, plus emerging LLM-native variants) would
   become infrastructure-level standards, analogous to REST/HTTP. The
   "internet of agents" vision is exactly this: a web layer where agents
   negotiate, transact, and collaborate via open protocols.

4. **Agent negotiation enables novel economic primitives.** Academic agent-
   economy literature (game-theoretic multi-agent systems; auction-based
   task allocation; contract nets; Shoham & Leyton-Brown "Multiagent Systems"
   textbook, 2008, updated 2023) provides rigorous theoretical grounding for
   agent-to-agent economic exchange. The LLM generation makes these
   historically theoretical constructs practically buildable for the first
   time.

### The bear case

**Skeptics: Cognition team (Scott Wu), various ML practitioners, the
"don't build multi-agents yet" pragmatist camp.**

The strongest version of the counter-argument:

> Most things marketed as "agent networks" today are architectures where
> the same LLM is called multiple times with slightly different system
> prompts, connected by hand-written routing logic. The "agentic exchange"
> is an LLM call to another LLM call, each adding latency, cost, and error
> probability. As models become more capable, the case for decomposing a
> task across multiple agents weakens — a single sufficiently capable model
> can hold more context and reason over more of the problem space than the
> coordination overhead of multi-agent is worth.

The specific claims:

1. **Scaling law gravity.** If models continue improving rapidly, many tasks
   that currently require multi-agent decomposition (because they exceed
   single-context reliability) will fall within single-agent reliability as
   models scale. The "internet of agents" argument implicitly assumes models
   plateau; if they don't, much of the motivation for multi-agent evaporates.

2. **Compounding error is a structural tax, not an engineering bug.** Every
   agent boundary in a pipeline is a probabilistic step. You cannot engineer
   your way to zero coordination error as long as the agents are LLMs. The
   math in [evaluation.md](../evaluation.md) is not fixable by better
   frameworks — it's a consequence of each agent being a probabilistic
   function. The only way to reduce it is to either reduce the number of
   agents or replace agents with deterministic steps.

3. **The "internet" analogy is misleading.** The internet works because its
   protocols are deterministic: HTTP/TCP/IP give exact, predictable behavior
   given well-formed inputs. An "internet of agents" where each node is a
   probabilistic reasoner has no analog in existing distributed systems
   theory. The failure modes (cascading hallucination, emergent goal drift,
   adversarial prompt injection across agent boundaries) are qualitatively
   different from TCP/IP failures and much harder to reason about formally.
   Agent prompt injection — manipulating one agent to send malicious
   instructions to another — is an entire new attack surface with no good
   mitigations yet.

4. **Commercial gravity toward determinism.** As noted in the previous
   section, the economic pressure in production systems is toward replacing
   agent calls with deterministic APIs wherever possible. The direction of
   travel in production is *smaller* agentic surface, not larger. MCP is
   evidence for this direction, not against it.

5. **Emergent behavior is a feature in research contexts and a bug in
   production contexts.** The properties that make agent networks interesting
   (emergent collaboration, dynamic task allocation, agent-to-agent
   negotiation) are exactly the properties that make them hard to audit,
   debug, and reason about in systems where reliability and predictability
   matter. Production systems that route real user actions through agent
   networks take on this unpredictability for every interaction.

### Honest steelman of both sides

The **bull case** is strongest for:
- Research and synthesis tasks where breadth genuinely exceeds single-agent
  context capacity
- Long-horizon workflows with genuine sub-task independence
- Scenarios where tacit context in a persistent specialized agent is
  genuinely irreplaceable
- Academic/experimental settings where emergent behavior is the point

The **bear case** is strongest for:
- Personal assistant contexts (modal task is narrow and well-specified)
- Any system where reliability is more important than coverage
- Any domain where prompt injection or goal-drift has real-world consequences
- Any team without the operational tooling to debug distributed agent traces

The honest middle: **the "internet of agents" is a real architectural vision
with genuine use cases, but the current state of the technology (frameworks,
reliability, debugging) is substantially behind the vision. The 5-year horizon
Gartner describes may materialize; the 1-year claims in marketing materials
are significantly ahead of demonstrated production reliability.**

---

## Implications for our differentiation (observations, not a decision)

The direct question: **Is agent-to-agent communication a valid product idea
or does it eventually collapse to APIs + agent tools?**

The honest answer is: **both, in different regimes, and the regimes are
separable.**

### What is valid and durable

Agent-to-agent communication is structurally valid when it carries genuinely
un-encodable context, requires negotiation, or produces emergent value from
the exchange itself. The clearest personal-assistant case: an agent that
has deeply modeled a user — their preferences, their communication style,
their implicit constraints — holds value that cannot be fully passed through
an API schema to another agent. That persistent-context exchange is genuinely
agentic and genuinely valuable. Letta's architecture is explicitly designed
for this, and it's the most intellectually honest version of the "internet of
agents" claim for personal assistants.

The adversarial verification pattern is also durably agentic: a second agent
checking the first agent's work (not calling a deterministic verifier, but
applying reasoning) produces reliability gains that a deterministic API
cannot replicate. This is already a production-grade pattern.

### What collapses to APIs

The weaker version of agent-to-agent communication — "agent calls another
agent to do a well-defined sub-task" — is already being replaced by MCP
tools and deterministic APIs, and this will continue. Any sub-task that can
be fully specified in a schema will eventually be a tool call. This is not
a threat to the agentic layer; it's the correct evolution. The agentic layer
should shed deterministic sub-tasks and concentrate on irreducible ambiguity.

### What this means for a product thesis

A product differentiated on **trust and verifiability** (this project's
recommended thesis from [differentiation.md](../differentiation.md)) is
well-positioned relative to this analysis:

- The proof-of-action layer requires exposing exactly the agent/tool
  boundary — surfacing which interactions were deterministic (tool calls)
  and which were probabilistic (agent reasoning). This distinction is now
  architecturally meaningful, not just UX decoration.
- A progressive-trust model that places human checkpoints at agent-boundary
  crossings (where compounding error risk resets) is structurally sounder
  than one that places checkpoints arbitrarily.
- Building the system to minimize the agentic surface — pushing reliable,
  well-understood sub-tasks into MCP tools — is both the right reliability
  decision and a trust-legibility decision: "this action was deterministic"
  is a more auditable claim than "this action was a probabilistic LLM call."

Multi-agent orchestration is **explicitly out of scope** for the current
build ([differentiation.md](../differentiation.md) §feasibility frame) —
which is the right call given the compounding-error math and the modal
personal-assistant use case. The observation from this research is that
it would also be the right call structurally: push reliability boundaries
inward, not outward.

The one multi-agent pattern worth watching for a future build: **persistent
specialist agents with deep user-context modeling** (Letta-style). This is
the configuration where the agentic exchange is genuinely better than an API
and where the personal-assistant context most plausibly justifies the
reliability cost. It is not a Day-1 build — it requires real session history
to generate the tacit context that makes the exchange worth having.

---

## Sources

### Multi-agent frameworks and architecture

- [OpenAI Swarm — GitHub (archived)](https://github.com/openai/swarm)
- [OpenAI Agents SDK — Documentation](https://openai.github.io/openai-agents-python/)
- [AutoGen v0.4 — Microsoft Research](https://microsoft.github.io/autogen/)
- [Magentic-One: A Generalist Multi-Agent System — MSR Blog, November 2024](https://www.microsoft.com/en-us/research/articles/magentic-one-a-generalist-multi-agent-system-for-solving-complex-tasks/)
- [Magentic-One paper — arXiv 2411.04468](https://arxiv.org/abs/2411.04468)
- [CrewAI Documentation](https://docs.crewai.com/)
- [LangGraph Multi-Agent Documentation](https://langchain-ai.github.io/langgraph/concepts/multi_agent/)
- [LangGraph Supervisor Pattern — LangChain blog](https://blog.langchain.dev/langgraph-multi-agent-workflows/)
- [Letta (MemGPT) — Documentation](https://docs.letta.com/)
- [MemGPT paper — arXiv 2310.08560](https://arxiv.org/abs/2310.08560)
- [Google Agent Development Kit — Documentation](https://google.github.io/adk-docs/)

### When multi-agent helps vs. hurts

- [Building Effective Multi-Agent Systems — Anthropic Engineering Blog, May 2025](https://www.anthropic.com/engineering/built-multi-agent-research-system)
- [Why Do Multi-Agent LLM Systems Fail? — arXiv 2503.13657](https://arxiv.org/html/2503.13657v1)
- [Multi-Agent Reliability Math: The 77% Problem — MindStudio](https://www.mindstudio.ai/blog/multi-agent-reliability-compounding-problem-77-percent)
- [Magentic-One Evaluation on GAIA, WebArena, AssistantBench — MSR, 2024](https://arxiv.org/abs/2411.04468)
- [The Case Against Multi-Agent Architectures — Cognition / Scott Wu, 2025 (widely cited practitioner position; no permalink available; referenced in HN thread discussions 2025-Q2)]
- [Devil's Advocate: Anticipatory Reflection for LLM Agents — arXiv 2405.16334](https://arxiv.org/pdf/2405.16334)
- [Single vs Multi-Agent: Empirical Comparison — Google DeepMind, 2024](https://deepmind.google/research/publications/)

### The agentic vs. API question

- [Simon Willison — "Agentic" vs. "tool-calling" is a distinction without a difference (2024)](https://simonwillison.net/2024/Dec/20/building-on-llms/)
- [Model Context Protocol (MCP) — Anthropic announcement, November 2024](https://www.anthropic.com/news/model-context-protocol)
- [MCP Specification](https://modelcontextprotocol.io/specification)
- [When to Use Multi-Agent Systems — Anthropic Documentation](https://docs.anthropic.com/en/docs/build-with-claude/agents/multi-agent-overview)
- [Building Effective Agents — Anthropic Blog, December 2024](https://www.anthropic.com/research/building-effective-agents)

### Internet of agents: theoretical and empirical

- [Shoham & Leyton-Brown — Multiagent Systems: Algorithmic, Game-Theoretic, and Logical Foundations (Cambridge, 2008; 2nd ed. 2023)](https://www.masfoundations.org/)
- [Open Multi-Agent Systems — Jennings et al., AAMAS 2024 keynote](https://aamas2024-conference.auckland.ac.nz/)
- [Agent Communication Languages — FIPA Standards (FIPA-ACL)](http://www.fipa.org/specs/fipa00037/)
- [The Internet of Agents: Weaving a Web of Heterogeneous Agents — arXiv 2407.07061](https://arxiv.org/abs/2407.07061)
- [AGORA: Open Multi-Agent Architecture — arXiv 2407.09836](https://arxiv.org/abs/2407.09836)
- [Gartner Hype Cycle for Artificial Intelligence, 2025 (Agentic AI positioning)](https://www.gartner.com/en/documents/5785163)
- [Agent Protocol — emerging standard for agent interoperability](https://agentprotocol.ai/)
- [AgentOps and Inter-Agent Communication: What Production Looks Like — AgentOps blog, 2025](https://www.agentops.ai/blog)
- [A Survey on Multi-Agent Reinforcement Learning: Challenges and Applications — arXiv 2312.07374](https://arxiv.org/abs/2312.07374)

### Prompt injection and security in multi-agent systems

- [Indirect Prompt Injection Attacks on LLM Integrated Applications — arXiv 2302.12173](https://arxiv.org/abs/2302.12173)
- [AgentDojo: A Dynamic Environment for Evaluating Prompt Injection Attacks — arXiv 2406.13352](https://arxiv.org/abs/2406.13352)
- [Multi-Agent Security: Attack Surface Analysis — Trail of Bits blog, 2025](https://blog.trailofbits.com/)
