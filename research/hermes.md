---
title: "Hermes Agent — Research Dossier"
subject: hermes
date: 2026-05-26
status: raw-research
note: Verbatim subagent dossier. Analysis lives in comparison.md, not here.
---

# Hermes Agent: Technical and Market Research Dossier

## Disambiguation Resolved

**The canonical "Hermes" personal AI assistant is `NousResearch/hermes-agent`** — an open-source autonomous agent framework built by Nous Research, launched February 25, 2026. Official site: https://hermes-agent.nousresearch.com/ | GitHub: https://github.com/NousResearch/hermes-agent.

The NousResearch **Hermes LLM model family** (Hermes 2/3/4) is a separate product line — fine-tuned models for instruction-following. The agent framework is a distinct project that happens to be built by the same organization. The Meta/Facebook Hermes JS engine is unrelated.

---

## 1. Popularity and Traction

**Stars and forks (as of May 26, 2026):** 168,000 stars, 27,800 forks, 300+ contributors (the main committer is teknium1 with 2,549 commits; 0xbyt4 with 180; 215 community contributors credited in the v0.14.0 release alone).

**Launch to scale trajectory:** Launched February 25, 2026. Hit 57,200 stars in 6 weeks. Hit 95,600 stars within roughly 7 weeks — described by multiple sources as the fastest-growing agent framework of 2026. As of May 21, 2026, one independent data pull measured 160,175 stars growing at ~1,700/week (initial viral phase has tapered). Star-history.com ranks it global #46 across all GitHub repos.

**OpenRouter claim:** Nous Research states Hermes is "the most used agent in the world according to OpenRouter" as of the NVIDIA blog publication (no date on that claim; treat as a point-in-time assertion, not a durable fact).

**Release cadence:** 14 major releases from February to May 16, 2026 — roughly one every 6–7 days. v0.13.0 ("The Tenacity Release," May 7, 2026) closed 864 commits, 588 PRs, 282 issues in one release cycle. v0.14.0 (May 16) closed 808 commits, 633 PRs, 1,393 files changed, 545 issues, with 215 contributors.

**Ecosystem:** agentskills.io open skill standard; Skills Hub with 652 community skills as of v0.13.0; `awesome-hermes-agent` community list; `hermes-agent-self-evolution` companion repo (3,600 stars, 398 forks); `hermeshub` third-party skill browser. NVIDIA RTX AI Garage and DGX Spark partnership formally announced.

**Funding/Backing:** Nous Research raised $50M Series A (April 2025, lead Paradigm, unicorn valuation of $1B). Prior seed: ~$20M from Distributed Global, North Island Ventures, Delphi Digital, Balaji Srinivasan, OSS Capital. a16z provided a grant. Total raised: $70M across 3 rounds. Team: 20–41 employees (growth accounts for discrepancy). Founders: Jeffrey Quesnelle (CEO), Karan Malhotra (Head of Behavior), "Teknium" (Head of Post Training), Shivani Mitra. Nous Research's dual identity as a model training lab matters: Hermes generates training data and real-world RLHF signal for their models.

---

## 2. Architecture (Deep)

**Language/Runtime:** Python 88.7%, TypeScript 8.3%, Shell 0.5%. Requires Python 3.11 + Node.js + ripgrep + ffmpeg. Installer is a single `curl | bash` (Linux/macOS/WSL2/Termux) or PowerShell (Windows, early beta as of v0.14.0). Also installable via `pip install hermes-agent` as of v0.14.0.

**Agent Loop:** `run_conversation()` in `run_agent.py`. Synchronous main loop executing up to `max_iterations` (default 90). Tool calls are dispatched via `handle_function_call()`. Tools return JSON strings. Messages follow OpenAI format (`role: system/user/assistant/tool`). Reasoning content stored in `assistant_msg["reasoning"]`. Tool calls can execute via `ThreadPoolExecutor` (up to 8 parallel workers). The loop terminates when the model returns non-tool content.

**Memory/Session Model:**
- Storage: SQLite with FTS5 full-text search (`SessionDB` in `hermes_state.py`). All data — memories, skills, session history — lives locally on disk.
- Memory providers are pluggable ABCs orchestrated by `agent/memory_manager.py`. Built-in options: honcho, mem0, supermemory, byterover, hindsight, holographic, openviking, retaindb. Each implements lifecycle hooks: `sync_turn()`, `prefetch()`, `shutdown()`.
- Honcho dialectic user modeling builds cross-session user models.
- Working memory + episodic logs + long-term semantic memory (FTS5 + LLM summarization).
- Bounded memory format: MEMORY.md (2,200 char limit), USER.md (1,375 char limit) — forces deliberate curation rather than unbounded growth.
- Cron sessions pass `skip_memory=True` by default — memory providers do not run during scheduled tasks.
- Prompt caching invariant: the system enforces that system context never changes mid-conversation (cache invalidation is deferred, with opt-in `--now` flag for immediate invalidation). This is a critical stability constraint.
- Cross-session 1-hour Claude prompt caching introduced in v0.14.0.

**Skill System (Procedural Memory):**
- Skills are structured SKILL.md documents capturing procedure, pitfalls, and verification steps.
- Two surfaces: bundled skills (`skills/`) active by default; optional skills (`optional-skills/`) requiring explicit install.
- SKILL.md format aligned with agentskills.io open standard for portability.
- `curator.py` background process tracks skill usage, auto-archives stale skills to `~/.hermes/skills/.archive/`.
- Agent autonomously creates skills after complex tasks; improves them during reuse.
- `hermes-agent-self-evolution` companion project (DSPy + GEPA) adds post-task evolutionary optimization via reflective prompt evolution.
- Skills Hub: 652+ community skills discoverable and installable via `agentskills.io` tap.

**Tool Use:**
- 70+ built-in tools registered via `tools/registry.py`.
- Toolsets (`toolsets.py`) bucket tools by domain: browser, file, terminal, delegation, etc.
- Platforms enable/disable toolsets via curses UI (`hermes tools`) or `config.yaml`.
- MCP (Model Context Protocol) server support added in v0.6.0 (late March 2026). Parallel tool calls supported for MCP servers as of v0.14.0. Tool filtering configurable. Editor integrations (VS Code, Zed, JetBrains) can register MCP servers that flow directly into the agent.
- `execute_code` tool allows programmatic tool calling to collapse multi-step pipelines.
- LSP semantic diagnostics on every file write added in v0.14.0 — runs a real language server and surfaces new errors before the next turn.

**LLM Provider Support:** Nous Portal (OAuth-based, 300+ models), OpenRouter (200+ models, Pareto Code router with `min_coding_score`), OpenAI, Anthropic (with thinking-block support), xAI SuperGrok (OAuth, grok-4.3, 1M context), NovitaAI, Xiaomi MiMo, z.ai, Kimi, MiniMax, custom endpoints. Local model support: llama.cpp, LM Studio, Ollama (all ship built-in). NVIDIA NIM via the RTX AI Garage integration. `hermes proxy` command (v0.14.0) creates an OpenAI-compatible local endpoint backed by any OAuth-authed provider (enables Codex/Aider/Cline/Continue to use Claude Pro or SuperGrok without separate API keys). Credential pools with same-provider rotation for load distribution (v0.7.0+).

**Execution/Sandbox Backends:** Seven backends — local, Docker, SSH, Singularity, Modal, Daytona, Vercel Sandbox. Daytona and Modal offer serverless persistence with hibernation when idle. Docker backend uses container hardening: read-only root filesystems, dropped capabilities, namespace isolation, filesystem checkpoints and rollback.

**Integration/Channel Model (Gateway):** 22 messaging platforms as of v0.14.0 — Telegram, Discord, Slack, WhatsApp, Signal, Matrix, Mattermost, Email, SMS, DingTalk, Feishu (Lark), WeCom (Enterprise WeChat), BlueBubbles (iMessage bridge), Home Assistant, Teams (v0.14.0), LINE (v0.14.0), SimpleX Chat (v0.14.0), plus others. Gateway runs as a single process; all adapters load into it. CLI is also a first-class entry point.

**Multi-Agent:** `delegate_task` spawns subagents with isolated context and terminal sessions. Two orchestration modes: single-goal delegation and parallel batch (capped by `delegation.max_concurrent_children`, default 3). Role system: leaf workers cannot call `delegate_task`, `clarify`, `memory`, etc.; orchestrators retain recursion capability. `delegate_task` is not durable — for long-running work outliving the current turn, use `cronjob` or `terminal(background=True)`. `/handoff` (v0.14.0) transfers an active session between models, personas, or profiles without losing context.

**Profile/Multi-Instance:** Full profile isolation via `get_hermes_home()` — hardcoding `~/.hermes` is a documented anti-pattern. Each profile scopes independently.

---

## 3. Install and Onboarding

**Install method:** Single `curl | bash` (Linux/macOS/WSL2/Termux). As of v0.14.0: also `pip install hermes-agent && hermes` via PyPI. Windows: PowerShell installer, early beta, MinGit bundled, no admin required.

**Prerequisites auto-installed:** Python 3.11, Node.js, ripgrep, ffmpeg, git. The installer handles all of these without manual steps.

**Cold-start time:** v0.14.0 reduced cold-start by ~19 seconds (absolute baseline not published, but the reduction is meaningful for UX).

**Self-host requirements:** Any Linux/macOS machine or WSL2. Docker optional (for container backend). For serverless, Modal or Daytona accounts needed. No minimum hardware spec published, but local model use with DGX Spark and RTX PRO GPUs is documented (Qwen 3.6 27B/35B cited as primary local models).

**Config complexity:** `config.yaml` for provider/model and toolset configuration. SOUL.md for personality definition. Context files for project-specific shaping. Community assessment: "more tedious than OpenClaw" for setup (quoted from hermesatlas.com April 2026 report). Moderate complexity vs. OpenClaw's "Low."

---

## 4. Extensibility Model

Three vectors for third-party extension:

1. **Skills (SKILL.md format):** Standalone procedural documents. Community can publish to the agentskills.io registry or the `huggingface/skills` tap (added as a trusted tap in v0.14.0). Install via `hermes skills install <name>`. Any SKILL.md-compatible skill is portable across agentskills.io-conforming runtimes.

2. **Plugins:** Code-level extensions with access to `ctx.llm` (v0.14.0) — plugins can make their own LLM calls. `tool_override` flag allows plugins to replace built-in tool implementations.

3. **MCP Servers:** Any MCP-compatible server registers as additional tools. Editor integrations can register their own MCP servers into the agent's tool namespace.

The hermeshub community project provides a browse/install UI. The `hermes-agent-self-evolution` companion (DSPy + GEPA) can automatically evolve skill files from session execution traces, with safety gates (full test suite required, size limits, human review before integration).

---

## 5. Data Ownership / Local-First Posture

**Strong local-first by design.** All data — memories, skills, session history — stored in local SQLite (`~/.hermes/`). The `container_persistent` flag controls workspace persistence between sessions (when true, Docker bind-mounts from `~/.hermes/sandboxes/docker/<task_id>/`).

**No cloud dependency for core functionality.** Framework is MIT, runs entirely self-hosted. LLM calls go to whatever provider the user configures (can be local-only via Ollama/LM Studio/llama.cpp).

**Nous Portal** is an optional managed subscription (not required). Free tier: $0/month with $0.10 credit. Paid tiers add credit budgets and bundled tool access (web search, scraping, image gen, browser automation, TTS, code execution). Launched April 27, 2026.

**No telemetry or call-home behavior documented** in public sources. The design explicitly prioritizes "infrastructure-level ownership."

**Caveat:** The persistent unencrypted SQLite memory store is the primary data-sovereignty concern — if an attacker poisons ingested documents, those instructions persist across sessions (memory injection attack, tracked as GitHub issue #496 "Promptware Defense").

---

## 6. Pros and Cons

**Strengths:**
- Self-improving skill system is architecturally novel — genuine procedural memory that compounds over time, not just conversation history retrieval.
- Model-agnostic: local models, 200+ OpenRouter models, major frontier APIs all supported; provider lock-in is minimal.
- 22 messaging platforms from one gateway is unmatched in the space.
- Aggressive release cadence (14 major versions in 3 months) with large community PR volume.
- Security architecture was designed proactively (seven documented layers) rather than retrofitted; compares favorably to OpenClaw's documented CVE history (OpenClaw: CVE-2026-25253 CVSS 9.1, CVE-2026-25891 CVSS 8.4, CVE-2026-26102 CVSS 7.8; ClawHavoc supply-chain campaign with 1,184 malicious packages).
- MIT license, no feature gating behind paid tiers.
- Strong NVIDIA hardware partnership (RTX AI Garage, DGX Spark) provides legitimacy and hardware-optimized paths.
- `hermes proxy` (v0.14.0) turns any OAuth-authed provider into a local OpenAI-compatible endpoint — useful for connecting other tools.
- LSP diagnostics feedback loop is a genuine developer productivity differentiator.

**Weaknesses and Known Limitations:**
- Performance overhead vs. direct inference: one documented case reported 1–2 tokens/sec through Hermes vs 45 tokens/sec native (older report, possibly from earlier versions; not confirmed for v0.14.0).
- Setup is "more tedious than OpenClaw" per community feedback.
- Memory injection (Promptware Defense, issue #496) is a real attack surface — poisoned documents persist in SQLite and can silently influence future sessions.
- Skill marketplace supply-chain risk: malicious skills get code execution on install without runtime sandboxing.
- MCP server trust boundary is under-specified across the ecosystem (not Hermes-specific but affects it).
- CVE-2026-22798 (information disclosure) and CVE-2026-7396 (path traversal in WeChat adapter, low severity) are publicly documented.
- YOLO mode (disables all approval prompts) is dangerous in CI/CD environments.
- Bounded memory format (2,200 / 1,375 char limits) forces curation but loses long-tail detail.
- Skill library value degrades for agents handling wide varieties of unrelated tasks — the learning loop's returns diminish without task repetition patterns.
- Small maintainer core (concentrated commits) creates bus-factor risk despite 300+ community contributors.
- Windows support is early beta as of v0.14.0 with ~40 known platform-specific issues.
- No commercial SaaS hosting option — purely self-hosted.
- Self-improvement narrative ("40% speedup on repeated research tasks") is anecdotal — no published benchmarks validate the learning loop's quantitative gains.

---

## Sources

- [GitHub — NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent) — Primary repo; star/fork counts, AGENTS.md, release tags, language breakdown
- [Hermes Agent Official Site — Nous Research](https://hermes-agent.nousresearch.com/) — Feature claims and deployment overview
- [Hermes Agent Docs](https://hermes-agent.nousresearch.com/docs/) — Memory system, tools, MCP, SOUL.md, security model
- [Hermes Agent AGENTS.md](https://github.com/NousResearch/hermes-agent/blob/main/AGENTS.md) — Code-level agent loop, memory manager ABCs, skill surfaces, multi-agent design, prompt caching invariant
- [Release v0.14.0 (v2026.5.16)](https://github.com/NousResearch/hermes-agent/releases/tag/v2026.5.16) — Full v0.14.0 release notes and scope metrics
- [Release v0.7.0 (v2026.4.3)](https://github.com/NousResearch/hermes-agent/releases/tag/v2026.4.3) — Pluggable memory, credential pools, security hardening details
- [NVIDIA Blog — Hermes Unlocks Self-Improving AI Agents](https://blogs.nvidia.com/blog/rtx-ai-garage-hermes-agent-dgx-spark/) — NVIDIA partnership, local model benchmarks, subagent architecture
- [The State of Hermes Agent — April 2026 (Hermes Atlas)](https://hermesatlas.com/reports/state-of-hermes-april-2026) — Star trajectory, community complaints, performance issues, architectural constraints
- [AI Agent Star Race — May 2026 (Medium/@rosgluk)](https://medium.com/@rosgluk/the-ai-agent-star-race-i-pulled-live-github-data-for-20-frameworks-in-may-2026-b4919dfba5e4) — Live GitHub data for 20 frameworks including Hermes vs. OpenClaw
- [Nous Research $50M Series A (SiliconANGLE)](https://siliconangle.com/2025/04/25/nous-research-raises-50m-decentralized-ai-training-led-paradigm/) — Funding round, Paradigm, Psyche/Solana context, team details
- [Hermes Agent Security Threat Model (Repello AI)](https://repello.ai/blog/hermes-agent-security) — CVEs, attack surfaces, memory injection (issue #496), MCP trust boundary
- [OpenClaw vs. Hermes Agent Honest Comparison (innFactory)](https://innfactory.ai/en/blog/openclaw-vs-hermes-agent-comparison/) — Architecture diff, feature gaps, OpenClaw CVE list, contributor data
- [What Is Hermes Agent? (MindStudio)](https://www.mindstudio.ai/blog/what-is-hermes-agent-openclaw-alternative) — Use-case fit, setup complexity comparison
- [Hermes Agent from Nous Research (i-scoop.eu)](https://www.i-scoop.eu/hermes-agent-from-nous-research/) — Security posture, data ownership, Nous Research as training lab
- [hermes-agent-self-evolution (GitHub)](https://github.com/NousResearch/hermes-agent-self-evolution) — DSPy + GEPA companion, star count, safety guardrails
- [Nous Portal subscription (KuCoin/Phemex)](https://www.kucoin.com/news/flash/nous-research-launches-nous-portal-subscription-platform-to-integrate-hermes-agent-workflows) — Pricing model, free tier details, bundled tools
- [Skills System Docs](https://hermes-agent.nousresearch.com/docs/user-guide/features/skills) — SKILL.md format, Skills Hub, agentskills.io standard
