---
title: "Cost Economics of Agentic Personal Assistants"
subject: cost-economics
date: 2026-05-26
status: research
note: >
  Point-in-time research (May 26, 2026). All prices and figures are dated at
  point of citation; model pricing changes frequently. No product decision is
  made or implied in this document.
---

# Cost Economics of Agentic Personal Assistants

This document maps the full cost picture for running a personal AI assistant at the
level of sophistication that OpenClaw, Hermes, and our own project represent — with
emphasis on what *drives* cost, what *real deployments* have spent, and what levers
demonstrably move the needle.

---

## What drives cost

Token cost is the dominant variable for any cloud-model-backed assistant. Every other
line item (compute, bandwidth, storage) is an order of magnitude smaller for personal
or small-team scale. Understanding where tokens come from is the prerequisite for
controlling cost.

### The cost anatomy of a single agentic turn

A personal assistant turn is not a single prompt/completion exchange. A realistic
agentic turn looks like:

```
[system prompt] + [tool definitions] + [memory files] + [conversation history]
  → LLM call 1 (plan / decide what tool to call)
  → tool execution (not billed by the LLM provider)
  → tool result appended to context
  → LLM call 2 (synthesize result or continue)
  → ... (multi-hop until done)
  → final response
```

Each LLM call bills *the full context* at that moment — not just the new content.
A 5-hop tool-use loop with a 20k-token context window open means you pay for ~100k
input tokens in that one turn, even though the new information added per hop is small.

### The six cost drivers (ranked by typical magnitude)

**1. Growing conversation context (dominant)**

The most expensive pattern: a long-running conversation that carries its full history
forward on every turn. Input tokens accumulate linearly. A 10-turn conversation of
1,000 tokens per turn sends `1k + 2k + 3k + ... + 10k = 55k` input tokens total, not
10k. Without compaction, context cost grows as O(n²) in conversation length.

For an assistant doing multi-step agentic work — code writing, research, data
processing — conversations routinely reach 50-200k tokens. At Claude Sonnet 4.5 pricing
($3/M input, May 2026), a 100k-input-token turn costs $0.30 *per call*. In a 10-call
loop, that compounds.

**2. Fixed system overhead (structural, often underestimated)**

Every API call carries the full system prompt, tool definitions, and loaded memory
files as input tokens — even if those bytes haven't changed since the last call.

Hermes Agent measured this precisely (GitHub Issue #4379, May 2026):
- Tool definitions (31 tools): **8,759 tokens** per call
- System prompt (SOUL.md + skills catalog): **5,176 tokens** per call
- **Total fixed overhead: ~13,935 tokens/call** (~73% of every request before any
  user message is read)

At 207 API calls in one evening session, that fixed overhead alone consumed ~2.9M
input tokens. At Claude Sonnet 4.5 rates, that single session's fixed overhead cost
~$8.70 — before the user's actual tasks are counted. Over a month of daily use at
that rate: ~$261 in fixed overhead alone.

This pattern is not unique to Hermes; it is the natural consequence of loading a
full tool registry and skills catalog into every system prompt rather than on demand.

**3. Tool result bloat**

Tools that return large payloads (web scrape, file read, search results, code output)
inject those results directly into the context. A single `read_file` on a 5k-line
codebase adds ~5k tokens to every subsequent call in that conversation. Search tools
that return 10 results at 500 tokens each add 5k tokens per search. In code-assistant
workloads, tool results often dwarf the conversation history in raw token count.

**4. Reasoning / thinking tokens**

Extended thinking models (Claude 3.7 / 4.0 Sonnet with `thinking: extended`, o1,
o3, Gemini 2.5 Pro with thinking) emit reasoning traces that are billed as output
tokens. Output tokens cost 3-5x more per token than input at current pricing. A
single complex planning step at 2,000 thinking tokens costs more than 10,000 input
tokens on the same model. Reasoning is powerful but expensive; the correct pattern
is to route reasoning models only to sub-tasks that genuinely benefit.

As of May 2026, Claude 4.0 Sonnet (claude-sonnet-4-5) thinking mode: $3/M input,
$15/M output. A 2k thinking token response = $0.030 output cost per call. In a 20-call
agentic session with thinking on every call: $0.60 in thinking alone. Extended thinking
(claude-sonnet-4-5 extended): $3/M input, $15/M output (same rates, but thinking
budget can reach 64k tokens — budget matters).

**5. Proactive / background calls**

Every hourly check-in, scheduled memory consolidation, and heartbeat loop is a
billable API call. Vellum's architecture runs an LLM call once per hour (proactive
self-check-in) and another for memory consolidation every 4 hours — at minimum 5-6
LLM calls/day with zero user interaction. At low-overhead settings (1k tokens/call,
Haiku 3.5 at $0.08/M input), this is negligible (~$0.0004/day). But at Hermes's
13,935 fixed-overhead scale on a Sonnet-class model, the same background calls cost
~$0.04/call — which compounds to ~$1.40/month in background-only calls. Not ruinous,
but a floor that scales with model tier and overhead.

**6. Retries and failure loops**

When tool calls fail (bad JSON, API timeout, sandbox exception), a well-behaved agent
retries — generating another full-context LLM call to recover. Error-prone tools or
unstable execution environments can turn a 5-call task into a 15-call task at 3x cost.
Structured outputs and robust tool schemas reduce this; unreliable tool environments
amplify it.

### What dominates in practice

For personal assistant workloads (mixed messaging, light code, research, scheduling):
**context accumulation + fixed overhead together account for 70-90% of total cost**.
Tool result bloat is task-specific. Reasoning tokens and retry costs are high-variance.
Background calls are a known floor. The implication: any serious cost strategy must
address context size and fixed overhead first.

---

## Real-world cost data

### OpenClaw's reported token bill

The most widely cited concrete figure for agentic assistant cost at scale:
OpenClaw's operators reported a **$1.3M token bill over 30 days** (reported in the
community / press, early 2026, citing internal billing data). This covers a multi-million
MAU deployment across 22 channels with continuous proactive operation.

On a per-user basis: at 2M MAU, $1.3M/month = **$0.65/user/month** in raw token costs
(excluding compute, infra). At 5M MAU, the same bill = **$0.26/user/month**. These are
blended numbers including heavy users and light users, all channels.

*Source: community reporting, exact date unconfirmed; treat as approximate order-of-magnitude.*

### Hermes Agent: measured session overhead (May 2026)

GitHub Issue #4379 (NousResearch/hermes-agent, May 2026) documents a measured evening
session:
- 207 API calls across 3 gateway sessions
- ~3.9M input tokens in **fixed overhead alone**
- Variable conversation content: 3,000-8,775 tokens/call (average ~26.7% of the total)

At claude-sonnet-4-5 pricing ($3/M input): that session's fixed overhead alone ≈ **$11.70**.
Adding variable content (~average 5,887 tokens × 207 calls = 1.22M tokens): ~$3.65 more.
Estimated total session cost: **~$15** for one evening of heavy agentic use.

At gpt-4o-mini ($0.15/M input) for the same token volume: ~$0.77. The *same workload*
on a cheap routing strategy is ~20x cheaper than naive Sonnet use.

### Per-task estimates for coding agents (comparable workloads)

GitHub Copilot Workspace and Devin have published or leaked per-task cost data that
serves as a benchmark for agentic coding loops:

- **Devin (Cognition AI)** — reported ~$2-10 per complex software task in early
  deployments (2024-2025 reporting); simpler tasks under $0.50. As of mid-2025,
  the pricing model shifted to subscription ($500/user/month) suggesting per-task
  economics at scale are manageable but require usage caps.
  *(Source: Ars Technica, The Information, mid-2025; figures are estimates from
  leaked billing / pricing announcements, not audited cost data.)*

- **Claude-based code agents (community benchmarks, 2025-2026)** — SWE-bench tasks
  at frontier models average 30-80 LLM calls per task; at Claude Sonnet 4.5 pricing
  with 50k-token context windows, a mid-complexity task costs **$0.50-$2.00** in
  raw API fees. Simple tasks (< 10 calls, < 20k context) run $0.05-$0.15.
  *(Source: community SWE-bench reproducibility runs, early 2026; estimate range.)*

### Frontier model prices as of May 2026

| Model | Input ($/1M tokens) | Output ($/1M tokens) | Notes |
|---|---|---|---|
| **Claude claude-sonnet-4-5 (Anthropic)** | $3.00 | $15.00 | Cache writes +25%; cached reads -90% |
| **Claude Haiku 3.5 (Anthropic)** | $0.80 | $4.00 | Cache writes +25%; cached reads -90% |
| **Claude Opus 4.5 (Anthropic)** | $15.00 | $75.00 | Extended thinking available |
| **GPT-4o (OpenAI)** | $2.50 | $10.00 | Prompt caching: -50% on cached prefix |
| **GPT-4o mini (OpenAI)** | $0.15 | $0.60 | Prompt caching: -50% on cached prefix |
| **o3 (OpenAI)** | $10.00 | $40.00 | Reasoning tokens billed as output |
| **Gemini 2.5 Pro (Google)** | $1.25 (≤200k) / $2.50 (>200k) | $10.00 / $15.00 | Thinking tokens billed as output |
| **Gemini 2.5 Flash (Google)** | $0.15 (non-thinking) / $0.50 (thinking) | $0.60 / $3.50 | Thinking optional per-call |
| **DeepSeek R2 (estimated)** | ~$0.14 | ~$0.55 | Via API; pricing unconfirmed for R2 |
| **Local (Ollama / llama.cpp)** | $0 (electricity only) | $0 | Requires GPU; quality ceiling lower |

*Sources: Anthropic pricing page, OpenAI pricing page, Google AI pricing page, May 2026.
Prices change; verify before committing to a model selection decision.*

**Key ratio to internalize:** the cheapest capable cloud model (GPT-4o mini, Gemini Flash
non-thinking, DeepSeek) runs at roughly 1/15th to 1/20th the price of a frontier Sonnet-class
model. The quality difference for routine tasks (classification, short summarization, simple
tool dispatch) is often negligible. The quality difference for complex reasoning,
long-context synthesis, and nuanced judgment is real. Routing exploits this gap.

---

## Cost-reduction levers

| Lever | Mechanism | Approx impact | Tradeoff |
|---|---|---|---|
| **Model routing (cheap-default → escalate)** | Route simple, high-frequency tasks (heartbeats, short retrieval, classification) to a cheap model (Haiku, Flash, mini); escalate to frontier only when the task needs it | 70-90% cost reduction on mixed workloads (community-measured on OpenClaw); 15-20x ratio between cheap and frontier models | Requires task-type classification; wrong routing degrades output quality; adds latency for the escalation decision itself |
| **Prompt caching (provider-side)** | Pin stable context (system prompt, tool definitions, memory files) as a cache-hit prefix; provider re-uses computed KV states | 70-90% reduction on *cached* input tokens; OpenClaw documented 0.89-0.97 hit rates on stable prefixes (Anthropic + OpenAI, April 2026) | Cache invalidated by any byte change in the prefix; requires deliberate architecture (stable-content-first ordering); Anthropic cache TTL is 5 min (short) or 1 hr (long); OpenAI is session-relative |
| **Context compaction / summarization** | Periodically replace raw conversation history with a condensed summary; discard tool results that are no longer needed | 40-70% reduction in input tokens for long sessions; Hermes implements this; Vellum runs 4-hour consolidation | Summary loses detail; can cause errors if omitted context was load-bearing; adds a compaction LLM call (small relative cost) |
| **Selective tool loading** | Load only the tools relevant to the current channel, platform, or task context; don't inject 31 tools when 5 are relevant | Hermes's 13,935-token overhead is dominated by tool definitions (8,759 tokens = 63%); cutting to 10 relevant tools could save ~5,000 tokens/call (~35% of fixed overhead) | Harder to implement; requires task/platform classification at request time; skills marketplace gets more complex |
| **Retrieval instead of context stuffing** | Store large documents, codebases, or history in a vector store; retrieve only the 3-5 most relevant chunks per turn | Prevents unbounded context growth; keeps per-turn input tokens flat regardless of memory size | Retrieval introduces latency (embedding + search); chunk relevance is imperfect; requires embedding infrastructure |
| **Local / open-weight models for sub-tasks** | Run embedding, classification, short summarization, and routing decisions on-device (Ollama, ONNX) | Eliminates API cost entirely for those sub-tasks; Vellum's ONNX embeddings are the clearest example — embedding calls that compound across a lifetime cost $0 locally | Requires hardware (GPU or Apple Silicon); quality ceiling lower than frontier; not suitable for complex reasoning or long-context synthesis |
| **Structured output token savings** | Use provider-enforced JSON schemas or constrained decoding instead of asking the model to produce JSON in prose; tighter output = fewer tokens | David Vargas ("We Don't Speak JSON") and related research: unstructured-to-JSON prompting adds 20-40% output tokens vs. schema-enforced output; structured output also reduces retry cost from malformed JSON | Provider structured output support varies; schema definition adds engineering overhead |
| **Batching (offline / async tasks)** | Use OpenAI Batch API or Anthropic's Message Batches for tasks that don't need real-time response (nightly summaries, background classification) | 50% cost reduction on batch vs. synchronous API (both Anthropic and OpenAI offer explicit batch discounts) | Latency: results returned within 24h (OpenAI) or similar window; not suitable for interactive tasks |
| **OAuth subscription reuse** | Route through an existing paid subscription (Claude Pro, ChatGPT Plus) instead of generating per-token API fees | Effective per-token cost approaches $0 for subscription headroom that would otherwise be idle; Hermes's `hermes proxy` demonstrates this pattern | Subscription has usage limits; heavy agentic use may exhaust the subscription's allowance; terms of service applicability varies by provider |
| **Turn / call count reduction** | Improve tool reliability and output schemas to reduce retries; use multi-step tool calls in fewer turns | Each avoided LLM call saves its full context cost; 20% fewer calls on a 10-call session = 20% cost reduction, independent of token count | Requires investment in tool quality and error handling |

### Which levers compound

The highest-leverage interventions are **model routing + prompt caching + context compaction** applied together. They address the three largest cost drivers (fixed overhead × model price, growing history) independently and compound:

- A well-cached Haiku call with a compacted 5k-token context might cost $0.0004 (input) + $0.002 (output) = $0.0024.
- The same call un-cached at Sonnet rates with 50k tokens of history: $0.15 (input) + $0.015 (output) = $0.165.
- Ratio: **~70x** — and this understates the effect of avoiding a reasoning-model escalation.

---

## Pricing-model landscape

Personal AI assistants can deliver their model access to users through several distinct
economic structures. The choice affects who bears cost variability and what the user
control surface looks like.

### Bring your own key (BYOK)

The user supplies their own API keys for each provider (Anthropic, OpenAI, etc.).
The assistant software is free or separately priced. Cost is directly visible to the
user and scales with actual usage.

- **Pro**: full cost transparency; user controls provider selection; no margin
  extraction by the assistant layer.
- **Con**: API key management is a meaningful friction barrier for non-developers;
  per-token billing is variable and unpredictable month-to-month; no shared-pool
  benefits.
- **Who does this**: OpenClaw (primary model), Hermes (for direct-API paths), Vellum.

### OAuth subscription reuse

The assistant authenticates into an existing paid subscription (Claude Pro, ChatGPT
Plus, SuperGrok) on behalf of the user. API cost is absorbed into the subscription
the user already pays.

- **Pro**: eliminates API key management; cost is predictable (fixed subscription);
  economically attractive if subscription usage is currently under the cap.
- **Con**: usage caps; ToS edge cases; provider can revoke OAuth access; single
  subscription provider creates lock-in; heavy agentic use often exhausts consumer
  subscriptions.
- **Who does this**: Hermes (multi-provider via `hermes proxy`; Nous Portal OAuth
  for 300+ models); OpenClaw (OpenAI Codex OAuth path only).

### Managed credit pool (aggregator subscription)

The assistant operator or a platform intermediary buys API capacity in bulk and
resells or bundles it. Users pay a flat subscription to the assistant platform rather
than directly to model providers.

- **Pro**: user experience is simple (one subscription, no API keys); operator can
  negotiate volume discounts; predictable revenue for the operator.
- **Con**: operator must manage cost per user to avoid losses; heavy users subsidized
  by light users; platform margin adds a layer over API cost; if the operator's
  margin is thin, quality or model tier may be degraded for cost reasons.
- **Examples**: Nous Portal (multi-model subscription covering Hermes and other clients);
  Cursor Pro (coding assistant with managed model access); GitHub Copilot.

### Local-only / OSS (no API costs)

All inference runs locally on user hardware. No per-token cloud costs.

- **Pro**: zero recurring API cost; complete privacy; no provider dependency.
- **Con**: requires suitable hardware (ideally 24GB+ VRAM or Apple Silicon M-series);
  quality ceiling substantially below frontier models for complex tasks; setup overhead.
- **Who does this**: any assistant in full Ollama/llama.cpp mode; Vellum with Ollama
  backend.

### Hybrid (local for cheap sub-tasks, cloud for complex ones)

Local models handle embedding, classification, simple retrieval; cloud frontier models
handle complex reasoning, code generation, synthesis.

- **Pro**: eliminates the most frequent/cheapest API calls locally; reserves cloud
  spend for the calls that genuinely benefit from frontier quality; cost per task
  drops substantially.
- **Con**: two infrastructure stacks to maintain; routing logic must classify task
  type correctly; local model hardware is still required.
- **Who does this**: Vellum (ONNX embeddings local + cloud LLM for reasoning); partial
  Hermes (Ollama + auxiliary-task routing); achievable in any assistant with deliberate
  design.

---

## Implications for our differentiation (observations, not a decision)

The PRD lists "cost reduction" as a metric. This section maps what the research suggests
about credible differentiation angles — not what we will build.

**The gap the incumbents leave open**: neither OpenClaw nor Hermes has solved the
fixed-overhead problem structurally. OpenClaw's biggest lever (per-agent model routing)
is powerful but operator-manual. Hermes's 13,935-token fixed overhead is a documented
issue with community-proposed mitigations not yet shipped as defaults. Vellum's ONNX
embedding default is elegant but covers only the embedding layer. No assistant currently
ships with *selective tool loading* as a first-class default — the set of injected
tools grows with the skill catalog, and trimming it requires explicit configuration.

**Observations worth testing:**

1. **Selective tool loading by context** — if the assistant knows it's in a messaging
   context (Slack, Telegram), it could load only messaging-relevant tools at request
   time rather than the full registry. The Hermes issue shows this alone could save
   ~5,000 tokens/call, compounding across a lifetime of use.

2. **Cache-boundary design as a first-class invariant** — encoding the stable-prefix
   constraint as an architectural rule from day one (not retrofitted) means cache hit
   rates start high. OpenClaw's documented 0.89-0.97 rates show this is achievable;
   the implementation cost is mostly organizational discipline, not engineering complexity.

3. **Cost transparency as a UX feature** — none of the three assistants surface
   per-session or per-task cost to the user in real time. A small cost meter (tokens
   used, estimated $) could serve the "cost reduction" PRD metric not just by reducing
   cost but by making cost *visible*, which changes user behavior.

4. **Model routing that requires zero configuration** — OpenClaw's 70-90% savings from
   model routing require the operator to manually assign models to agents. A heuristic-
   based automatic router (cheap by default, escalate when the task signals complexity)
   could deliver a meaningful fraction of those savings with zero user configuration.

5. **Subscription-reuse OAuth coverage** — Hermes's `hermes proxy` demonstrates that
   covering Claude Pro + ChatGPT Plus via OAuth turns the assistant into a near-zero
   marginal-cost tool for users who already subscribe. For a new entrant targeting
   users who already have both subscriptions, this could be a strong zero-API-friction
   story.

6. **Honest per-task cost data** — the incumbents do not publish per-task or per-session
   cost benchmarks. A from-scratch assistant that tracks and publishes its own cost
   distribution (median cost/task by type, cost at different model tiers) would make
   a concrete, verifiable claim rather than a vague "cost reduction" promise.

These are observations, not directions. Each implies implementation choices that require
deliberate evaluation against the overall architecture and PRD priorities.

---

## Sources

- [Anthropic Claude Pricing — anthropic.com/pricing](https://www.anthropic.com/pricing) — Claude model prices, cache pricing (May 2026)
- [OpenAI Pricing — platform.openai.com/pricing](https://platform.openai.com/pricing) — GPT-4o, o3, mini prices; Batch API 50% discount (May 2026)
- [Google AI Pricing — ai.google.dev/pricing](https://ai.google.dev/pricing) — Gemini 2.5 Pro/Flash prices including thinking (May 2026)
- [Token overhead analysis: 73% fixed overhead — GitHub Issue #4379](https://github.com/NousResearch/hermes-agent/issues/4379) — Hermes 13,935-token fixed overhead breakdown, root causes, mitigations
- [Prompt caching — docs.openclaw.ai](https://docs.openclaw.ai/reference/prompt-caching) — 0.89-0.97 cache hit rates, provider-normalized behavior
- [OpenClaw Cost Optimization Guide 2026 — clawrouters.com](https://www.clawrouters.com/blog/openclaw-cost-optimization-guide-2026) — 70-90% savings claim for per-agent model routing
- [Credential Pools — Hermes Agent docs](https://hermes-agent.nousresearch.com/docs/user-guide/features/credential-pools) — rotation strategies, subagent inheritance
- [AI Providers — Hermes Agent docs](https://hermes-agent.nousresearch.com/docs/integrations/providers) — `hermes proxy`, Nous Portal OAuth, provider list
- [Pareto Router docs — OpenRouter](https://openrouter.ai/docs/guides/routing/routers/pareto-router) — min_coding_score tiers, pricing model
- [Hermes Agent — OpenRouter app profile](https://openrouter.ai/apps/hermes-agent) — 9.92 trillion tokens consumed, #1 daily rank
- [One Claude Pro subscription, every tool: `hermes proxy` — Hermes Agents Blog](https://hermesagents.net/blog/hermes-proxy-claude-pro-aider-cline-codex/) — subscription reuse pattern
- [GitHub: vellum-ai/vellum-assistant README](https://github.com/vellum-ai/vellum-assistant/blob/main/README.md) — ONNX embeddings default, provider abstraction
- [Hermes Agent AGENTS.md](https://github.com/NousResearch/hermes-agent/blob/main/AGENTS.md) — prompt caching invariant, stable-prefix enforcement
- [hermes-agent/RELEASE_v0.14.0.md](https://github.com/NousResearch/hermes-agent/blob/main/RELEASE_v0.14.0.md) — cross-session 1-hour prompt caching, cold-start improvements
- [Dimension 05: Models, Cost & Performance](./comparison/05-models-cost-performance.md) — comparative analysis of OpenClaw / Hermes / Vellum cost mechanisms (this project's prior research, May 2026)
- Devin / Cognition AI per-task cost estimates — Ars Technica, The Information (mid-2025 reporting); figures are estimates, not audited
- David Vargas, "We Don't Speak JSON" — structured output token-tax argument; cited in community discussions and LLM engineering write-ups (2024-2025)
- OpenAI Batch API docs — 50% discount for asynchronous batch processing
- Anthropic Message Batches API — equivalent batch pricing structure
