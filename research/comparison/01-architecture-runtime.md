---
title: "Architecture & Runtime — OpenClaw vs Hermes vs Vellum"
dimension: architecture-runtime
date: 2026-05-26
status: comparison
note: >
  Point-in-time research, late May 2026. All figures carry the same source
  caveats as the raw dossiers. No product decision is made or implied here.
---

# Architecture & Runtime

## At a glance

| Sub-aspect | OpenClaw | Hermes | Vellum |
|---|---|---|---|
| **Primary language** | TypeScript / Node.js | Python (88.7%) + TypeScript (8.3%) | TypeScript / Bun |
| **Runtime** | Node.js 24 (22.19+ min) | CPython 3.11 (synchronous) | Bun (only hard requirement) |
| **Native companion** | Swift (macOS), SwiftUI (iOS) | None (Python everywhere) | Swift 20.2% of codebase (macOS client) |
| **Process model** | Single Gateway daemon (ws://127.0.0.1:18789) + Canvas side-process (port 18793) | Multi-process: Gateway daemon, CLI, ACP server, batch runner — all share one AIAgent class | Three-process: assistant runtime (HTTP API), gateway (channel adapter), credential-executor (isolated RPC) |
| **Agent loop style** | 6-phase event-driven (pi-agent-core ReAct loop); steered, not capped by default | Synchronous ReAct while-loop; 90 iteration default cap; post-hoc summary at cap | Event-driven perception-plan-act-reflect; hourly proactive self-check-in; cap not publicly documented |
| **Concurrency model** | Two-stage lane-based FIFO queue: per-session serialization + global lane (maxConcurrent); pure TypeScript + promises | Synchronous AIAgent (not thread-safe); ThreadPoolExecutor (8 workers max) for parallel tool calls per turn; SQLite WAL for session contention | Three-process isolation; trust-engine resolves actor once per session; tool-level sandbox-exec / bwrap |
| **Multi-agent depth** | Depth 2 max (orchestrator -> workers); maxChildrenPerAgent=5; maxConcurrent=8 sub-agents | Depth 1-3 (configurable max_spawn_depth); max_concurrent_children=3 default; leaf role blocks further spawning | Not publicly specified; multi-assistant via CLI IDs; no documented sub-agent spawning primitive |
| **Context inheritance (sub-agents)** | AGENTS.md + TOOLS.md only; SOUL.md / USER.md / MEMORY.md excluded | Zero conversation history; only explicitly passed goal + context; inherits API keys/credential pool | N/A (no sub-agent spawning documented) |
| **Sandboxing** | Docker per DM/group session (configurable); main sessions run native | Seven backends: local, Docker, SSH, Singularity, Modal, Daytona, Vercel Sandbox | macOS: sandbox-exec (SBPL); Linux: bwrap (bubblewrap); fail-closed -- no fallback to unsandboxed |
| **Session storage** | JSONL append-only event logs + SQLite+sqlite-vec (memory) at ~/.openclaw/ | SQLite FTS5 (sessions + memory) at ~/.hermes/; WAL mode; session chains via parent_session_id | SQLite (trust rules) + keychain/encrypted file (credentials); data at ~/.vellum/ |
| **Credential isolation** | File permissions 0600 at ~/.openclaw/credentials/ | Per-profile isolation; credential pools with provider rotation | Separate credential-executor process; LLM never sees raw tokens; keychain-backed on macOS |
| **LLM providers** | 35+ (Anthropic, OpenAI, Google, DeepSeek, Ollama, vLLM, any OpenAI-compat) | 200+ via OpenRouter; Nous Portal, xAI SuperGrok, llama.cpp, LM Studio, Ollama | Claude, OpenAI, Google Gemini, Ollama; ONNX for local embeddings |
| **Service management** | systemd (Linux) / LaunchAgent (macOS); DigitalOcean 1-Click | systemd / launchd; SIGUSR1 graceful restart; exit code 75 signals respawn | `vellum wake` / `vellum sleep` / `vellum ps` CLI lifecycle |

---

## OpenClaw

### Language and runtime stack

OpenClaw is a TypeScript/Node.js monorepo managed with pnpm, requiring Node.js 22.19 as a minimum (24 recommended). The macOS companion app is Swift; iOS uses SwiftUI; Android uses a WebView wrapper. At its core the agent logic delegates to **`@mariozechner/pi-agent-core`**, a separate MIT library from the pi-mono ecosystem (`badlogic/pi-mono`) that exposes a typed ReAct loop, streaming event normalization across providers, and TypeBox-validated tool definitions. OpenClaw wraps pi-agent-core with workspace file loading, session persistence, multi-channel routing, and its own compaction pipeline.

Pi-mono itself is organized in a strict layered monorepo: `pi-ai` (LLM abstractions) -> `pi-agent-core` (agent loop + tool execution) -> `pi-coding-agent` (high-level SDK). The build enforces this dependency graph -- OpenClaw sits above it.

### Process model

The **Gateway** is a single long-lived Node.js daemon that binds to `ws://127.0.0.1:18789` by default (loopback only). It is the sole control plane: it manages messaging channel adapters (WhatsApp via Baileys, Telegram via grammY, Discord via discord.js, 20+ others), plugin lifecycles, session routing, health monitoring, and cron scheduling. A critical invariant -- one Gateway per host -- exists specifically to prevent WhatsApp session conflicts (Baileys maintains a single persistent session).

Canvas runs as a separate HTTP process on port 18793, serving the agent-generated interactive UI. The same physical port 18789 doubles as the WebSocket API and a Canvas host path (`/__openclaw__/canvas/`), but the Canvas renderer itself is a distinct server.

### Agent loop (6 phases via PiEmbeddedRunner)

The runtime implementation lives in `src/agents/piembeddedrunner.ts`, which drives the pi-agent-core loop through six named phases:

1. **Ingestion** -- Channel adapter delivers message (text, media, sender metadata).
2. **Access Control & Routing** -- Allowlist validation; session type resolution (main / dm / group).
3. **Context Assembly** -- Session history loaded from JSONL; system prompt built from workspace files (AGENTS.md, SOUL.md, TOOLS.md, MEMORY.md, HEARTBEAT.md); semantic memory search via sqlite-vec; relevant skills injected selectively (compact name/description list first; full text on demand).
4. **Model Invocation** -- Assembled context streamed to configured LLM provider; tokens received incrementally.
5. **Tool Execution** -- Tool calls intercepted during streaming; executed (optionally in Docker sandbox for DM/group sessions); results fed back for next ReAct iteration.
6. **Response Delivery & Persistence** -- Output formatted per platform; messages delivered; JSONL event log appended; memory updated.

Documented latency budget: access control <10ms, session load <50ms, prompt assembly <100ms, first token 200-500ms, bash tool ~100ms, browser automation 1-3s.

There is no hard iteration cap on the main agent loop by default. Lobster pipelines (the YAML workflow engine) expose a `maxIterations` parameter for deterministic step loops; a GitHub issue (#9912) tracks a `maxTurns`/`maxToolCalls` config option for the core loop, indicating this is a recognized gap rather than a shipped feature. Inbound messages during active runs are handled by explicit queue modes: `steer` (injects at next tool boundary), `collect` (batches into a follow-up turn), `followup` (waits), or `interrupt` (aborts). This is documented and user-configurable.

### Concurrency model

OpenClaw uses a **two-stage lane-based FIFO queue** implemented in pure TypeScript (no external thread pool):

- **Per-session lane** (`session:<key>`): only one agent run touches a given session at a time. This prevents competing writes to session files, logs, and CLI stdin.
- **Global lane** (default: `main`): session runs flow into a process-wide lane capped by `agents.defaults.maxConcurrent`. The main lane defaults to 4 concurrent runs; the subagent lane defaults to 8.
- **Specialized lanes**: `cron`, `cron-nested`, `nested` lanes run background jobs in parallel without blocking inbound replies.

A **session write lock** (60-second default timeout, non-reentrant unless `allowReentrant: true`) protects transcript modifications. Idempotency keys are required on all side-effecting operations; the server maintains a short-lived deduplication cache.

### Multi-agent orchestration

Multi-agent routing uses a **deterministic specificity cascade**: `peer > parentPeer > guildId+roles > guildId > teamId > accountId > channel > default`. This allows a single WhatsApp number to route to different agents by conversation type.

Sub-agents are spawned via the `sessions_spawn` tool, which returns a `runId` immediately (non-blocking). They run in isolated session namespaces (`agent:<agentId>:subagent:<uuid>`). Key constraints:

- **Depth 2 maximum**: Orchestrators (depth 1) receive session management tools (`sessions_spawn`, `sessions_list`, `sessions_history`). Workers (depth 2) receive none of these tools -- they are pure leaves.
- **maxChildrenPerAgent**: 5 by default (range 1-20).
- **maxConcurrent**: 8 simultaneous sub-agent runs (subagent lane cap).
- **Context inheritance**: sub-agents receive only AGENTS.md + TOOLS.md. SOUL.md, USER.md, IDENTITY.md, HEARTBEAT.md, BOOTSTRAP.md, and MEMORY.md are excluded. All context must be passed explicitly in the task prompt. This is a known design constraint documented by the project.
- **Auto-archival**: sub-agents archive after 60 minutes.

Agent-to-agent messaging uses `agentToAgent` (allow-list controlled) and `sessions_send(sessionKey, message, timeoutSeconds?)`.

---

## Hermes

### Language and runtime stack

Hermes is primarily **Python 3.11** (88.7% of the codebase), with TypeScript (8.3%) for some integration surfaces, and Shell (0.5%). The installer auto-provisions Python 3.11, Node.js, ripgrep, ffmpeg, and git. The core orchestration engine -- `AIAgent` in `run_agent.py` -- is a synchronous Python class (approximately 15,000 lines) that is intentionally not thread-safe; concurrent use requires separate instances. As of v0.14.0, `pip install hermes-agent` is also supported alongside the `curl | bash` installer.

### Process model

Hermes uses a **shared-core, multiple-entry-point architecture**. All entry points -- CLI, gateway, ACP server (stdio/JSON-RPC for editor integrations), and batch runner -- instantiate the same `AIAgent` class. Platform differences are handled at the entry point, not inside the agent.

The **Gateway** (`gateway/run.py`, `GatewayRunner`) is a long-running daemon managing 20+ platform adapters (Telegram, Discord, Slack, WhatsApp, Signal, Matrix, Mattermost, and others as of v0.14.0). It multiplexes all channels in a single process, with per-platform credential isolation, rate-limit flood control (`_flood_strikes`), and platform-native media handling. Session state lives in a shared SQLite database (WAL mode for concurrency; automatic fallback to DELETE mode for incompatible filesystems like NFS/SMB).

Service integration: systemd (Linux) and launchd (macOS). A `SIGUSR1` signal triggers graceful self-restart; exit code 75 signals the service manager to respawn.

The gateway prevents duplicate instances via PID file (`{HERMES_HOME}/gateway.pid`), machine-local locks (`XDG_STATE_HOME/hermes/gateway-locks`), and Windows byte-range file locks.

### Agent loop

The loop in `run_agent.py` follows this turn sequence:

1. **Initialization** -- Generate `task_id`; append user message to history.
2. **Prompt Assembly** -- Build or reuse cached system prompt via `prompt_builder.py`. A critical invariant enforced by the codebase: the system prompt never changes mid-conversation (cache invalidation is deferred; opt-in `--now` flag for immediate invalidation). Cross-session 1-hour Claude prompt caching was introduced in v0.14.0.
3. **Compression Check** -- Triggered if conversation exceeds 50% of context window. The `ContextCompressor` summarizes middle turns, protects system prompts and recent messages, and performs cheap tool-output pruning.
4. **Message Conversion** -- Transforms to provider API format (chat_completions, codex_responses, or anthropic_messages).
5. **API Call** -- Executed with interruption monitoring; provider failover on rate limit or failure.
6. **Response Parsing** -- Either dispatches tool calls (continues loop) or returns final text (terminates).

**Iteration budget**: Default 90 (`agent.max_turns`). An `IterationBudget` tracker monitors progress; at 100% the agent stops and returns a summary of work done. A GitHub issue (#414) documents a "budget pressure warning" feature -- injecting a message to the model before the cap is hit rather than hard-stopping. Sub-agents get independent budgets capped at `delegation.max_iterations` (default 50).

Certain tools are **intercepted before reaching the tool registry**: `todo`, `memory`, `session_search`, `delegate_task`. These modify agent state directly and return synthetic results.

### Concurrency model

The synchronous `AIAgent` class is not thread-safe; `batch_runner.py` manages concurrent agent instances for multi-task parallelism, each with fully isolated state.

Within a single turn, **parallel tool execution** via `concurrent.futures.ThreadPoolExecutor` is supported with up to 8 workers (`min(num_tools, _MAX_TOOL_WORKERS)`). The parallelization decision follows three layers:

1. **Never-parallel list**: interactive tools like `clarify` always run serially.
2. **Safe-to-parallelize set**: read-only tools (file reads, web search, etc.) qualify.
3. **Path-overlap detection**: `_paths_overlap()` blocks concurrent file operations on overlapping filesystem paths.

Results are re-ordered by original call index regardless of completion sequence (blocking `wait()` then ordered collection), unlike Claude Code's streaming-as-complete approach.

The gateway handles multi-user concurrency via SQLite WAL and `GatewayStreamConsumer`, which "buffers tokens and edits the platform message at intervals to avoid flood control" with adaptive backoff.

### Multi-agent orchestration

`delegate_task` creates child `AIAgent` instances with isolated contexts and restricted toolsets. Children start with fully fresh conversation state -- they receive only what the parent passes via `goal` and `context` parameters.

Key parameters:
- **max_spawn_depth**: default 1 (flat only); configurable to 2 or 3. With depth 3 and 3 concurrent children, the tree can reach 27 simultaneous leaf agents -- the documentation explicitly flags this cost.
- **max_concurrent_children**: 3 default.
- **Child timeout**: 600 seconds, reset on each API or tool call.
- **Leaf role** (default): cannot call `delegate_task`, `clarify`, `memory`, `code_execution`, or `send_message`.
- **Orchestrator role**: retains `delegate_task` but still cannot use the other four blocked tools.
- **Context inheritance**: children inherit API keys and credential pools (enabling automatic key rotation on rate limits); they never inherit conversation history.

`/handoff` (v0.14.0) transfers an active session between models, personas, or profiles without losing context -- a distinct mechanism from sub-agent spawning.

`delegate_task` is not durable across process restarts. For long-running work, the documented pattern is `cronjob` or `terminal(background=True)`.

---

## Vellum

### Language and runtime stack

Vellum's assistant is **TypeScript 78.5%**, **Swift 20.2%** (macOS client), and Shell 0.8%. The runtime is **Bun** -- the only hard prerequisite. All package scripts use `bun install`, `bun run`, and `bun test`. TypeScript correctness is checked via `bunx tsc --noEmit`. This makes Vellum structurally distinct from both OpenClaw (Node.js) and Hermes (Python), choosing Bun's performance-first, batteries-included JS runtime rather than either mainstream alternative.

Targeted platforms: macOS and Linux. ONNX runtime handles local embeddings by default (no external embedding service required).

### Process model

Vellum runs as **three coordinated processes**, started and stopped via `vellum wake` / `vellum sleep` / `vellum ps`:

1. **Assistant runtime** (`assistant/`): Bun-based core logic and HTTP API. This is the agent brain -- handles LLM calls, memory retrieval, skill injection, and tool execution.
2. **Gateway** (`gateway/`): Channel adapter layer for Telegram, Slack, macOS app, and web. Acts as a reverse proxy routing inbound messages to the assistant runtime.
3. **Credential executor** (`credential-executor/`): Isolated RPC service. Credentials (API keys, OAuth tokens) live here in the macOS Keychain (or encrypted file on Linux) and are served to the runtime over a local RPC interface. The LLM never receives raw tokens directly -- the model calls tools, the credential executor resolves credentials to actual values only at execution time.

This three-process split is a deliberate security choice. The `CredentialBroker` enforces `allowedTools` and `allowedDomains` per credential. Ingress blocking scans inbound messages for secrets using regex and entropy analysis before they reach the agent.

### Agent loop

The loop is **event-driven and reactive** rather than a tight synchronous while-loop. The broad cycle is: perceive -> plan -> act -> reflect -> repeat. Specific internal implementation details (file names, class names, iteration cap) are not publicly documented in depth -- the project is newest and least documented of the three.

What is documented:

- **Tool execution environments**: Two sandboxed contexts. Workspace tools (`file_read`, `file_write`, `file_edit`, `bash`) are confined to `~/.vellum/workspace`. Host tools (`host_bash`, `host_file_read`, etc.) execute on the host, gated by trust rules and requiring explicit permission prompts.
- **Sandboxing**: macOS uses `sandbox-exec` with SBPL profiles (no extra deps). Linux uses `bwrap` (bubblewrap). Both are fail-closed -- if the sandbox backend is unavailable, the command fails immediately rather than running unsandboxed. This is a stronger default posture than OpenClaw's (native main sessions) or Hermes's (local backend requires no sandbox).
- **Trust engine**: Resolves actor identity once per session to one of three roles -- guardian, trusted, or unknown. Trust rules persist in SQLite with glob pattern matching on commands, file paths, and URLs. Priority: deny supersedes ask supersedes allow at equal priority; more specific patterns override broader ones. An `autoApproveUpTo` threshold controls risk tolerance per context (conversation, background, headless).
- **Proactivity engine**: The assistant "checks in with itself" hourly, re-reads notes, identifies unfinished items and upcoming deadlines, and sends messages proactively without user prompting. This is a scheduled self-invocation of the agent loop rather than a separate reasoning process.
- **Memory consolidation**: Runs every 4 hours (described as analogous to biological sleep-based consolidation). Working memory uses four markdown files (`essentials.md`, `threads.md`, `recent.md`, `buffer.md`); long-term memory uses a knowledge graph with hybrid BM25 + dense embedding retrieval.

Skills are manifest-driven (`SKILL.md` + `TOOLS.json`), injected at runtime, and executed in sandboxed environments. The system supports 60+ built-in skills.

### Multi-agent and concurrency

Multi-assistant management is via the CLI (`vellum [command] [assistant-id]`), with each assistant maintaining isolated per-user and per-channel memory. There is no documented sub-agent spawning primitive analogous to OpenClaw's `sessions_spawn` or Hermes's `delegate_task`. Each assistant is an independent entity with its own email address, GitHub account, and Slack handle -- the design philosophy positions assistants as separate entities rather than as orchestratable workers.

Concurrency within a session is constrained by the three-process isolation: the credential executor serializes credential resolution; the gateway handles channel multiplexing; the assistant runtime processes one session's turn at a time. This is architecturally simpler than both OpenClaw's lane queue and Hermes's SQLite WAL, but the tradeoff is that multi-assistant parallelism is managed at the process level (separate `vellum wake` instances) rather than internally.

---

## Head-to-head

### Where they converge

All three route inbound messages through a gateway-style process, delegate to a core agent loop, execute tools in isolated environments, and persist session state locally. All three support multi-LLM-provider backends. All three use markdown-format files as the primary substrate for identity and memory configuration (SOUL.md, AGENTS.md, MEMORY.md in OpenClaw and Hermes; essentials.md / threads.md / SOUL.md in Vellum). This structural convergence is not coincidence -- it reflects a community consensus around what a local-first personal assistant architecture looks like in 2026.

### Where they diverge

**Language choice is the deepest architectural fault line.** Hermes chose Python because its model-training lab (Nous Research) runs Python, its ML ecosystem is Python-native, and rapid research iteration favors it. OpenClaw chose TypeScript because Steinberger is a Swift/JS developer building a tool that integrates deeply with macOS, Telegram, and web UIs -- TypeScript on Node.js is the natural fit for event-driven WebSocket gateway work. Vellum chose TypeScript on Bun -- sharing OpenClaw's language while betting on Bun's faster startup, lower memory footprint, and built-in test runner. The language choice propagates into every other architectural decision: threading models (Python GIL forces the ThreadPoolExecutor/batch-runner approach; TypeScript gets native async/await with promise queues), deployment ergonomics, and available ML library options.

**Process model complexity**: Hermes is simplest to reason about (one AIAgent class, everything funnels in). OpenClaw adds complexity with the Gateway daemon + per-session command queue. Vellum is structurally the most modular (three processes), which is also its key security claim -- but that modularity means more moving parts for self-hosters to manage.

**Iteration caps and loop discipline**: Hermes is the only product with a hard default cap (90 turns), a documented budget-pressure warning mechanism, and a per-subagent limit (50). OpenClaw has no native cap (Lobster adds `maxIterations` for YAML pipelines; a GitHub issue tracks adding it to the core). Vellum's cap is undocumented. For production deployments, an explicit loop budget is a meaningful runaway-cost control; Hermes is architecturally ahead here.

**Sub-agent spawning maturity**: OpenClaw has the most specified sub-agent system (depth-2 constraint, explicit tool exclusions at depth-2, `maxChildrenPerAgent`, `maxConcurrent`, named session format, auto-archival). Hermes's `delegate_task` is more flexible on depth (configurable 1-3) but caps concurrent children at 3 vs OpenClaw's 8. Vellum has no equivalent -- multi-assistant coordination is handled by running separate `vellum wake` processes. For orchestration-heavy use cases, OpenClaw and Hermes are ahead; for simple personal-assistant use cases, Vellum's omission is a non-issue.

**Sandboxing default posture**: Vellum's fail-closed `sandbox-exec`/`bwrap` applies to all tool execution by default, with a meaningful workspace-vs-host-tool distinction. OpenClaw sandboxes DM/group sessions in Docker but leaves main sessions running native (the source of several CVEs). Hermes offers the most backend flexibility (7 options) but that flexibility means sandboxing is an opt-in configuration choice rather than a system invariant.

**Credential isolation**: Vellum's separate `credential-executor` process is the strongest model -- it is structurally impossible for a compromised prompt to exfiltrate API keys through the LLM, because the LLM never has them. OpenClaw stores credentials at rest with 0600 permissions, accessible to any process running as the owner. Hermes uses per-profile isolation and credential pools. For an adversarial threat model, Vellum's process isolation is the hardest to attack.

### Architectural strength by sub-aspect

- **Concurrency model**: OpenClaw's two-stage lane queue is the most explicit and documented, handling steering, debouncing, and queue modes as first-class concerns. It is production-grade for multi-channel deployments. Hermes's batch_runner + ThreadPoolExecutor is pragmatic but requires the caller to manage instance lifecycle. Vellum's concurrency model is the least documented.

- **Multi-agent orchestration**: OpenClaw is narrowest (depth 2, strict tool exclusions) but most specified. Hermes is most flexible (depth 3, configurable) with cost warnings and role system. Vellum does not offer this axis.

- **Sandboxing and credential isolation**: Vellum is architecturally ahead on both -- but is also youngest and least battle-tested. OpenClaw has the most CVE history precisely because its main-session-native posture was exploited repeatedly.

- **Loop discipline**: Hermes wins with explicit iteration budgets and sub-agent caps. OpenClaw's lack of a native cap is a documented gap.

- **Runtime startup performance**: Bun's sub-100ms startup vs Node.js's ~300ms and Python's cold-start overhead (v0.14.0 reduced Hermes cold-start by ~19 seconds, suggesting the baseline was non-trivial) gives Vellum and OpenClaw a startup latency advantage over Hermes. OpenClaw documents a 200-500ms first-token target; Hermes does not publish this figure.

---

## Design considerations for a from-scratch build

These are neutral observations about what the architecture & runtime axis reveals -- not a recommendation for any particular approach.

**Language and runtime shape everything downstream.** Python gives immediate access to the ML/data-science ecosystem and is the natural fit if training-data generation or local fine-tuning is in scope. TypeScript (Node.js or Bun) is the natural fit for event-driven gateways, WebSocket-heavy multi-channel work, and teams with a web-development background. Bun's faster startup and built-in test runner are genuine advantages for a developer-centric tool. A from-scratch build should select its language primarily by where the team is strongest and what the primary integration surface is, not by imitating incumbents.

**The three-process model (assistant + gateway + credential executor) is worth serious consideration as a security-first default.** It prevents the most common credential-exfiltration attack paths by construction, at the cost of slightly more operational complexity for self-hosters. The alternative (single process, 0600 credential files) is simpler to deploy but requires getting sandboxing exactly right to avoid the CVE patterns OpenClaw encountered.

**Explicit iteration budgets reduce runaway costs and improve observability.** Hermes's default-90 + sub-agent-50 model is simple and effective. A from-scratch build should have a configurable cap with a graceful "summarize and stop" behavior rather than a hard abort.

**Lane-based session serialization solves a real correctness problem.** OpenClaw's explicit `steer`/`collect`/`followup`/`interrupt` queue modes address a subtle issue: what happens when the user sends a message while the agent is mid-tool-execution. Designing this explicitly (rather than discovering it through bug reports) is worthwhile.

**Sub-agent depth limits exist for good reasons.** OpenClaw's depth-2 cap and Hermes's cost warning at depth 3 reflect real-world experience. Unlimited spawning creates unbounded cost and debugging surfaces. An explicit depth limit (with clear semantics for what tools leaf nodes lack) should be part of any multi-agent design from the start.

**Sandboxing default posture matters more than sandbox flexibility.** Seven configurable backends (Hermes) is impressive, but the default state -- what happens if the operator doesn't configure sandboxing -- is the security-relevant number. Fail-closed defaults (Vellum) are harder to misconfigure than opt-in Docker flags (OpenClaw).

**The proactive hourly self-check-in is a novel runtime pattern.** No POSIX cron equivalent captures the semantics correctly -- it is the agent running the same reasoning loop on itself, with access to its own memory and tools. Any framework that wants genuine proactivity (not just message delivery on a schedule) needs to model this as a first-class loop invocation, not a timer callback.

---

## Sources

### From the dossiers (pre-existing research)

- [ppaolo.substack.com: "OpenClaw System Architecture"](https://ppaolo.substack.com/p/openclaw-system-architecture-overview) -- Gateway internals, PiEmbeddedRunner phases, Canvas port 18793
- [gist.github.com/mmarcus006: Multi-Agent Architectures Compendium](https://gist.github.com/mmarcus006/8b3bb89cb213b6d4359bf1bb928079b3) -- Routing cascade, sub-agent session format, depth 2 constraint, maxConcurrent=8, context inheritance rules
- [GitHub: NousResearch/hermes-agent AGENTS.md](https://github.com/NousResearch/hermes-agent/blob/main/AGENTS.md) -- AIAgent class, memory manager ABCs, prompt caching invariant, skill surfaces, multi-agent design
- [DEV Community (ggondim): "Deterministic Multi-Agent Dev Pipeline"](https://dev.to/ggondim/how-i-built-a-deterministic-multi-agent-dev-pipeline-inside-openclaw-and-contributed-a-missing-4ool) -- Lobster YAML pipeline, maxIterations in sub-workflows
- [Bibek Poudel, Medium: "How OpenClaw Works"](https://bibek-poudel.medium.com/how-openclaw-works-understanding-ai-agents-through-a-real-architecture-5d59cc7a4764) -- Memory model, MCP, SOUL.md format
- [GitHub: vellum-ai/vellum-assistant README](https://github.com/vellum-ai/vellum-assistant/blob/main/README.md) -- Repo structure, vellum wake/sleep/ps commands, credential executor description
- [GitHub: vellum-ai/vellum-assistant GLOSSARY.md](https://github.com/vellum-ai/vellum-assistant/blob/main/GLOSSARY.md) -- Assistant, Creator, Trust Rules vocabulary

### New research (this document)

- [docs.openclaw.ai/concepts/agent-loop](https://docs.openclaw.ai/concepts/agent-loop) -- Official 5-stage loop description, session write lock, queue modes (steer/followup/collect/interrupt), 60-second lock timeout
- [docs.openclaw.ai/concepts/architecture](https://docs.openclaw.ai/concepts/architecture) -- Gateway binding ws://127.0.0.1:18789, one-per-host invariant, device pairing, WebSocket protocol, idempotency keys
- [docs.openclaw.ai/concepts/queue](https://docs.openclaw.ai/concepts/queue) -- Lane-aware FIFO queue, per-session lanes, global lane, main=4/subagent=8 defaults, cron lanes
- [theagentstack.substack.com: "OpenClaw Architecture Part 2: Concurrency"](https://theagentstack.substack.com/p/openclaw-architecture-part-2-concurrency) -- Steering behavior, inbound dedupe, debouncing, dmScope isolation
- [hermes-agent.nousresearch.com/docs/developer-guide/agent-loop](https://hermes-agent.nousresearch.com/docs/developer-guide/agent-loop) -- Official loop phases, IterationBudget, max_iterations=90, _handle_max_iterations(), compression at 50% context
- [hermes-agent.nousresearch.com/docs/developer-guide/architecture](https://hermes-agent.nousresearch.com/docs/developer-guide/architecture) -- Multi-process model, GatewayRunner, AIAgent as shared core, CLI/gateway/ACP/batch entry points, Python synchronous design, per-profile isolation
- [hermes-agent.nousresearch.com/docs/user-guide/features/delegation](https://hermes-agent.nousresearch.com/docs/user-guide/features/delegation) -- delegate_task mechanics, max_spawn_depth (1-3), max_concurrent_children=3, leaf/orchestrator roles, blocked tools, child timeout 600s, /handoff
- [deepwiki.com/NousResearch/hermes-agent/7.1-gateway-architecture](https://deepwiki.com/NousResearch/hermes-agent/7.1-gateway-architecture) -- GatewayRunner daemon, SQLite WAL, SessionDB with FTS5, WAL fallback, session lineage, PID file, machine-local locks, GatewayStreamConsumer adaptive backoff, systemd/launchd integration
- [kenhuangus.substack.com: "Chapter 5: Tool Orchestration and Execution"](https://kenhuangus.substack.com/p/chapter-5-tool-orchestration-and) -- _should_parallelize_tool_batch(), never-parallel list, safe-to-parallelize set, path-overlap detection, ThreadPoolExecutor 8 workers, blocking wait vs Claude Code streaming
- [nader.substack.com: "How to Build a Custom Agent Framework with PI"](https://nader.substack.com/p/how-to-build-a-custom-agent-framework) -- pi-mono layered architecture (pi-ai -> pi-agent-core -> pi-coding-agent), tool TypeBox schemas, event system (agent_start/turn_start/tool_execution_start/end), how OpenClaw wraps pi-agent-core
- [vellum.ai/docs/developer-guide/contributing](https://www.vellum.ai/docs/developer-guide/contributing) -- Monorepo structure (assistant/, gateway/, credential-executor/, cli/, clients/, packages/, skills/), Bun as only hard requirement, sandbox-exec on macOS / bwrap on Linux
- [vellum.ai/docs/developer-guide/security](https://www.vellum.ai/docs/developer-guide/security) -- sandbox-exec SBPL profiles, bwrap, fail-closed posture, workspace vs host tool distinction, CredentialBroker allowedTools/allowedDomains, trust rules SQLite, autoApproveUpTo, ingress secret scanning
- [github.com/openclaw/openclaw issue #9912](https://github.com/openclaw/openclaw/issues/9912) -- maxTurns/maxToolCalls config gap in core agent loop
- [github.com/openclaw/lobster](https://github.com/openclaw/lobster) -- Lobster YAML pipeline engine, maxIterations for sub-workflows
- [github.com/NousResearch/hermes-agent issue #414](https://github.com/NousResearch/hermes-agent/issues/414) -- Iteration budget pressure warning feature request
