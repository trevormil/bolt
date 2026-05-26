---
title: "Dimension 05: LLM Providers, Model Routing, Cost & Performance"
dimension: models-cost-performance
date: 2026-05-26
status: comparison
note: >
  Point-in-time research (May 26, 2026). All figures sourced and dated.
  Product versions: OpenClaw ~2026.4.22+, Hermes Agent v0.14.0 (2026.5.16),
  Vellum Personal Intelligence v0.8.4 (2026.5.22). No product decision is made
  or implied in this document.
---

# Dimension 05: LLM Providers, Model Routing, Cost & Performance

## At a glance

| Dimension | OpenClaw | Hermes | Vellum |
|---|---|---|---|
| **Provider breadth** | 35+ providers | 40+ direct + 200+ via OpenRouter + 300+ via Nous Portal | 4 named (Claude, OpenAI, Gemini, Ollama) |
| **Model routing** | Per-agent model binding; fallback key rotation; April 2026 provider manifest | OpenRouter Pareto Code Router (`min_coding_score`); auxiliary-task routing; fallback chains | Unified provider abstraction; ONNX fallback for embeddings; details sparse |
| **Local models** | Ollama, vLLM, SGLang, LM Studio, any OpenAI-compatible endpoint | Ollama, vLLM, SGLang, llama.cpp, LM Studio, NVIDIA NIM | Ollama; ONNX embeddings by default |
| **OAuth-subscription auth** | OpenAI Codex (ChatGPT OAuth) | Nous Portal (OAuth, 300+ models); xAI SuperGrok; Qwen Portal; MiniMax; GitHub Copilot device-code; `hermes proxy` turns any authed provider into a local OpenAI-compatible endpoint | Not documented; appears API-key only |
| **Cost mechanisms** | Per-agent model selection; prompt caching (Anthropic/OpenAI/Gemini); API key rotation; priority/standard service-tier routing | Credential pools with rotation strategies; Pareto Code Router; cross-session 1-hour prompt caching; context compression; auxiliary-task routing to cheaper models | ONNX embeddings eliminate embedding API calls; prompt caching via provider pass-through (not independently documented) |
| **Fixed token overhead** | ~4,600-4,800 tokens cached at stable prefix (documented hit rates 0.89-0.97) | ~13,900 tokens fixed per API call (73% of each request); tool defs 8,759 tokens + system prompt 5,176 tokens | Not publicly benchmarked |
| **Cold-start / launch** | Documented latency budget: first token 200-500ms; <10ms access control; <50ms session load; <100ms prompt assembly | v0.14.0 cut ~19 seconds from launch; `hermes tools` screen: 14s → <1.5s | Not published |
| **Perf overhead concern** | Streaming first-token budget documented; caching hits reduce per-turn cost substantially | 1-2 tokens/sec cited in older community reports vs. 45 tokens/sec native (unconfirmed for v0.14.0 — see note) | Not benchmarked publicly |

---

## OpenClaw

### Provider breadth

OpenClaw ships with 35+ model providers. The May 2026 model-providers documentation names: OpenAI (including Codex OAuth), Anthropic, Google (Gemini API, Vertex AI, CLI), Moonshot/Kimi, DeepSeek, Mistral, xAI (Grok), Z.AI, MiniMax, Qwen, BytePlus/Volcano Engine (Doubao), Groq, Together AI, OpenRouter, Vercel AI Gateway, Hugging Face Inference, GitHub Copilot, and others to reach 30+. Local/self-hosted targets: Ollama (auto-detected at `http://127.0.0.1:11434`), vLLM (default `http://127.0.0.1:8000/v1`), SGLang (`http://127.0.0.1:30000/v1`), LM Studio, and any OpenAI-compatible or Anthropic-compatible custom endpoint.

Model references follow the `provider/model` string format (e.g., `anthropic/claude-sonnet-4-5`). Custom endpoints support per-model context window, token limits, and cost metadata.

### Per-agent model selection

This is OpenClaw's primary cost lever. The routing specificity cascade (`peer > parentPeer > guildId > channel > default`) applies to *both* routing decisions and model selection — different channels (WhatsApp DMs, Telegram groups, Discord) can be bound to different agents, each with its own primary model. The documented usage pattern: fast/cheap model (e.g., Claude Haiku or Gemini Flash Lite) for heartbeat and routine status checks; reasoning model (Sonnet, GPT-4) only for tasks that warrant it. Community guides report 70-90% cost reduction when applying this correctly to typical workloads.

In April 2026, OpenClaw shipped a provider manifest update enabling model-brain swaps at runtime without rebuilding a workflow — six providers initially supported in that manifest. The `agents.list[].experimental.localModelLean` flag enables per-agent local-model preference.

### Fallback and failover

API key rotation is built into the provider layer. Multiple keys per provider are supported with priority ordering (live overrides > comma-separated lists > primary key > numbered alternates). Rate-limit responses (429, quota exhausted, throttling) trigger key rotation with configurable cooldown probes. Non-rate-limit failures fail immediately without rotation (not transparent failover to alternate providers). Full cross-provider failover is documented separately at `/concepts/model-failover`.

OpenRouter integration is supported, enabling the full OpenRouter model catalog and its own routing primitives (provider ordering, whitelisting, blacklisting) from within OpenClaw config.

### Prompt caching

OpenClaw implements provider-normalized prompt caching across Anthropic, OpenAI, Google, and OpenRouter. The cache boundary is maintained between stable content (tool definitions, workspace Markdown files, system instructions) and volatile content (timestamps, heartbeat data, fresh conversation turns). This byte-identical prefix ordering is enforced so the provider cache hit applies across turns.

Documented 2026-04-04 live cache hit rates on OpenAI:
- Stable prefix: 4,864 cached tokens, **0.966 hit rate**
- Tool transcript: 4,608 cached tokens, **0.896 hit rate**
- MCP-style transcript: 4,608 cached tokens, **0.891 hit rate**

Anthropic cache behavior: `cacheRetention: "short"` = 5-minute TTL; `cacheRetention: "long"` = 1-hour TTL (direct `api.anthropic.com` only). The Anthropic path achieves near-full history reuse on repeated turns, cutting repeated heartbeat costs 70-90%.

### OAuth subscription authentication

OpenClaw explicitly supports OpenAI Codex OAuth — users with a ChatGPT subscription can authenticate via `openclaw onboard → auth choice openai-codex` and use Codex without a separate API key. The token refresh is automatic. This is the only named OAuth subscription path in the OpenClaw docs; xAI, Anthropic Claude Pro, and others appear to require API keys.

### Latency budget (documented)

The `PiEmbeddedRunner` latency contract (from architecture docs):
- Access control: <10ms
- Session load: <50ms
- Prompt assembly: <100ms
- **First token (model streaming): 200-500ms**
- Bash tool execution: <100ms
- Browser tool: 1-3s

These are targets documented in the architecture, not externally validated benchmarks.

### Embedding model

Embedding provider auto-detected in order: local model → OpenAI → Gemini. Changing the embedding provider triggers a full automatic reindex of `~/.openclaw/memory/<agentId>.sqlite`. OpenClaw does not default to ONNX — it prefers a local model first but falls back to cloud providers.

---

## Hermes

### Provider breadth

Hermes supports 40+ direct cloud APIs and, through OpenRouter, 200+ models. The Nous Portal OAuth path (launched April 27, 2026) provides a single subscription covering 300+ frontier models: Claude, GPT, Gemini, DeepSeek, Qwen, Kimi, GLM, MiniMax, Grok, and others.

Named direct providers: Anthropic (with thinking-block support), OpenAI, Google Gemini, DeepSeek, Qwen, xAI (grok-4.3, 1M context), MiniMax, Kimi/Moonshot, NovitaAI, Xiaomi MiMo, z.ai, GitHub Copilot (device-code). NVIDIA NIM via the RTX AI Garage integration. Local: Ollama, vLLM, SGLang, llama.cpp, LM Studio. Any OpenAI-compatible endpoint works.

At the time of the OpenRouter app profile, Hermes had consumed **9.92 trillion tokens** through OpenRouter and held the #1 daily rank — the largest consumption of any app on that platform. 376 different models used. This is consistent with Nous Research's claim that Hermes is "the most used agent on OpenRouter."

### OpenRouter Pareto Code Router

When using OpenRouter, Hermes can configure `provider: openrouter/pareto-code` with a `min_coding_score` parameter (0-1). This maps to three quality tiers based on Artificial Analysis coding percentiles:

- **High (≥0.66)**: Top-tier coding models
- **Medium (0.33-0.66)**: Strong flagship models below the top tier
- **Low (<0.33)**: Capable coders exceeding the median

Within the selected tier, OpenRouter picks **the cheapest currently-available model**. There is also a `:nitro` variant that picks the *fastest* within tier instead. The Pareto Router adds **no per-request fee** — you pay only for the underlying model. Because model selection varies, per-request cost varies. Default `min_coding_score` is 0.65 when unspecified.

This is meaningful for agentic coding workloads: the router absorbs model-selection complexity and bids on cost-quality tradeoffs automatically without the operator pre-selecting a model.

### Auxiliary-task routing

Hermes supports routing vision, web search, and reasoning subtasks to cheaper or faster specialized models while the primary chat model handles general conversation. This is a form of task decomposition routing: not all parts of a turn go to the most expensive model. Details are in `config.yaml` toolset and provider configuration.

### Credential pools

Introduced in v0.7.0, credential pools allow multiple API keys or OAuth tokens per provider. When one key hits rate limits or billing quotas, Hermes rotates to the next healthy credential transparently, maintaining session continuity.

Four rotation strategies: `fill_first` (default), `round_robin`, `least_used`, `random`.

Error-specific handling:
- **429 rate limit**: retry same key once; rotate on second consecutive 429; 1-hour cooldown
- **402 billing/quota**: immediate rotation; 24-hour cooldown
- **401 auth expired**: attempt OAuth token refresh first; rotate if refresh fails

Pools apply across subagents — child agents inherit the parent's credential pools, extending rate-limit protection to delegated tasks. If all pool keys are exhausted, a configured `fallback_model` activates (cross-provider failover of last resort).

### `hermes proxy` (v0.14.0)

The `hermes proxy` command exposes a local OpenAI-compatible endpoint backed by whichever OAuth-authenticated provider Hermes is already signed into. This means:
- A Claude Pro subscription covers Aider, Cline, Codex CLI, Continue, and editor plugins without generating an API key.
- A SuperGrok (xAI X Premium+) subscription via device-code OAuth covers tools expecting an OpenAI endpoint.
- "One subscription, every tool" — no per-tool billing setup.

This is qualitatively different from OpenClaw's OAuth support, which is limited to OpenAI Codex. Hermes's proxy generalizes across any OAuth-capable provider and exposes it to the entire local tool ecosystem.

### Prompt caching

v0.14.0 introduced **cross-session 1-hour Claude prompt caching**. The cache covers system prompts, skills catalog, and memory files — content that remains stable across sessions. The invariant enforced since the early architecture: system context never changes mid-conversation (cache invalidation is opt-in via `--now` flag). This prevents inadvertent cache misses from mid-session system prompt mutations.

Caching applies to background memory review processes as well, reducing the per-turn cost of proactive memory consolidation.

### Token overhead (known issue)

A publicly-tracked GitHub issue (#4379) measured the fixed per-API-call overhead at approximately **13,935 tokens** — comprising:
- Tool definitions (31 tools): 8,759 tokens (46.1%)
- System prompt (SOUL.md + skills catalog): 5,176 tokens (27.2%)
- Variable conversation content: 3,000-8,775 tokens (average ~26.7%)

This means ~73% of each API call is fixed overhead before any user message is processed. At scale: a single evening of 207 API calls across 3 gateway sessions consumed ~3.9 million input tokens in fixed overhead alone. For a 500-call refactor task, fixed overhead is ~7 million tokens.

Root causes: all platforms load the complete core toolset (including 11 browser automation tools totaling 1,258 tokens that are unused on messaging platforms); the skills catalog (~2,200 tokens) is injected into every system prompt rather than loaded on-demand. Community-proposed mitigations exist (platform-specific toolsets, on-demand skill loading) but are not yet defaults as of v0.14.0.

### Performance overhead claim (uncertain)

One community report cited **1-2 tokens/sec throughput through Hermes vs. 45 tokens/sec natively**. This figure:
- Appears in the Hermes Atlas April 2026 report (cited in the dossier)
- Predates v0.14.0's cold-start improvements and deferred-import work
- Has not been reproduced by Nous Research or any primary source
- Is plausibly explained by heavy synchronous initialization on older versions, which the v0.14.0 changes address

**Treat this figure as potentially outdated and unconfirmed for current releases.** The v0.14.0 release explicitly addresses the cold-start path (~19 seconds removed) and achieves 180x speedup for browser operations. Whether the token throughput bottleneck was also resolved is not confirmed in primary sources.

### Cold-start improvements (v0.14.0)

- Launch time: ~19 seconds removed by lazy-loading heavy adapters (Slack, Matrix, Feishu, DingTalk) and deferring heavy client imports (Google Cloud, QQ, Teams, FAL)
- Model catalog loaded from disk cache first, eliminating startup network calls
- `hermes doctor` runs connectivity checks in parallel
- `hermes tools` All-Platforms screen: 14 seconds → under 1.5 seconds
- Browser operations: `browser_console` evaluations 180x faster via persistent Chrome DevTools WebSocket

---

## Vellum

### Provider breadth

Vellum Personal Intelligence names four supported providers: **Anthropic Claude, OpenAI, Google Gemini, Ollama**. The README states "Swap models without changing anything else," implying a unified abstraction layer. No OAuth subscription paths are documented for the personal assistant; the assumption is API keys.

The enterprise Vellum platform (a separate but related product) supports 20+ models across 6+ providers as of December 2025 — but those capabilities belong to the LLMOps platform, not necessarily the open-source personal assistant. The assistant's README and docs do not claim to inherit the enterprise platform's routing infrastructure.

### Embeddings: ONNX by default

Vellum's most notable cost-reduction feature is **local ONNX embeddings by default**. Embedding calls — used for the hybrid BM25-plus-dense retrieval in the knowledge graph, running every 4 hours during memory consolidation and on every retrieval — cost nothing when running locally on-device. The fallback to a cloud embedding provider only activates when local ONNX is unavailable.

OpenClaw and Hermes also support local embeddings (OpenClaw via local-first detection; Hermes via Ollama/vLLM) but neither makes ONNX the explicit documented default. Vellum's choice to default to ONNX is architecturally meaningful: it eliminates a recurring per-operation cost that compounds across an assistant's lifetime.

### Multi-provider routing and failover

The README does not document explicit failover logic, priority ordering between providers, or semantic routing rules (e.g., routing reasoning tasks to one model and retrieval tasks to another). The design emphasis is on provider flexibility ("swap models") rather than automated multi-provider routing. Whether the trust engine or credential store supports multi-key rotation is not documented in public sources.

### Prompt caching

Not independently documented in the personal assistant README. Vellum's enterprise platform documentation covers prompt caching as a provider pass-through feature (Anthropic and OpenAI). Whether the personal assistant activates provider-side caching explicitly (like OpenClaw's cache-boundary enforcement) is unconfirmed.

### Performance

No latency budgets, first-token targets, or cold-start numbers are published for the personal assistant. The proactive check-in loop runs hourly (the assistant reviews notes and pending tasks every hour without user prompting) — this implies at least one LLM call per hour in steady state, but the cost and latency of that call are not documented.

The knowledge graph consolidation runs every 4 hours. With ONNX embeddings, the embedding phase of that consolidation is zero-API-cost. The LLM summarization and deduplication phase would still incur provider costs.

### Summary

Vellum's model/cost story is deliberately narrow and honest about it: four well-known providers, ONNX embeddings as the one concrete cost optimization, and a clean provider-swap abstraction. It does not attempt the routing sophistication of OpenClaw or Hermes. Given that the codebase launched May 7, 2026 at v0.8.4, this likely reflects a "nail the basics" phase rather than a deliberate long-term constraint.

---

## Head-to-head

### Model-agnosticism

All three are model-agnostic in principle, but there is a large practical gap.

**Hermes** is the broadest: 40+ direct APIs + 200+ via OpenRouter + 300+ via Nous Portal OAuth. The Nous Portal subscription collapses multi-provider billing into one account and removes API key management entirely for the supported model set. The `hermes proxy` feature extends this to the broader local tool ecosystem. If avoiding API key proliferation and retaining maximum model choice are goals, Hermes dominates.

**OpenClaw** is second: 35+ providers, strong local support (Ollama/vLLM/SGLang/LM Studio all auto-detected), one OAuth subscription path (OpenAI Codex). Its provider manifest (April 2026) enables runtime model swaps. The gap to Hermes is mostly in OAuth subscription paths and the absence of an equivalent to `hermes proxy`.

**Vellum** is the narrowest: four named providers, ONNX local embeddings, no documented OAuth subscription auth. This is not a weakness of principle — it is a scope decision for a v0.8.4 product launched three weeks before this research.

### Routing sophistication

**Hermes** leads on routing intelligence: the Pareto Code Router automates cost-quality tradeoffs for coding tasks without operator input; auxiliary-task routing splits different subtask types to cheaper/faster models; credential pools handle rate-limit distribution transparently. The routing machinery operates below the application layer.

**OpenClaw** leads on *configuration expressiveness*: per-agent model binding, runtime manifest swaps, and the full specificity cascade give operators fine-grained deterministic control. But that control is manual — operators decide the routing rules; OpenClaw executes them. There is no equivalent of the Pareto Router's automatic cost-quality optimization.

**Vellum** has a provider abstraction but not a routing layer. Four providers, swap at config time. No documented automatic routing.

### Cost reduction: who serves the PRD metric best?

The PRD lists "cost reduction" as a metric. Mapping each product's actual mechanisms:

**OpenClaw's cost levers:**
1. Per-agent model selection (manual configuration; biggest lever — community reports 70-90% savings)
2. Prompt caching with documented high hit rates (0.89-0.97 on stable prefixes)
3. API key rotation preventing per-key quota exhaustion
4. Priority/standard service-tier routing
5. Local model support (Ollama first, then cloud)
6. OpenRouter integration enabling cost-sorted routing from the OpenRouter side

**Hermes's cost levers:**
1. Pareto Code Router (automated cost-quality optimization without manual model selection)
2. Credential pools with rotation strategies (distributes load, prevents quota-driven failures)
3. Auxiliary-task routing to cheaper models
4. Cross-session 1-hour prompt caching (v0.14.0)
5. Local model support (Ollama/llama.cpp/vLLM/LM Studio)
6. Nous Portal OAuth (one subscription, many models — eliminates per-provider billing)
7. Context compression for long conversations
8. **Counter-lever**: ~13,900 token fixed overhead per API call is a structural cost *increaser* that partially offsets the above savings, especially for high-frequency messaging workloads

**Vellum's cost levers:**
1. ONNX embeddings by default (eliminates embedding API costs entirely for the memory/retrieval layer)
2. Ollama for zero-cost local inference
3. Provider pass-through prompt caching (not independently confirmed)

**Verdict**: For cost reduction *at scale*, Hermes has more mechanisms, but the 13,900-token fixed overhead is a real and documented structural drag that partially offsets gains. OpenClaw's per-agent model selection is the single highest-leverage manual mechanism available, and its prompt caching hit rates are the most thoroughly documented of the three. Vellum's ONNX default is the most elegant single decision — it eliminates a cost category entirely rather than reducing it — but its overall cost story is the thinnest.

No product is unambiguously the "cheapest to run" — the answer depends on workload (messaging frequency, task complexity, model choice). High-frequency messaging workloads will feel Hermes's fixed overhead most. Coding-heavy workloads will benefit most from Hermes's Pareto Router. Mixed-use personal assistant workloads get the most control from OpenClaw's per-agent routing.

### Performance

**OpenClaw** is the only product with a published, architecture-level latency budget (first token 200-500ms; tool execution <100ms; session load <50ms). Its caching hit rates are the most precisely documented. These are documented targets, not third-party benchmarks.

**Hermes** has the most concrete improvement data (v0.14.0 cold-start: -19s; browser operations: 180x faster via persistent WebSocket). The 1-2 tokens/sec throughput concern is unresolved at the primary source level for current versions. The 13,900-token fixed overhead is a confirmed performance cost in token-budget terms.

**Vellum** publishes no latency or throughput data for the personal assistant. The enterprise platform tracks latency and cost in its observability dashboards, but that infrastructure is separate from the open-source assistant.

---

## Design considerations for a from-scratch build

These are neutral observations about patterns that emerge from this analysis. No direction is chosen here.

**1. Fixed overhead compounds in personal assistants.** Hermes's 13,935-token fixed overhead is a natural consequence of loading a large tool registry and skills catalog into every system prompt. A from-scratch design could make selective tool loading (platform-specific or task-specific) a first principle rather than a retrofit, reducing per-turn cost structurally.

**2. ONNX embeddings as the default is a sound choice.** Vellum's decision to run embeddings locally by default eliminates a recurring per-operation cost that accrues invisibly over an assistant's lifetime. This is worth evaluating independently of other Vellum design choices.

**3. Prompt cache boundaries require deliberate architecture.** OpenClaw's documented approach — enforcing byte-identical prefix ordering to guarantee provider cache hits — is a runtime contract that must be designed in, not bolted on. Changing memory files or tool lists mid-conversation breaks the cache. A new build can make this contract explicit from the start.

**4. Per-agent model selection requires operational burden.** OpenClaw's most effective cost lever (70-90% savings) requires the operator to manually assign different models to different agents/channels and maintain those assignments as models evolve. Automatic cost-quality routing (like Hermes's Pareto Router for coding, or auxiliary-task routing) shifts that burden from the operator to the system. The tradeoff: manual routing is deterministic and auditable; automatic routing is adaptive but less predictable.

**5. OAuth subscription paths reduce friction for end-users.** API key management is a meaningful barrier for non-developer users. `hermes proxy`'s approach — consume an existing paid subscription rather than generating a new API key — is worth considering for any assistant targeting a broad audience. OpenClaw's single Codex OAuth path validates the concept; Hermes's multi-provider coverage demonstrates the ceiling.

**6. The "broadest provider list" position is difficult to defend long-term.** Both OpenClaw (35+) and Hermes (200+ via OpenRouter) compete on breadth. A new entrant is unlikely to out-breadth either. A narrower but more opinionated provider story (e.g., "best local + one cloud provider, optimized for each") may be more defensible than a generic catalog.

**7. Local-first as a cost strategy, not just a privacy strategy.** The dossiers frame Ollama/local models primarily as a privacy and data-ownership feature. The cost angle is underemphasized: at sufficient volume, local inference on commodity hardware eliminates per-token API costs entirely. This is particularly relevant for high-frequency proactive assistant behaviors (hourly check-ins, 4-hour memory consolidations).

---

## Sources

### From dossiers (previously cited)

- [GitHub: openclaw/openclaw](https://github.com/openclaw/openclaw) — dossier primary
- [docs.openclaw.ai/concepts/features](https://docs.openclaw.ai/concepts/features) — provider count, feature list
- [GitHub: NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent) — dossier primary
- [Release v0.14.0 (v2026.5.16)](https://github.com/NousResearch/hermes-agent/releases/tag/v2026.5.16) — dossier source
- [Hermes Agent AGENTS.md](https://github.com/NousResearch/hermes-agent/blob/main/AGENTS.md) — prompt caching invariant, memory provider ABCs
- [The State of Hermes Agent — April 2026 (Hermes Atlas)](https://hermesatlas.com/reports/state-of-hermes-april-2026) — 1-2 tokens/sec performance report (source of the unconfirmed overhead claim)
- [GitHub: vellum-ai/vellum-assistant README](https://github.com/vellum-ai/vellum-assistant/blob/main/README.md) — provider list, ONNX embeddings, architecture

### New (fresh research for this dimension)

- [Pareto Router docs — OpenRouter](https://openrouter.ai/docs/guides/routing/routers/pareto-router) — min_coding_score tiers, pricing model, shortlist behavior **(NEW)**
- [Pareto Code Router on OpenRouter](https://openrouter.ai/openrouter/pareto-code) — model page with usage stats **(NEW)**
- [Credential Pools — Hermes Agent docs](https://hermes-agent.nousresearch.com/docs/user-guide/features/credential-pools) — rotation strategies, error recovery table, subagent inheritance **(NEW)**
- [AI Providers — Hermes Agent docs](https://hermes-agent.nousresearch.com/docs/integrations/providers) — provider list, Nous Portal OAuth, `hermes proxy` details **(NEW)**
- [Hermes Agent — OpenRouter app profile](https://openrouter.ai/apps/hermes-agent) — 9.92 trillion tokens, 376 models, #1 rank **(NEW)**
- [OpenRouter ships Pareto Code, Hermes Agent rivals OpenClaw — Code Newsletter](https://codenewsletter.ai/p/openrouter-ships-pareto-code-hermes-agent-rivals-openclaw) — Pareto Code Router launch context **(NEW)**
- [Token overhead analysis: 73% fixed overhead — GitHub Issue #4379](https://github.com/NousResearch/hermes-agent/issues/4379) — 13,935-token fixed overhead breakdown, root causes, mitigations **(NEW)**
- [hermes-agent/RELEASE_v0.14.0.md](https://github.com/NousResearch/hermes-agent/blob/main/RELEASE_v0.14.0.md) — cold-start improvements, prompt caching, browser performance **(NEW)**
- [Prompt caching — docs.openclaw.ai](https://docs.openclaw.ai/reference/prompt-caching) — cache hit rates, provider-normalized metrics, Anthropic/OpenAI/Gemini behavior **(NEW)**
- [Model providers — docs.openclaw.ai](https://docs.openclaw.ai/concepts/model-providers) — full provider list, per-agent config, local model auto-detect, failover mechanics **(NEW)**
- [OAuth — docs.openclaw.ai](https://docs.openclaw.ai/concepts/oauth) — OpenAI Codex OAuth flow **(NEW)**
- [One Claude Pro subscription, every tool: using `hermes proxy` — Hermes Agents Blog](https://hermesagents.net/blog/hermes-proxy-claude-pro-aider-cline-codex/) — hermes proxy use cases for Aider/Cline/Codex **(NEW)**
- [xAI Grok OAuth (SuperGrok) — Hermes Agent docs](https://hermes-agent.nousresearch.com/docs/guides/xai-grok-oauth) — SuperGrok device-code OAuth, grok-4.3, 1M context **(NEW)**
- [OpenClaw Cost Optimization Guide 2026 — clawrouters.com](https://www.clawrouters.com/blog/openclaw-cost-optimization-guide-2026) — 70-90% savings claim for model routing **(NEW)**
- [OpenClaw API Cost Optimization — zenvanriel.com](https://zenvanriel.com/ai-engineer-blog/openclaw-api-cost-optimization-guide/) — per-agent model routing patterns **(NEW)**
- [OpenClaw April 2026: 6 Model Providers at Runtime — MindStudio](https://www.mindstudio.ai/blog/openclaw-april-2026-model-agnostic-provider-manifest) — April 2026 provider manifest **(NEW)**
- [Prompt caching — Vellum enterprise docs](https://docs.vellum.ai/product/prompts/prompt-caching) — enterprise platform prompt caching (Anthropic + OpenAI pass-through) **(NEW)**
- [Integration with Hermes Agent — OpenRouter cookbook](https://openrouter.ai/docs/cookbook/coding-agents/hermes-integration) — Hermes + OpenRouter integration mechanics **(NEW)**
- [Configure Multi-Model LLM Routing in Hermes Agent — Fastio](https://fast.io/resources/hermes-agent-multi-model-llm-routing-guide/) — multi-model routing config patterns **(NEW)**
