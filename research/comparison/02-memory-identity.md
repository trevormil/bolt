---
title: "Memory, State & Identity — OpenClaw vs Hermes vs Vellum"
dimension: memory-identity
date: 2026-05-26
status: comparison
note: >
  Point-in-time research (late May 2026). Sources verified against primary repos,
  official docs, and independently corroborated third-party analysis. All figures
  carry the same caveats as the raw dossiers. No product decision is made or implied here.
---

# Memory, State & Identity

## At a glance

| Dimension | OpenClaw | Hermes | Vellum |
|---|---|---|---|
| **Working memory** | MEMORY.md (curated facts) + daily logs `memory/YYYY-MM-DD.md` (today + yesterday auto-loaded) | MEMORY.md (2,200-char hard cap) + USER.md (1,375-char hard cap); frozen snapshot injected once per session | Four files always in context: `essentials.md`, `threads.md`, `recent.md`, `buffer.md` |
| **Long-term store** | SQLite (`~/.openclaw/memory/<agentId>.sqlite`) via sqlite-vec + FTS5; chunks ~400 tokens, 80-token overlap | SQLite (`~/.hermes/state.db`) with FTS5 full-text search; `session_search` tool reaches across all historical sessions | Vector database (knowledge graph); hybrid BM25 + dense; PCA anisotropy correction; per-memory-type staleness windows |
| **Retrieval** | Hybrid: vector 70% weight + BM25 30% weight; MMR (lambda=0.7) for deduplication; temporal decay (30-day half-life, skips evergreen files); `memory_search` + `memory_get` | Keyword-first via FTS5 `session_search`; external providers (Honcho, Mem0, Hindsight, etc.) add semantic/graph layers; frozen MEMORY.md+USER.md snapshot in every prompt | Spreading-activation: summaries loaded first, full page bodies only on demand; hybrid BM25 + dense with PCA correction |
| **Consolidation** | Pre-compaction silent-turn flush: agent writes to MEMORY.md/daily logs before context is summarized; manual `/compact` also supported | Agent consolidates bounded files on capacity overflow; FTS5 search + LLM summarization for session recall; no scheduled consolidation cycle | Every 4 hours: walks `buffer.md`, files into graph pages, promotes to `essentials.md`, merges or discards; corrections fast-tracked to `essentials.md` |
| **Identity model** | Three-layer: SOUL.md (internal behavioral philosophy), IDENTITY.md (external presentation: name/emoji/avatar), USER.md (static user context card); sub-agents do NOT inherit SOUL.md | Single SOUL.md at `~/.hermes/SOUL.md`; slot #1 in system prompt; auto-seeded if absent; session overlays via `/personality`; USER.md is a separate bounded user-profile file | SOUL.md (assistant constitution); NOW.md (ephemeral scratchpad); per-user journal of reflections; assistant is a "separate entity" with its own email, GitHub, Slack handles |
| **Personality acquisition** | User writes SOUL.md manually (template provided at docs.openclaw.ai/reference/templates/SOUL); the template frames identity as demonstrated through "competence, opinion-holding, and resourcefulness" not static traits | Auto-seeded starter SOUL.md on first run; user edits directly; `/personality` overlays for session-level switching; custom personalities definable in `config.yaml` | "Hatching": user provides name + personality direction; assistant observes creator's communication patterns and writes its own SOUL.md; personality is self-authored by the assistant |

---

## OpenClaw

### Working memory: the two-layer Markdown model

OpenClaw separates memory into two Markdown layers that serve different time horizons. **MEMORY.md** is the curated, durable layer — long-term facts, discovered preferences, and key project decisions that should survive indefinitely. The agent is expected to distill from daily logs into MEMORY.md over time, pruning stale entries. **Daily logs** (`memory/YYYY-MM-DD.md`) are append-only raw-capture files; today's and yesterday's files are automatically loaded into context, while older logs are available on-demand via retrieval rather than auto-loaded (preventing context bloat).

A third optional file, `DREAMS.md`, surfaces as a human-readable consolidation diary, though it is not part of the core retrieval path.

### Long-term store: SQLite with sqlite-vec and FTS5

All memory content is indexed into a per-agent SQLite database at `~/.openclaw/memory/<agentId>.sqlite`. The file-watching system debounces reindexes at 1.5 seconds, so Markdown edits are reflected quickly. Text is chunked at approximately 400 tokens with an 80-token overlap before embedding. Two retrieval tools are exposed: `memory_search` (hybrid semantic + keyword) and `memory_get` (targeted file read).

The system deliberately avoids a dedicated vector database. sqlite-vec provides optional in-database vector query acceleration via a `vec0` virtual table, keeping the entire stack in a single local SQLite file. The project explicitly acknowledges this as a known tradeoff: simplicity wins over recall quality at scale.

Embedding provider selection is auto-detected in precedence order: configured local model (via `node-llama-cpp`) → OpenAI `text-embedding-3-small` → Gemini → Voyage → Mistral → DeepInfra → Ollama. Changing the embedding provider or model triggers a full automatic reindex.

### Retrieval: hybrid BM25+vector with tunable parameters

OpenClaw's hybrid retrieval is among the most configurable of the three systems, with documented tuning knobs:

- **Default weights:** vector score 0.7, BM25 keyword score 0.3. The 70/30 split favors semantic matching (paraphrase resolution) while preserving exact-token recall for IDs, error strings, and code symbols.
- **MMR (Maximal Marginal Relevance):** enabled by default, lambda=0.7. Scores each candidate as `lambda × relevance − (1 − lambda) × max_similarity_to_already_selected`, eliminating near-duplicate results.
- **Temporal decay:** exponential score reduction at `score × e^(-lambda × ageInDays)`, default 30-day half-life. Evergreen files (MEMORY.md and non-dated files) skip decay entirely. A note from 7 days ago scores at approximately 85% of its nominal weight; one from 148 days at roughly 3%.
- **CJK support:** trigram tokenization for Chinese, Japanese, and Korean in FTS5.
- **Backend options:** default SQLite; experimental QMD sidecar (combines BM25, vectors, and reranking with session transcript support).

### Consolidation: pre-compaction silent turn

OpenClaw does not run a scheduled background consolidation job. Instead, consolidation is event-driven: when a session approaches its context limit, a **silent agentic turn** fires before compaction proceeds. This turn prompts the model to write important context to MEMORY.md and the current daily log. The model in the silent turn can be overridden (e.g., a local model for efficiency) via `agents.defaults.compaction.memoryFlush.model`. After the flush, the older portion of the session transcript is summarized into a compact entry; the full history is retained on disk but the model only sees the summary plus the most recent messages (approximately the last 20,000 tokens remain intact at default settings with a 200K context window).

A documented bug (GitHub issue #54408) caused pre-compaction flush messages to leak into the main session as visible user messages; patched in v2026.2.23.

### Identity: three layers, deliberately separated

OpenClaw's identity system is the most granular of the three products, splitting identity into three distinct files with explicitly different purposes:

1. **SOUL.md** — *who the agent is internally.* Behavioral philosophy: core truths, ethical boundaries, communication vibe, continuity framing. The template frames identity as something "demonstrated through competence" rather than declared as static traits. The SOUL.md docs say: "This file is yours to evolve. As you learn who you are, update it." Main-agent only; sub-agents do NOT inherit SOUL.md and must receive personality context explicitly in task prompts.

2. **IDENTITY.md** — *how users perceive it externally.* Short by design: name, emoji, creature archetype, vibe descriptor, theme, avatar path. Identity resolves in a specificity cascade: per-agent config → workspace IDENTITY.md → global config → default "Assistant."

3. **USER.md** — *static context card for the human.* Name, timezone, background, expertise level, communication preferences, access/approval levels. Manually updated; not a live database.

This three-layer separation enables a formal soul wearing a playful emoji, or the same soul presented differently across channels — independent evolution of personality, presentation, and the user model.

### Personality acquisition

The user writes SOUL.md manually. OpenClaw provides a template at `docs.openclaw.ai/reference/templates/SOUL` with four sections: Core Truths, Boundaries, Vibe, and Continuity. The template is notably un-prescriptive — it avoids length requirements and instead frames good identity as "becoming someone through consistent values rather than curating a predetermined persona." A third-party community project (`aaronjmars/soul.md`) offers a tool to ingest personal data and generate a soul file automatically.

---

## Hermes

### Working memory: bounded files as a forcing function

Hermes takes the most opinionated stance on working-memory size: MEMORY.md is **hard-capped at 2,200 characters (~800 tokens)** and USER.md at **1,375 characters (~500 tokens)**. Both live at `~/.hermes/memories/` and are injected as a frozen block (separated by a `§` delimiter) into the system prompt at session start. Crucially, that snapshot never changes mid-session — changes written during a session persist to disk immediately but only become visible in the system prompt at the *next* session. This is intentional: the frozen injection preserves the LLM's prefix cache, enabling prompt caching without cache invalidation.

The cap forces deliberate curation. When either file exceeds its limit, the memory tool returns a capacity error and the agent must consolidate or remove entries before adding new ones. The documented pattern is 80%-full → consolidate (e.g., merge three separate "project uses X" entries into one comprehensive description). This means Hermes agents inherently trade long-tail detail for density.

### Long-term store: SQLite with FTS5 and session search

All session history is stored in SQLite at `~/.hermes/state.db` with FTS5 full-text indexing. The `session_search` tool queries this store directly, returning conversations from weeks prior without the token cost of loading them into context. When searching, the agent: queries FTS5 → ranks by relevance → loads top matching sessions → truncates to ~100K chars centered on matches → sends to a fast summarization model (Gemini Flash) for focused summaries.

This is fundamentally a keyword-first retrieval path: FTS5 BM25 drives the initial recall, with LLM summarization as the compression step. Semantic vector recall is not provided natively in the built-in memory path — it arrives only through external providers.

### External memory providers: pluggable ABC layer

Hermes's most architecturally distinctive memory feature is its pluggable provider system. Eight providers are available, each implementing lifecycle hooks: `sync_turn()` (after each response), `prefetch()` (before each turn, non-blocking), `shutdown()`, and session-end extraction. Only one external provider can be active at a time alongside the always-on built-in MEMORY.md/USER.md system — providers are additive, not replacement.

The eight providers and their specializations:

| Provider | Key differentiator |
|---|---|
| **Honcho** | Dialectic cross-session user modeling; builds structured insights about user preferences/habits/goals after each turn via Q&A process; maintains per-peer profiles for multi-agent setups |
| **OpenViking** | Filesystem-style knowledge hierarchy |
| **Mem0** | Server-side LLM fact extraction + semantic search |
| **Hindsight** | Long-term memory with knowledge graph + entity resolution |
| **Holographic** | Local SQLite fact store with FTS5 |
| **RetainDB** | Cloud memory API with hybrid search |
| **ByteRover** | Hierarchical knowledge tree |
| **Supermemory** | Semantic long-term memory with profile recall |

The Honcho integration is worth noting specifically: it builds a "peer card" per Hermes instance and can maintain separate profiles when multiple Hermes instances interact with the same user, preventing cross-contamination across roles (e.g., coding assistant vs. personal assistant).

### Consolidation: manual overflow handling and FTS search

Hermes does not run a scheduled consolidation cycle. Memory management is reactive: when the agent discovers facts worth preserving, it uses the `memory` tool (add/replace/remove operations; no read action since content is already injected). When capacity overflows, the agent consolidates inline. For accessing historical context that doesn't fit in the 2,200-char window, `session_search` provides FTS5 recall as the escape hatch.

The self-evolution companion (`hermes-agent-self-evolution`, DSPy + GEPA) adds evolutionary optimization of SKILL.md files (procedural memory) but does not touch MEMORY.md or USER.md directly.

### Identity: SOUL.md as slot #1 plus session overlays

Hermes's identity system is simpler than OpenClaw's three-layer approach. **SOUL.md** occupies slot #1 in the system prompt, replacing the hardcoded default identity. The file is loaded from `$HERMES_HOME/SOUL.md` only — never from the working directory — and is scanned for prompt-injection patterns before injection. If empty or missing, Hermes falls back to its built-in default personality.

The documented appropriate content for SOUL.md: tone and communication style, directness defaults, how to handle uncertainty or disagreement, stylistic avoid-lists. Project-specific conventions, file paths, and repo details belong in AGENTS.md, not SOUL.md.

A `/personality` command enables **session-level overlays** — temporary persona switches (helpful, concise, technical, creative, teacher, kawaii, pirate, noir, and others) that supplement or override the current session's system prompt without modifying the persistent SOUL.md. Custom personalities can be defined in `config.yaml` under `agent.personalities`.

USER.md (at 1,375 chars) serves as the user profile: name, timezone, technical stack, communication preferences, expectations. It is functionally separate from SOUL.md — SOUL.md describes the agent; USER.md describes the human.

### Personality acquisition

Hermes auto-seeds a starter SOUL.md on first run — the user begins with a real, readable file immediately rather than a blank slate. Editing is manual and direct. The broader identity framing treats SOUL.md as a "versionable file" rather than hidden configuration: it can be committed to a repo, diffed, and shared. There is no onboarding wizard that generates SOUL.md from observed behavior.

---

## Vellum

### Working memory: four-file staged architecture

Vellum's working-memory design is the most structurally explicit of the three, using four purpose-differentiated files that are all loaded into every conversation context. The files are described as "a few hundred lines — tiny against modern context windows" and are persistent across conversations:

- **`essentials.md`** — "Facts that would be embarrassing to forget." The always-critical layer: names, allergies, co-founder spelling. Corrections made by the creator are fast-tracked here, bypassing the normal consolidation queue, guaranteeing the corrected fact is in context for every subsequent conversation.

- **`threads.md`** — Open commitments and active loops. Follow-ups in progress, things waiting on a response. The assistant's "open loops" file.

- **`recent.md`** — Short-term ephemeral context: what happened today and yesterday. Fades out as consolidation runs (older content migrates or is discarded).

- **`buffer.md`** — A staging area. Every fact the assistant decides to remember lands here first, raw and unfiled, until the 4-hour consolidation job processes it.

This staged model means new information passes through a defined lifecycle: `buffer.md` → (consolidation) → graph page / `essentials.md` / `threads.md` / discard. It is the most explicit pipeline of the three systems.

### Long-term store: vector knowledge graph with hybrid retrieval

Behind the always-loaded files sits a **knowledge graph** in a vector database. Vellum describes this as "a self-organizing personal wiki: concept pages for the people in your life, the projects you're running, the doctors, the schools, the running jokes." Each page has a short Wikipedia-style summary and a longer body, connected by directed edges.

Retrieval uses **spreading activation**: relevant pages load initially with summaries only; full page bodies are fetched only when the summary signals relevance. This means only the relevant slice of the graph is ever loaded into context.

The retrieval engine combines **BM25 sparse** and **dense embeddings** (hybrid), with a **PCA (Principal Component Analysis) step to correct for embedding anisotropy** — a known issue where dense embeddings cluster toward the origin in high dimensions, degrading distance comparisons. This PCA correction is an architectural detail not mentioned in any OpenClaw or Hermes documentation and signals a higher-sophistication retrieval pipeline. Local ONNX embeddings are the default, avoiding API calls for indexing.

Memory items are structured and typed (identity / preferences / projects / events) with **source attribution and deduplication**, and **staleness windows per memory type** — different categories of memory decay at different rates.

### Consolidation: 4-hour sleep-like cycle

The 4-hour consolidation cycle is Vellum's most distinctive memory mechanism, explicitly framed as analogous to biological sleep consolidation. The cycle walks through `buffer.md` and makes per-item decisions:

1. **File into a graph page** — new concept, person, or project gets a page.
2. **Merge with an existing page** — the item is related to something already known; summaries are updated.
3. **Promote to `essentials.md`** — the fact is critical enough to be always-in-context.
4. **Discard** — transient or redundant; not worth storing.

Corrections receive special treatment: regardless of where they arrive, corrections are fast-tracked directly to `essentials.md`, ensuring the corrected version is guaranteed in every subsequent conversation rather than buried in the graph.

This approach produces a graph that self-organizes over time, as opposed to OpenClaw's agent-driven curation (manual distillation from daily logs) or Hermes's inline overflow-triggered compaction.

### Identity: the creator/assistant entity model

Vellum's identity design is architecturally the most distinctive of the three. The GLOSSARY.md defines:

- **Assistant**: "not a chatbot, not a copilot, not an agent" — a distinct instance of a Personal Intelligence with its own name, identity, memory, and capabilities.
- **Creator**: "The creator grants permissions, teaches, and is liable for the assistant's actions, but the assistant acts as their own entity, not as the creator."

This creator/assistant separation has operational weight: the assistant can have **its own email address, its own GitHub account, its own Slack handle** — it operates in the world as a separate entity with a distinct identity, not as an impersonation of the creator. The Gateway enforces a hard rule: "the assistant is not allowed to write data to this process. Only the creator can." This is not just framing — it reflects the security model (actor identity resolved once as guardian / trusted / unknown; fail-closed).

**SOUL.md** is the "assistant's constitution" — the principles and behavioral rules followed in every conversation. It captures personality, voice, and tone.

**NOW.md** is an ephemeral scratchpad: in-progress tasks, session context, current goals, and anything the assistant needs to carry between conversations. Unlike SOUL.md (durable) or the memory graph (accumulated), NOW.md is expected to be read and updated naturally as the creator and assistant work together.

The assistant also maintains a **per-user journal** of reflections on past interactions, creating a continuity record across sessions that differs from the structured memory graph.

### Personality acquisition: self-authored onboarding

Vellum's personality acquisition is the most automated and philosophically distinctive of the three. The process is called **"hatching"**: the creator provides a name and a personality direction, and then the assistant **observes the creator's communication patterns and writes its own SOUL.md**. Personality is self-authored by the assistant through behavioral observation, not written by the user from a template.

The proactivity system reinforces the separate-entity framing: **every hour**, the assistant checks in with itself (not waiting for the creator to prompt), reviews its notes for unfinished items or upcoming deadlines, and sends messages proactively across connected channels. The term used in internal docs is "the assistant's own pulse." This hourly self-check-in loop means Vellum's assistant has an ongoing inner life independent of the creator's prompts — a significant architectural commitment to the entity model.

---

## Head-to-head

### Convergence: what all three agree on

All three products converged on the same baseline independently:

- **Markdown files as the source of truth.** MEMORY.md is universal; all three use plain text files that a human can open, read, and edit. This is a deliberate design choice, not an accident.
- **SOUL.md as the personality file.** The name is identical across all three. The concept — a durable, editable file defining the agent's behavioral character — is shared.
- **SQLite for local-first persistence.** All three store session history and indexed memory in local SQLite. No mandatory cloud.
- **Hybrid retrieval as the direction.** All three move toward combining keyword and semantic search, though they are at different stages of implementation maturity.

### Real differences: where the systems genuinely diverge

**Working memory architecture:**

OpenClaw's MEMORY.md is unbounded in principle, growing as the agent writes to it. Hermes's MEMORY.md is hard-capped at 2,200 characters — a forcing function that keeps density high but sacrifices long-tail detail. Vellum's four-file staged system is the most structurally explicit: each file has a defined role in the information lifecycle, and buffer.md provides an explicit staging queue that the other two systems lack.

**Consolidation model:**

This is the sharpest divergence. OpenClaw consolidates reactively (pre-compaction silent turn) — it fires when context overflow threatens, not on a schedule. Hermes consolidates inline when capacity limits are hit, relying on `session_search` for anything that doesn't fit. Vellum runs a scheduled 4-hour background cycle that actively reorganizes memory regardless of conversation activity. Vellum's model is the most expensive computationally but also the most autonomous — the assistant maintains itself without waiting for a context-overflow event.

**Retrieval sophistication:**

OpenClaw exposes the most tuning surface: documented hybrid weights, MMR, temporal decay with per-file exemptions, CJK tokenization. Hermes's built-in retrieval is keyword-first (FTS5 BM25) with LLM summarization; semantic search arrives only through external providers. Vellum's PCA anisotropy correction signals a retrieval pipeline designed for precision, but configuration knobs are not publicly documented to the same degree as OpenClaw's.

**Identity model depth:**

OpenClaw separates identity into three distinct files (SOUL/IDENTITY/USER), enabling independent evolution of behavioral philosophy, external presentation, and the user model. This is the most flexible for multi-persona or multi-agent deployments. Hermes uses a simpler single SOUL.md with session-level overlays — cleaner but less granular. Vellum's creator/assistant entity separation is philosophically the most opinionated: the assistant is a *separate entity* with its own credentials and channels, not a tool that impersonates the user. Sub-agent isolation in OpenClaw (SOUL.md not inherited by sub-agents) creates a practical friction point that Vellum avoids by treating each assistant instance as a first-class entity.

**Personality acquisition:**

OpenClaw's manual-template approach gives the user full control but places the burden on them. Hermes auto-seeds a starter file, reducing friction without automating personality inference. Vellum's "hatching" model — where the assistant observes the creator and writes its own SOUL.md — is the most automated and the most philosophically consistent with the entity model, but it is also the least transparent: the user does not see exactly what behavioral rules were derived from observation.

### Strength assessment by axis

**Working memory clarity:** Vellum (four-file lifecycle is the most explicit and human-legible). Hermes second (bounded files force discipline). OpenClaw third (unbounded MEMORY.md requires more agent judgment to stay useful).

**Long-term retrieval quality:** Vellum edges ahead (PCA-corrected hybrid retrieval + typed memory items + staleness windows per type). OpenClaw second (fully documented tunable hybrid with MMR and temporal decay). Hermes third for built-in path (keyword-first; semantic requires external provider).

**Consolidation autonomy:** Vellum (scheduled 4-hour cycle runs without user action). OpenClaw (silent-turn flush on context overflow — event-driven but automatic). Hermes (inline capacity-overflow handling — reactive, not scheduled).

**Identity flexibility:** OpenClaw (three-layer SOUL/IDENTITY/USER enables multi-persona at scale). Hermes (simple + session overlays). Vellum (entity model is the most philosophically coherent but least granular in file structure).

**Transparency / inspectability:** All three score well on local-first Markdown. OpenClaw's retrieval configuration is the most documented. Vellum's consolidation decision logic is the least documented.

---

## Design considerations for a from-scratch build

These are neutral observations about the design space, derived from comparing the three systems. No direction is chosen here.

**On working memory structure:** The choice between unbounded (OpenClaw), bounded (Hermes), and staged-pipeline (Vellum) reflects a tradeoff between agent autonomy and memory discipline. Bounded files force the agent to curate; unbounded files require good agent judgment; staged pipelines shift the complexity into the consolidation job. A from-scratch builder would need to pick where they want that complexity to live.

**On consolidation timing:** Reactive (event-driven at context overflow) vs. scheduled (time-based background job) are the two poles. Reactive is simpler to implement and incurs cost only when needed; scheduled produces a more consistently maintained memory state but costs compute even when nothing has changed. A hybrid — reactive flush plus periodic lightweight consolidation — is a logical middle ground that none of the three currently ships explicitly.

**On retrieval correctness:** The PCA anisotropy correction in Vellum's retrieval is a signal that embedding-based retrieval degrades in predictable ways without it. Any system relying on dense vector search at scale will encounter this. The OpenClaw hybrid weight defaults (70/30) are explicit starting points; whether those defaults generalize to all workloads is an open empirical question.

**On the entity model:** Vellum's creator/assistant framing — the assistant has its own email, GitHub, Slack; it is not the user — is the most radical commitment. It simplifies some security questions (who is acting?) and complicates others (how does the creator maintain oversight of an entity operating independently?). OpenClaw's SOUL.md non-inheritance in sub-agents is a practical manifestation of the same question in a multi-agent context.

**On personality acquisition:** The spectrum runs from fully manual (OpenClaw template) → auto-seeded starter (Hermes) → observed + self-authored (Vellum). The Vellum model is most coherent with the entity framing but raises a transparency question: what behavioral rules did the assistant derive, and can the creator audit them? An auditable "draft SOUL.md, creator reviews before accepting" flow is not present in any of the three.

**On character limits as product decisions:** Hermes's 2,200-char MEMORY.md cap is simultaneously a constraint and a product stance ("curate, don't dump"). OpenClaw's unbounded MEMORY.md assumes a more capable agent curator. Neither is strictly better — they make different bets on where curation discipline lives.

**On the memory graph vs. flat files:** Vellum's knowledge graph (typed pages with directed edges, Wikipedia-style summaries, spreading activation retrieval) is architecturally more expensive than OpenClaw's and Hermes's flat-file approaches, but it models the domain more faithfully: personal knowledge is relational, not flat. The spreading-activation retrieval (summaries first, bodies on demand) addresses the classic long-context quality problem without a hard token cap.

---

## Sources

Sources are marked **[NEW]** if discovered during this dimension's research and not previously cited in the dossiers, or **[DOSSIER]** if already cited in openclaw.md, hermes.md, or vellum.md.

### OpenClaw

- [docs.openclaw.ai/concepts/memory](https://docs.openclaw.ai/concepts/memory) **[NEW]** — DREAMS.md, daily log auto-loading, action-sensitive memory guidance
- [docs.openclaw.ai/concepts/memory-builtin](https://docs.openclaw.ai/concepts/memory-builtin) **[NEW]** — sqlite-vec, FTS5, chunk sizes (400 tokens, 80 overlap), embedding providers, file-watch debounce
- [docs.openclaw.ai/concepts/compaction](https://docs.openclaw.ai/concepts/compaction) **[NEW]** — silent-turn pre-compaction flush, threshold math, manual `/compact`, full-history preservation
- [docs.openclaw.ai/concepts/memory-search](https://docs.openclaw.ai/concepts/memory-search) **[NEW]** — hybrid weights (70/30), MMR (lambda=0.7), temporal decay (30-day half-life, exponential), CJK trigram support
- [docs.openclaw.ai/reference/templates/SOUL](https://docs.openclaw.ai/reference/templates/SOUL) **[NEW]** — SOUL.md template: Core Truths, Boundaries, Vibe, Continuity sections; principles-over-traits framing
- [openclaw-ai.com/en/docs/concepts/memory](https://openclaw-ai.com/en/docs/concepts/memory) **[NEW]** — confirmed hybrid weights, MMR lambda, temporal decay formula
- [mmntm.net/articles/openclaw-identity-architecture](https://www.mmntm.net/articles/openclaw-identity-architecture) **[NEW]** — SOUL/IDENTITY/USER three-layer separation; identity resolution cascade; multi-agent identity isolation
- [capodieci.medium.com — OpenClaw Workspace Files](https://capodieci.medium.com/ai-agents-003-openclaw-workspace-files-explained-soul-md-agents-md-heartbeat-md-and-more-5bdfbee4827a) **[NEW]** — SOUL.md as "character sheet"; USER.md as static context card; HEARTBEAT.md as cron-in-English
- [clawsetup.co.uk — Hybrid Local Memory](https://www.clawsetup.co.uk/articles/hybrid-local-memory-openclaw-bm25-vectors-sqlite-vec-local-embeddings/) **[NEW]** — sqlite-vec `vec0` virtual table; local-embeddings tradeoff; operational retrieval use cases
- [snowan.gitbook.io — OpenClaw Memory Deep Dive](https://snowan.gitbook.io/study-notes/ai-blogs/openclaw-memory-system-deep-dive) **[NEW]** — confirmed pre-compaction flush trigger; MEMORY.md vs daily logs distinction
- [GitHub: openclaw/openclaw issue #54408](https://github.com/openclaw/openclaw/issues/54408) **[NEW]** — pre-compaction flush bug (leaked as user messages); patched v2026.2.23
- [Bibek Poudel, Medium — "How OpenClaw Works"](https://bibek-poudel.medium.com/how-openclaw-works-understanding-ai-agents-through-a-real-architecture-5d59cc7a4764) **[DOSSIER]**
- [ppaolo.substack.com — OpenClaw System Architecture](https://ppaolo.substack.com/p/openclaw-system-architecture-overview) **[DOSSIER]**

### Hermes

- [hermes-agent.nousresearch.com/docs/user-guide/features/memory](https://hermes-agent.nousresearch.com/docs/user-guide/features/memory) **[NEW]** — MEMORY.md 2,200-char cap / USER.md 1,375-char cap; frozen snapshot pattern; `memory` tool (add/replace/remove); `session_search` FTS5 + Gemini Flash summarization; capacity-overflow consolidation patterns
- [hermes-agent.nousresearch.com/docs/user-guide/features/personality](https://hermes-agent.nousresearch.com/docs/user-guide/features/personality) **[NEW]** — SOUL.md slot #1 in system prompt; injection verbatim after security scan; `/personality` overlays; auto-seeding; custom personalities in `config.yaml`
- [hermes-agent.nousresearch.com/docs/user-guide/features/memory-providers/](https://hermes-agent.nousresearch.com/docs/user-guide/features/memory-providers/) **[NEW]** — all eight providers; additive-not-replacement model; lifecycle hooks (sync_turn, prefetch, shutdown)
- [docs.honcho.dev/v3/guides/integrations/hermes](https://docs.honcho.dev/v3/guides/integrations/hermes) **[NEW]** — Honcho dialectic reasoning; per-turn user modeling; peer cards for multi-agent separation; session summary in base context
- [lumadock.com — Hermes memory architecture](https://lumadock.com/tutorials/hermes-memory-architecture-explained) **[NEW]** — SOUL.md, MEMORY.md, state.db relationship; frozen snapshot confirmation
- [mem0.ai — How memory works in Hermes Agent](https://mem0.ai/blog/how-memory-works-in-hermes-agent-(and-how-to-improve-it)) **[NEW]** — FTS5 session recall flow; Gemini Flash summarization step; Mnemosyne three-tier BEAM architecture reference
- [glukhov.org — agent memory providers compared](https://www.glukhov.org/ai-systems/memory/agent-memory-providers/) **[NEW]** — all eight provider descriptions with differentiators
- [GitHub: NousResearch/hermes-agent AGENTS.md](https://github.com/NousResearch/hermes-agent/blob/main/AGENTS.md) **[DOSSIER]**
- [hermes-agent.nousresearch.com/docs/](https://hermes-agent.nousresearch.com/docs/) **[DOSSIER]**

### Vellum

- [vellum.ai/blog/introducing-vellum](https://www.vellum.ai/blog/introducing-vellum) **[NEW]** — four working memory files (essentials/threads/recent/buffer) with descriptions; knowledge graph (concept pages, directed edges, Wikipedia-style summaries); spreading activation retrieval; BM25+dense+PCA hybrid; 4-hour consolidation cycle; corrections fast-tracked to essentials.md; buffer.md staging queue; graph self-organization framing
- [github.com/vellum-ai/vellum-assistant/blob/main/GLOSSARY.md](https://github.com/vellum-ai/vellum-assistant/blob/main/GLOSSARY.md) **[NEW]** — definitions of Assistant, Creator, Memory, Trust Rules, Credential Vault, Gateway, Personal Intelligence, Home, Self-host
- [github.com/vellum-ai/vellum-assistant/blob/main/README.md](https://github.com/vellum-ai/vellum-assistant/blob/main/README.md) **[DOSSIER]** — SOUL.md, NOW.md, hatching onboarding, fail-closed trust engine, hourly proactivity, local ONNX embeddings
- [vellum.ai/assistant](https://www.vellum.ai/assistant) **[NEW]** — hourly "own pulse" self-check-in; per-user reflections journal
