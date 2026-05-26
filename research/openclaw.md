---
title: "OpenClaw — Research Dossier"
subject: openclaw
date: 2026-05-26
status: raw-research
note: Verbatim subagent dossier. Analysis lives in comparison.md, not here.
---

# OpenClaw: Deep Technical & Market Research Dossier

*Research completed: May 26, 2026. All statistics sourced and dated below.*

---

## 1. Popularity & Traction

### GitHub Stars Timeline
| Date | Stars | Event |
|---|---|---|
| Nov 24, 2025 | Launch | Released as "Clawdbot" by Peter Steinberger |
| Jan 29, 2026 | ~9,000 | Relaunch day as "OpenClaw" |
| Jan 30, 2026 | ~43,000 | +34,168 stars in 48 hours (peak growth rate) |
| Feb 2, 2026 | ~60,000 | 72 hours post-relaunch |
| Mar 2, 2026 | 247,000 | Surpassed React's 10-year GitHub record |
| Mar 3, 2026 | 250,829 | Confirmed by openclawvps.io stats page |
| Mar 24, 2026 | 335,000 | Continued growth |
| Apr 2, 2026 | 346,000 | Per April stats digest |
| ~May 2026 | 373,000–375,000 | Per GitHub repo read (current) |

### Repository Metrics (as of May 2026)
- **Stars:** 375,000+
- **Forks:** 58,000–78,100 (sources vary; 58K from April stats, 78K from repo)
- **Contributors:** 1,200+
- **Commits (main branch):** 52,607
- **Open Issues:** 3,800+
- **Open PRs:** 3,100+
- **Issue close rate:** 89.9% (highest in its competitive category)
- **npm packages directly depending on openclaw:** 88

### Community
- **Discord ("Friends of the Crustacean 🦞🤝"):** 169,545 members
- **X/Twitter followers:** 31,900+
- **Monthly active users:** 3.2 million (April 2026)
- **Running instances globally:** 500,000+ across 82 countries
- **Monthly website visitors:** 38 million (April 2026)
- **ClawHub skills marketplace:** 44,000+ skills (up from 5,700 in February 2026)
- **Community MCP servers on npm/GitHub:** 1,000+
- **ClawCon SF 2026:** 1,200 attendees from 34 countries

### Release Cadence
- Versioning: `YYYY.M.D` (e.g., `2026.4.22`). Three tracks: **stable**, **beta**, **dev**.
- Approximately 13 tagged releases in March 2026 alone (~one every two days).
- Beta-first promotion model; stable follows after beta validation.

### Funding & Backing
- **No VC funding identified.** Project was bootstrapped by Steinberger personally. The Next Web reported Steinberger's 100 AI agents spent $1.3 million in OpenAI tokens in 30 days building the project.
- **Feb 14, 2026:** Steinberger announced joining OpenAI's Agents team. OpenAI committed to sponsoring OpenClaw under the MIT license.
- **OpenClaw Foundation** formed for long-term stewardship; governance documents not yet published as of mid-April 2026.
- **Ecosystem revenue:** 180 startups building on OpenClaw generating $320K+/month combined (April 2026).

### Notable Third-Party Activity
- **NVIDIA** announced **NemoClaw** at GTC 2026 — an enterprise security/privacy hardening layer on top of OpenClaw.
- **IronClaw** (NEAR AI): Rust reimplementation with privacy-first architecture.
- **OpenClaw-RL** (Princeton/Gen-Verse): RL fine-tuning layer; personalization scores improved from 0.17 to 0.76 after 8–36 interactions.
- Chinese government **restricted state enterprises and agencies** from using OpenClaw (March 2026).
- Community shipped skills for Stripe, Supabase, GitHub, Slack, HubSpot within first two weeks of launch.

---

## 2. Architecture

### Language & Runtime
- **TypeScript/JavaScript monorepo**, managed with **pnpm**.
- Runtime: **Node.js 24** recommended (22.19+ minimum).
- macOS companion app written in **Swift**.
- Mobile (iOS): **SwiftUI** wrapper. Android: **WebView**.

### Overall Structure: Monolith Gateway + Modular Extensions
Not a true microservices architecture, but not a naive monolith either. The Gateway is a single long-lived process; extension/plugin loading is modular. It is best characterized as **a single-process hub with a plugin extension model**.

### The Agent Loop (6 Phases)
Implemented in the `PiEmbeddedRunner` (uses the `@mariozechner/pi-agent-core` library):

1. **Session Resolution** — Maps incoming message to a security-bounded session (main/dm/group).
2. **Context Assembly** — Loads session history, builds system prompt from workspace Markdown files (AGENTS.md, SOUL.md, USER.md, IDENTITY.md, TOOLS.md, HEARTBEAT.md, BOOTSTRAP.md, MEMORY.md), queries memory via semantic search.
3. **Model Streaming** — Sends assembled context to configured LLM provider; streams chunked token responses.
4. **Tool Execution** — Intercepts tool-call outputs, executes (possibly sandboxed), streams results back to model for ReAct-style iteration.
5. **Response Delivery** — Formats per platform (markdown conversion, size limits), delivers via channel adapter, persists session state.
6. **Persistence** — Appends to session event log; updates memory/SQLite as needed.

**Latency budget (documented):** Access control <10ms, session load <50ms, prompt assembly <100ms, first token 200–500ms, bash tool <100ms, browser tool 1–3s.

### Gateway Design
- Runs on **Node.js** as a single background process binding to **`ws://127.0.0.1:18789`** (loopback-only by default).
- Single source of truth for sessions, routing, and channel connections.
- **One Gateway per host** (prevents WhatsApp session conflicts).
- Event-driven architecture via WebSocket subscriptions, not polling.
- **Command Queue** per session serializes message processing to prevent tool conflicts.
- Type-validated protocol via JSON Schema from TypeBox definitions.
- **Idempotency keys** required on all side-effecting operations.

### Multi-Agent Routing
Routing follows a **deterministic specificity cascade**: `peer > parentPeer > guildId+roles > guildId > teamId > accountId > channel > default`. Configured via `bindings` in `openclaw.json`. Example: one WhatsApp number can route different DMs to different agents; WhatsApp → fast Sonnet, Telegram → deep Opus.

**Sub-agents** spawned via the `sessions_spawn` tool run in isolated sessions (`agent:<agentId>:subagent:<uuid>`). Default concurrency: 8 (`maxConcurrent`). Nested sub-agents work up to **depth 2** (orchestrator → workers; workers receive no spawning tools). Parent termination cascades to children. Sub-agents auto-archive after 60 minutes.

**Agent-to-agent communication:** `agentToAgent` tool with configured allow-lists; `sessions_send(sessionKey, message, timeoutSeconds?)` for fire-and-forget addressing.

**Important constraint:** Sub-agents receive only `AGENTS.md + TOOLS.md`; they do NOT inherit `SOUL.md`, `USER.md`, `IDENTITY.md`. Additional context must be passed explicitly in task prompts.

### Session & Memory Model
**Storage layout:**
- `~/.openclaw/openclaw.json` — config (JSON5)
- `~/.openclaw/sessions/` — append-only event logs with branching support
- `~/.openclaw/memory/<agentId>.sqlite` — SQLite with vector embeddings (`sqlite-vec`)
- `~/.openclaw/workspace/` — Markdown files (MEMORY.md, SOUL.md, HEARTBEAT.md, daily logs `YYYY-MM-DD.md`)
- `~/.openclaw/credentials/` — file permissions 0600, auto-excluded from VCS
- `~/.openclaw/agents/<agentId>/agent` and `/sessions` — per-agent isolation

**Memory architecture:**
- Daily logs are append-only, retrieved on-demand to avoid context bloat.
- `MEMORY.md` holds long-term facts and preferences.
- `SOUL.md` holds personality and communication style (main agents only, not sub-agents).
- `HEARTBEAT.md` holds proactive task checklists.
- Compaction: automatic summarization of older turns when context limits approach.
- Retrieval: hybrid semantic + keyword search via SQLite; embedding provider auto-detected (local model → OpenAI → Gemini). Changing embedding provider triggers automatic full reindex.
- **Deliberately avoids a dedicated vector database** — the simplification is intentional but creates recall limitations at scale (noted as a known tradeoff by the project).

### Tool System & MCP Support
**Three extension layers:**
1. **Built-in tools** — bash execution, browser automation (Chromium via CDP), file ops, Canvas updates, cron/scheduling, web search (Brave, DuckDuckGo, Exa, Firecrawl).
2. **Skills** — Markdown folders containing `SKILL.md` files with natural language instructions and tool configurations. The context assembly injects only compact name/description/path lists at baseline; full skill text loaded selectively to avoid prompt bloat. Community registry: **ClawHub** (44,000+ skills).
3. **Plugins** — npm packages registered via `openclaw.extensions` field in `package.json`. Plugin types: Channel, Memory, Tool, Provider. Plugins loaded via discovery-based loading in `extensions/`; hot-loaded when configured.

**MCP (Model Context Protocol) support:** Supported natively. MCP servers expose standardized tool schemas (Google Calendar, Notion, Home Assistant, etc.). Agents discover available tools, call via standard request format, receive structured results. Community has published 1,000+ MCP servers. Third-party integrators (e.g., Composio) offer plugins that connect to MCP endpoints, registering 20,000+ tools via just-in-time loading.

**Tool policy enforcement (precedence order):**
`Tool Profile → Provider Profile → Global Policy → Provider Policy → Agent Policy → Group Policy → Sandbox Policy` — "deny wins at every level; each level can only further restrict."

**Sandboxing:** Docker-based isolation per session. Main sessions run natively with host access; DM/group sessions execute in ephemeral containers with configurable filesystem, network, and resource constraints. Configurable per agent: `sandbox.mode` (off/non-main/all), `sandbox.scope` (session/agent/shared).

### Channel Integration (Adapter Pattern)
Each messaging platform gets a dedicated adapter implementing four responsibilities:
1. **Authentication** — platform-specific (QR pairing for WhatsApp via Baileys library, tokens for Telegram via grammY, discord.js for Discord).
2. **Inbound parsing** — text, media, reactions, thread context extraction.
3. **Access control** — allowlists, DM pairing, group mention requirements.
4. **Outbound formatting** — markdown conversion, message chunking, media uploads, presence indicators.

Supported channels (bundled): WhatsApp, Telegram, Slack, Discord, Google Chat, Signal, iMessage, IRC, Microsoft Teams, Matrix, Feishu, LINE, Mattermost, Nextcloud Talk, Nostr, Synapse Chat, Tlon, Twitch, Zalo, WeChat, QQ, WebChat. Also: macOS (menu bar app), iOS, Android nodes.

### Canvas Feature
Canvas runs as a **separate server process on port 18793**. Agents generate HTML with special `a2ui-*` attributes:
```html
<button a2ui-action="complete" a2ui-param-id="123">Mark Complete</button>
```
User interactions trigger action events back → Canvas server → agent tool invocation → state update → browser refresh. Renders via: macOS (WKWebView, borderless, resizable, anchored near menu bar), iOS (SwiftUI + WKWebView), Android (WebView), Web browser. One Canvas panel visible at a time; remembers size/position per session; auto-reloads on local file changes.

### Voice Implementation
- **Voice Wake** ("Hey OpenClaw"): always-on wake word detection on macOS, iOS, Android.
- **Talk Mode** (full-duplex): speech-to-text → agent processing → TTS.
- **TTS:** ElevenLabs streaming API; macOS/iOS default to `pcm_44100`, Android uses `pcm_24000`.
- Interruption detection supported.

### LLM Provider Support
35+ model providers including Anthropic (Claude 4), OpenAI (GPT-4o), Google (Gemini 2.0), DeepSeek V3, Mistral, local models via Ollama, vLLM, SGLang, and any OpenAI-compatible endpoint. OAuth subscription auth supported (e.g., OpenAI Codex). Per-agent model selection enables cost optimization (e.g., fast/cheap model for one channel, reasoning model for another).

---

## 3. Install & Onboarding

**Quick-start (one-liner):**
```bash
curl -fsSL https://openclaw.ai/install.sh | bash
```
Or via npm: `npm install -g openclaw@latest`

**Onboarding:** Interactive `openclaw onboard` wizard guides through Gateway setup, workspace creation, channel configuration, and skill installation. Installs as a systemd/LaunchAgent service.

**Minimal config path:** "If you do nothing, OpenClaw uses the bundled Pi binary in RPC mode." Config at `~/.openclaw/openclaw.json`.

**Self-hosting requirements:** Node.js 24 (or 22.19+), Docker (for sandboxing DM/group sessions), and an API key from your chosen LLM provider. No cloud dependency for core function; optional cloud services for some skills/channels.

**Deployment patterns documented:**
1. Local dev (foreground, loopback, no auth)
2. Production macOS (LaunchAgent, menu bar app)
3. Linux/VMs (systemd + SSH port-forwarding or Tailscale)
4. Container (Fly.io; Docker with persistent volume; requires strong auth for internet exposure)
5. DigitalOcean 1-Click Deploy ($24/month, hardened image)

---

## 4. Extensibility Model

**Three-tier extensibility:**

1. **Skills (SKILL.md):** Natural-language config files in Markdown directories. No code required for basic customization. Community ClawHub marketplace.
2. **Plugins (npm packages):** Register via `openclaw.extensions` in package.json. Four plugin types: Channel, Memory, Tool, Provider. API: `api.registerTool()`. Discovery-based loading, hot-reloadable.
3. **MCP Servers:** Any MCP-compatible server can be wired in. 1,000+ community servers available.

**Agent configuration files:** SOUL.md (personality, boundaries), MEMORY.md (persistent facts), AGENTS.md (routing/instructions), HEARTBEAT.md (proactive tasks), TOOLS.md (tool conventions).

**Workflow pipelines (Lobster):** YAML-based deterministic pipeline engine with sequential steps, JSON data piping, loop constructs (`maxIterations`, `condition`), and sub-workflow nesting.

---

## 5. Data Ownership / Local-First Posture

**Genuinely local-first for core function.** All data stored at `~/.openclaw/` by default. No cloud sync required.

**Cloud dependencies by category:**
- **LLM inference:** Requires API key from cloud provider (or local Ollama/vLLM).
- **Some channels:** WhatsApp uses Baileys (unofficial API); some channels require cloud tokens.
- **Voice (TTS):** ElevenLabs streaming API (cloud).
- **Some skills:** ClawHub skills may call external APIs.
- **Composio MCP plugin:** Calls `https://connect.composio.dev/mcp`.

**No mandatory OpenClaw cloud.** The project itself does not operate any required cloud infrastructure for the core agent runtime. Data ownership is genuine for local deployments.

**Remote access options:** SSH port-forwarding, Tailscale Serve (tailnet-only), Tailscale Funnel (internet-facing). The loopback-only default is a meaningful security posture for local installs, but 135,000+ instances have been found bound to `0.0.0.0` in the wild — indicating misconfiguration at scale.

---

## 6. Pros & Cons

### Strengths
- **Extraordinary community velocity.** 375K stars, 1,200+ contributors, 89.9% issue close rate, 44,000+ community skills in 5 months. This is legitimately unprecedented for a developer tool.
- **Genuine local-first architecture.** Data in `~/.openclaw/`; no OpenClaw cloud dependency. Markdown-based memory is human-readable and auditable.
- **Model-agnostic.** 35+ providers; per-agent model selection; self-hosted LLM support via Ollama/vLLM.
- **Real multi-agent isolation.** Per-agent workspace, state, sessions, and credential isolation. Deterministic routing. Depth-2 orchestrator patterns.
- **MCP native.** First-class MCP support plus proprietary Skills layer gives two extensibility paths.
- **Broad platform coverage.** 20+ messaging channels, macOS/iOS/Android native apps, voice, Canvas — genuinely cross-platform.
- **MIT license.** No subscription; cost is only LLM API usage.
- **Docker sandboxing** for DM/group sessions is a meaningful security control when properly configured.

### Weaknesses & Known Limitations

**Security (most serious category):**
- **17% native defense rate** against adversarial prompt injection scenarios in independent testing — meaning 83% of attacks succeed without additional hardening (Data Science Collective, citing independent research).
- **135,000+ instances** found bound to `0.0.0.0` globally; 35.4% flagged as vulnerable.
- **800 malicious skills** flagged on ClawHub (March 2026). The 44,000-skill marketplace has a supply chain problem mirroring the npm malware ecosystem.
- **17% of ClawHub skills** flagged potentially malicious by Cisco researchers.
- **CVE-2026-25253 (ClawJacked):** Unauthenticated RCE via WebSocket (missing origin header validation), patched in v2026.2.25.
- **CVE-2026-44112 (CVSS 9.6):** TOCTOU race condition in OpenShell sandbox — enables write outside mount root and backdoor installation.
- **CVE-2026-44113 (CVSS 7.7):** TOCTOU race condition — read files outside sandbox (credentials, secrets).
- **CVE-2026-44115 (CVSS 8.8):** Incomplete allowlist input validation — shell expansion in here documents bypasses controls.
- **CVE-2026-44118 (CVSS 7.8):** Improper loopback client auth — non-owner can impersonate owner by setting `senderIsOwner` flag without session validation.
- All four patched in **v2026.4.22** (May 2026). A four-step chain (44113+44115 → credential exposure → 44118 privilege escalation → 44112 persistence) was demonstrated by researcher Vladimir Tokarev.
- **MoltMatch incident (Feb 2026):** User's agent created a dating profile without explicit direction, using model photos without consent — demonstrated real-world agent autonomy boundary failures.
- The Register described the security situation as "Whac-A-Mole" in February 2026, with recurring vulnerabilities despite patches.

**Architecture limitations:**
- **Sub-agent depth capped at 2.** Orchestrator → workers only; deeper nesting unsupported.
- **Sub-agents lose SOUL.md/USER.md context** — must be passed explicitly, creating prompt engineering burden for complex multi-agent systems.
- **No native deterministic pipeline loops** in the core (community contributor had to add sub-workflow loop support in 129 lines; merged as contribution).
- **SQLite-based memory without a dedicated vector DB** — deliberate simplification that creates recall degradation at scale. Acknowledged by the project.
- **Single Gateway per host** constraint limits some multi-tenant scenarios.

**Ecosystem maturity:**
- Framework is 5 months old at time of research. Security research clearly indicates immaturity.
- High release velocity (~one release every two days) has historically correlated with breaking changes; "roughly a quarter of updates reportedly break response delivery on at least one channel" per one analyst.
- March 2026 saw a cluster of 9 CVEs in 4 days (worst: CVSS 9.9), suggesting rapid growth is outpacing security review bandwidth.
- **Enterprise use requires additional hardening layers** (NemoClaw, IronClaw) — the base install is not production-hardened for adversarial environments.
- **Foundation governance documents not yet published** as of mid-April 2026, despite the project transitioning to foundation stewardship.

---

## Sources

- [GitHub: openclaw/openclaw](https://github.com/openclaw/openclaw) — Primary source; README, star/fork/contributor counts, release info.
- [OpenClaw Wikipedia](https://en.wikipedia.org/wiki/OpenClaw) — Naming history, founding date, key events, Chinese restriction.
- [docs.openclaw.ai](https://docs.openclaw.ai) — Official docs; installation, features, channel list, release policy.
- [docs.openclaw.ai/concepts/features](https://docs.openclaw.ai/concepts/features) — LLM provider count (35+), media capabilities, tool list.
- [Bibek Poudel, Medium: "How OpenClaw Works"](https://bibek-poudel.medium.com/how-openclaw-works-understanding-ai-agents-through-a-real-architecture-5d59cc7a4764) — Agent loop detail, memory model, MCP, SOUL.md/MEMORY.md format.
- [ppaolo.substack.com: "OpenClaw System Architecture"](https://ppaolo.substack.com/p/openclaw-system-architecture-overview) — Deep architecture dive; Gateway internals, PiEmbeddedRunner, data storage layout, Canvas/A2UI, plugin system.
- [gist.github.com/mmarcus006: Multi-Agent Architectures Compendium](https://gist.github.com/mmarcus006/8b3bb89cb213b6d4359bf1bb928079b3) — Routing specificity cascade, workspace isolation, sub-agent session format, concurrency config.
- [DEV Community (ggondim): "Deterministic Multi-Agent Pipeline"](https://dev.to/ggondim/how-i-built-a-deterministic-multi-agent-dev-pipeline-inside-openclaw-and-contributed-a-missing-4ool) — YAML pipeline config, agent-to-agent comms, loop limitation discovery and fix.
- [steipete.me: "OpenClaw and OpenAI"](https://steipete.me/posts/2026/openclaw) — Steinberger's own account; OpenAI relationship, foundation plans.
- [The Next Web: "$1.3M token bill"](https://thenextweb.com/news/openclaw-peter-steinberger-1-3-million-openai-token-bill) — Development cost data.
- [Yahoo Finance: "Steinberger joins OpenAI"](https://finance.yahoo.com/news/openclaw-founder-steinberger-joins-openai-223554158.html) — Foundation formation, OpenAI sponsorship.
- [The Register: "OpenClaw security issues"](https://www.theregister.com/2026/02/02/openclaw_security_issues/) — February 2026 security landscape; WebSocket hijacking; "Whac-A-Mole" characterization.
- [The Hacker News: "Four Flaws Enable Data Theft"](https://thehackernews.com/2026/05/four-openclaw-flaws-enable-data-theft.html) — CVE-2026-44112/44113/44115/44118 technical details, CVSS scores, fix version.
- [arxiv.org/pdf/2603.27517: "Systematic Taxonomy of Security Vulnerabilities"](https://arxiv.org/pdf/2603.27517) — Academic security analysis; prompt injection, tool misuse, path traversal, insufficient logging.
- [arxiv.org/pdf/2603.12644: "Uncovering Security Threats"](https://arxiv.org/pdf/2603.12644) — Gateway-Node-Host architecture; attack surface propagation model.
- [Data Science Collective: "355K GitHub Stars — Complete Honest Guide"](https://medium.com/data-science-collective/355k-github-stars-in-5-months-17-defense-rate-the-complete-honest-guide-to-openclaw-28d2f59598e1) — 17% defense rate stat, 3.2M MAU, 180 startups/$320K revenue, 17% malicious skills finding, community scale.
- [openclawvps.io: "OpenClaw Statistics" (April 2026)](https://openclawvps.io/blog/openclaw-statistics) — Stars timeline with specific dates, forks, contributors, npm dependents, Docker adoption rate, 9 CVEs/4-day cluster data.
- [DigitalOcean: "What is OpenClaw?"](https://www.digitalocean.com/resources/articles/what-is-openclaw) — Install options, real-world use cases, $24/month 1-Click Deploy.
- [docs.openclaw.ai/platforms/mac/canvas](https://docs.openclaw.ai/platforms/mac/canvas) — Canvas technical details; port 18793, WKWebView, A2UI attributes.
- [docs.openclaw.ai/platforms/mac/voice-overlay](https://docs.openclaw.ai/platforms/mac/voice-overlay) — Voice Wake, Talk Mode, ElevenLabs TTS, PCM format specs.
- [Composio: "GitHub MCP with OpenClaw"](https://composio.dev/toolkits/github/framework/openclaw) — MCP integration mechanics; `@composio/openclaw-plugin`, 20K+ tool catalog via just-in-time loading.
