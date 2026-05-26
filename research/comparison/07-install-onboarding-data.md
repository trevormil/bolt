---
title: "Install, Onboarding & Data Ownership"
dimension: install-onboarding-data
date: 2026-05-26
status: comparison
note: >
  Point-in-time research (May 26, 2026). Product docs and community sources
  are cited inline; version-specific details may drift. No product decision
  is expressed or implied by this document.
---

# Install, Onboarding & Data Ownership

## At a glance

| | **OpenClaw** | **Hermes** | **Vellum** |
|---|---|---|---|
| **Install command** | `curl -fsSL https://openclaw.ai/install.sh \| bash` (or `npm i -g openclaw@latest`) | `curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh \| bash` (or `pip install hermes-agent`) | `bun install -g vellum && vellum hatch` (open-source) / macOS `.dmg` (managed) |
| **Prereqs auto-installed** | Node.js via installer script; Docker optional (sandboxing only) | Python 3.11, Node.js, ripgrep, ffmpeg, uv -- all via installer; only Git required manually | Bun (only hard prereq for open-source path); `.dmg` path needs nothing |
| **Time-to-install** | ~2 min (script); total to functional agent ~5 min on M1 Mac | 2--3 min (script); first conversation in under 10 min | Cloud: ~30 sec after account creation; local open-source: unspecified (source build) |
| **Onboarding** | `openclaw onboard` interactive wizard (7 stages); macOS has a visual first-run wizard | 4-step sequence: `hermes model` → `hermes tools` → `hermes gateway setup` → first chat; quick path: `hermes setup --portal` | Conversational init: no wizard; assistant writes its own SOUL.md during first conversation |
| **Time-to-first-useful-interaction** | ~5 min (QuickStart); 10--30 min (fresh machine with no prereqs) | Under 10 min (API key ready); ~15 min from scratch | Cloud: minutes; local: depends on setup path and LLM config |
| **Deployment modes** | Local dev, production daemon (systemd/LaunchAgent), Docker, Fly.io, DigitalOcean 1-click ($12--24/mo) | Local dev, production daemon (systemd/LaunchAgent), Docker, SSH, Modal, Daytona, Vercel Sandbox, Singularity/HPC | Local (macOS native; Docker/Apple Container coming), Vellum Cloud (managed), self-hosted GCP/AWS |
| **Data location** | `~/.openclaw/` (JSON5 config, SQLite memory, Markdown workspace files, 0600 credentials) | `~/.hermes/` (YAML config, SQLite FTS5, Markdown memory files, skills, logs, caches) | `~/.vellum/workspace/` (Markdown + JSON config + SQLite + Qdrant vector DB) or Vellum Cloud encrypted account |
| **Cloud deps in local mode** | LLM inference API (or local Ollama/vLLM); ElevenLabs TTS (voice); some channel APIs; ClawHub sync (opt-out via `CLAWHUB_DISABLE_TELEMETRY=1`) | LLM inference API (or local Ollama/LM Studio/llama.cpp); Nous Portal opt-in per tool; no built-in telemetry | LLM inference API (Anthropic default, or Ollama); usage analytics opt-out available; credentials never sent to Vellum |
| **Self-hostable** | Yes -- fully; no OpenClaw cloud required for core runtime | Yes -- fully; MIT; no Nous cloud required | Yes -- open-source runtime; local mode or own GCP/AWS; managed tier also available |
| **Telemetry / call-home** | ClawHub sync sends hashed skill install metadata by default; `CLAWHUB_DISABLE_TELEMETRY=1` disables; no core runtime telemetry | No telemetry documented; FAQ explicitly states no tracking or analytics | Usage analytics opt-out available in local mode; feedback logs sent only on explicit Share Feedback action |

---

## OpenClaw

### Install method

OpenClaw offers three install paths. The recommended one-liner:

```bash
curl -fsSL https://openclaw.ai/install.sh | bash
```

Windows users get an equivalent PowerShell variant. npm, pnpm, and bun global installs are also supported -- each append `openclaw onboard --install-daemon` as the next step. Source builds require pnpm (the only case where a non-auto-installed tool is needed). The installer handles Node.js automatically; Docker is only pulled in when sandboxing for DM/group sessions is enabled, and it remains optional.

### Onboarding wizard

`openclaw onboard` walks through seven stages:

1. **Model/Auth** -- provider selection, API key or OAuth flow
2. **Workspace** -- confirms or sets `~/.openclaw/workspace/` (default)
3. **Gateway** -- port (default 18789), bind address (loopback by default), auth token generation, optional Tailscale exposure
4. **Channels** -- pick from the built-in adapters (Telegram, WhatsApp, Discord, Slack, Signal, iMessage, Teams, etc.)
5. **Daemon** -- installs as systemd user service (Linux), LaunchAgent (macOS), or Windows Scheduled Task
6. **Health check** -- verifies Gateway startup
7. **Skills** -- installs recommended skills and optional dependencies

A `--non-interactive` flag exists for scripted/CI use. On macOS, a native app offers a visual wizard covering the same stages. A QuickStart mode with curated defaults reduces decision load significantly.

### Time estimates

Community benchmarks on M1 MacBook Air (8 GB RAM): from `curl` invocation to first agent response takes approximately 4 minutes 37 seconds on the QuickStart path. Total with channel and skill setup: 5--10 minutes with prerequisites already satisfied. Starting from a completely bare machine (no Node.js, no API key): budget 25--30 minutes. Channel-specific overhead: Telegram is fastest; iMessage (macOS) is most involved.

### Deployment modes

Five documented patterns:

1. **Local dev** -- foreground process, loopback only, no auth (useful for development)
2. **Production macOS** -- LaunchAgent + menu bar app; auto-restart on crash
3. **Linux/VM** -- systemd user service; SSH port-forwarding or Tailscale for remote access
4. **Container** -- Docker with persistent volume mount; Fly.io and other platforms supported; hardened auth required for internet exposure
5. **DigitalOcean 1-Click** -- pre-hardened image, starting at $12/month (updated from the earlier-cited $24; current listing at the time of this research); runs as non-root `openclaw` user; state lives under `/home/openclaw/.openclaw/`; includes `/opt/update-openclaw.sh` maintenance script

### Data location and ownership

All persistent state lives in `~/.openclaw/` (or `/home/openclaw/.openclaw/` in DigitalOcean deployments):

- `openclaw.json` -- JSON5 config with all provider/channel settings
- `sessions/` -- append-only event logs with branching support
- `memory/<agentId>.sqlite` -- SQLite with `sqlite-vec` embeddings
- `workspace/` -- Markdown files (MEMORY.md, SOUL.md, HEARTBEAT.md, daily logs)
- `credentials/` -- permissions 0600, auto-excluded from VCS
- `agents/<agentId>/` -- per-agent state isolation

The configuration file is documented as "only readable by your user account (assuming default permissions)" and users are explicitly warned not to commit it to version control. The architecture deliberately avoids any OpenClaw-operated cloud for core runtime function. There are no central servers.

### Cloud dependencies in local mode

- **LLM inference** -- cloud provider (Anthropic, OpenAI, Google, etc.) or local Ollama/vLLM/SGLang
- **Voice (TTS)** -- ElevenLabs streaming API; not replaceable without a code change or plugin
- **Channel adapters** -- WhatsApp via Baileys (unofficial API), others via official tokens
- **ClawHub marketplace sync** -- transmits hashed skill install metadata during `clawhub sync` by default; fully disabled via `CLAWHUB_DISABLE_TELEMETRY=1`
- **Composio MCP plugin** -- routes through `https://connect.composio.dev/mcp` when used

No OpenClaw-operated analytics or telemetry is sent from the core runtime. ClawHub is the only component with default outbound data, and that data is anonymized (SHA-256 hashed paths only -- no file contents, no prompts, no usage logs).

### SOUL.md and personality setup

The agent's personality lives in `SOUL.md` inside the workspace directory. Users write it directly (freeform Markdown), or start from community templates on ClawHub. HEARTBEAT.md defines proactive task checklists. Sub-agents do not inherit SOUL.md -- it must be passed explicitly, which is a documented workflow burden for complex multi-agent setups.

---

## Hermes

### Install method

Primary one-liner (Linux/macOS/WSL2/Termux):

```bash
curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | bash
```

Windows PowerShell (early beta as of v0.14.0):

```powershell
iex (irm https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.ps1)
```

As of v0.14.0, `pip install hermes-agent` is also available via PyPI, making Hermes consumable as a standard Python package.

Git is the only hard prerequisite. The installer provisions everything else automatically: `uv` (Python package manager), Python 3.11 virtual environment, Node.js v22, ripgrep, ffmpeg, the global `hermes` command, and the full `~/.hermes/` directory tree. Windows adds a bundled portable MinGit (~45 MB) so even Git is not required on that platform.

The installer creates this directory structure automatically:

```
~/.hermes/
├── config.yaml
├── .env               # API keys and secrets
├── auth.json          # OAuth credentials
├── SOUL.md            # Agent identity
├── memories/
├── skills/
├── sessions/
├── logs/              # Secrets auto-redacted
├── cron/
├── pairing/
├── hooks/
├── image_cache/
├── audio_cache/
└── whatsapp/session/
```

### Onboarding sequence

Post-install, Hermes uses a 4-step sequence rather than a guided wizard:

1. `hermes model` -- interactive provider and model selection
2. `hermes tools` -- enable/disable toolset groups via curses UI
3. `hermes gateway setup` -- configure messaging platform adapters
4. First chat -- `hermes` or `hermes --tui`

A unified quick path exists for Nous Portal users: `hermes setup --portal` handles model and tool configuration in one flow.

`hermes doctor` is documented as the first diagnostic step in any troubleshooting path -- a recovery toolkit (`doctor → model → setup → sessions → continue → gateway status`) restores known good state.

Community assessment from hermesatlas.com describes Hermes setup as "more tedious than OpenClaw" -- the additional config.yaml surface area and the separation of model, tools, and gateway into distinct commands contributes to this perception.

### Time estimates

The automated installer completes in 2--3 minutes end-to-end. Most users reach a first working conversation in under 10 minutes on a VPS with an API key ready. Third-party guides suggest budgeting about 15 minutes from scratch (install + config + first run). v0.14.0 reduced cold-start by approximately 19 seconds vs. the prior version (absolute baseline not published).

### Deployment modes

Seven execution backends are supported:

1. **Local** -- runs directly on host machine (default)
2. **Docker** -- container with `--cap-drop ALL`, selective capability restore, read-only root filesystem, filesystem checkpoints and rollback
3. **SSH** -- remote server execution, files sync back to `~/.hermes/cache/remote-syncs/` on teardown
4. **Singularity/Apptainer** -- HPC cluster support
5. **Modal** -- serverless with hibernation; state persists via `container_persistent: true`
6. **Daytona** -- serverless with filesystem snapshots
7. **Vercel Sandbox** -- ephemeral cloud compute

Production daemon patterns follow the same LaunchAgent/systemd conventions as OpenClaw. Gateway mode activates multi-platform messaging (22 adapters as of v0.14.0).

### Data location and ownership

All data in `~/.hermes/` (or `$HERMES_HOME` for profile isolation; root-mode uses `/root/.hermes/`). Storage formats:

- `config.yaml` -- human-readable YAML configuration
- `memories/` -- Markdown files with bounded character limits (MEMORY.md: 2,200 chars; USER.md: 1,375 chars)
- `sessions/` -- gateway session state
- Skills are stored as Markdown files; auto-archived to `~/.hermes/skills/.archive/` when stale
- SQLite with FTS5 for full-text search (session and memory indexing)

The bounded memory format is a deliberate architectural choice: forces curation rather than unbounded growth, keeps the memory store small and auditable, but loses long-tail detail.

### Cloud dependencies in local mode

- **LLM inference** -- cloud provider API or local Ollama/LM Studio/llama.cpp
- **Nous Portal** -- strictly opt-in per-tool via `use_gateway` config field; free tier provides $0.10 credit; paid tiers add bundled web search, image gen, TTS, cloud browser
- **No telemetry** -- FAQ explicitly states no analytics, no tracking, no call-home behavior; API calls go only to the configured LLM provider

The local-model path (Ollama, LM Studio, llama.cpp) allows complete air-gapped operation for users who need it. NVIDIA RTX PRO and DGX Spark are documented as local inference hardware targets.

### SOUL.md and personality setup

SOUL.md is a freeform Markdown file in `~/.hermes/` defining the agent's personality and behavioral rules. Unlike Vellum's approach, the user writes SOUL.md manually rather than having the assistant generate it. Skills are SKILL.md documents; the agent autonomously creates and refines them after complex tasks, and the `hermes-agent-self-evolution` companion (DSPy + GEPA) adds a post-task evolutionary optimization layer.

---

## Vellum

### Install method

Vellum offers two distinct paths that target different user types:

**Managed path (simplest):**

```bash
# Download the .dmg from vellum.ai/download
# Standard macOS drag-to-Applications install
# Sign in to Vellum Cloud
```

Documentation characterizes this as: "No terminal commands, no package managers, no YAML files. Standard `.dmg`, signed and notarized." Web app setup takes approximately 30 seconds after account creation.

**Open-source / local path:**

```bash
bun install -g vellum
vellum hatch
```

Or from source:

```bash
git clone https://github.com/vellum-ai/vellum-assistant.git
cd vellum-assistant
./setup.sh
source ~/.bashrc
vellum hatch
```

Bun is the only hard prerequisite for the package-manager path. The `vellum hatch` command provisions and initializes a new assistant instance. A `--remote` flag supports GCP, AWS, or custom host deployment.

Vellum's documentation acknowledges the spectrum: "About 5 minutes and a willingness to talk to your computer" for the managed web path; local setup time is unspecified but involves more infrastructure decisions.

### Onboarding: the "no wizard" model

Vellum's onboarding philosophy is the sharpest departure from its competitors: there is no step-by-step wizard. The official quick-start documentation states explicitly: "No 47-step setup wizard. Instead, the fastest way to meet your assistant involves no install, no setup wizard, no config files."

What happens instead:

1. Assistant launches with an empty but structurally complete `~/.vellum/workspace/`
2. During the first conversation, a temporary `BOOTSTRAP.md` script guides the assistant through discovering its name, personality, and the user's context
3. The assistant writes its own `SOUL.md` (behavioral principles), `IDENTITY.md` (name, emoji), and `USER.md` (what it knows about you) from conversation signals
4. Once initialization is complete, `BOOTSTRAP.md` is deleted automatically

Subsequent channel connections ("a few minutes per channel") are handled via the approval-gated trust model -- the assistant identifies missing integrations and guides the user through setup organically, rather than front-loading the configuration.

### Deployment modes

Vellum documents four deployment postures:

| Mode | Infrastructure | Availability | Privacy |
|---|---|---|---|
| **Web app** | Vellum Cloud | Always on | Data on Vellum infrastructure |
| **Desktop (cloud backend)** | Local app + Vellum Cloud | Always on | Data on Vellum infrastructure |
| **Local native** | Mac process | Mac-awake only | Data never leaves machine |
| **Self-hosted (GCP/AWS)** | User-owned cloud infra | Always on | Full data sovereignty |

Docker and Apple Container local modes are listed as "coming soon" as of v0.8.4. Local native mode is described as the simplest local setup; it gives the assistant direct filesystem and tool access. The core tradeoff is explicit in documentation: "The assistant is only available when your computer is awake" in local mode vs. the always-on cloud option.

### Data location and ownership

`~/.vellum/workspace/` contains all persistent state in local mode:

```
~/.vellum/
├── workspace/
│   ├── IDENTITY.md         # Name, personality, emoji (plaintext)
│   ├── SOUL.md             # Behavioral constitution (plaintext)
│   ├── USER.md             # What the assistant knows about you (plaintext)
│   ├── NOW.md              # Current focus and goals (plaintext)
│   ├── config.json         # Runtime configuration
│   ├── conversations/
│   ├── skills/
│   ├── pkb/                # Personal knowledge base (Markdown files)
│   ├── scratch/
│   └── data/
│       ├── db/             # SQLite (conversation history, tool invocations)
│       ├── qdrant/         # Vector DB (memory embeddings)
│       ├── apps/
│       ├── avatar/
│       ├── browser-profile/
│       ├── sounds/
│       └── logs/
└── protected/              # Credentials vault (excluded from exports)
```

Core Markdown files (IDENTITY, SOUL, USER, NOW) are plaintext and human-readable. The SQLite database and Qdrant vector store are local binary formats. The `pkb/` knowledge base is Markdown. The `protected/` vault isolates credentials -- they are never passed to the LLM model.

In cloud mode, data lives in "a private, encrypted Vellum Cloud account...isolated in a dedicated, encrypted container." The documentation acknowledges the tradeoff directly: "If keeping your data off third-party infrastructure is a priority, consider Local instead."

### Cloud dependencies in local mode

- **LLM inference** -- Anthropic (Claude, default), OpenAI, Google Gemini, or local Ollama; ONNX embeddings run locally by default, avoiding a cloud roundtrip for semantic retrieval
- **Channel APIs** -- Telegram, Slack, email/phone provider servers see message content when those channels are connected
- **Usage analytics** -- opt-out available; in local mode with opt-out, "workspace files, memories, conversation history, credentials, and trust rules are never sent to Vellum"
- **Share Feedback** -- explicit user-initiated action; sends logs only on request

The presence of a default opt-in for usage analytics (even in local mode) is a meaningful distinction from OpenClaw and Hermes, which do not document analytics collection at all. The opt-out path is available and documented, but users must take an affirmative step.

---

## The "under a minute" bar

The PRD specifies install in under a minute as a hard benchmark. Here is each product measured against that bar:

**OpenClaw -- does not meet the bar for a clean install; meets it if Node.js is already present.**

The `curl | bash` one-liner itself completes quickly, but it must download and install Node.js on a bare machine, which pushes the wall-clock time well past 60 seconds. Community measurement puts time-to-first-agent-response at 4 minutes 37 seconds on M1 hardware under ideal conditions. If the user already has Node.js 22+ installed (common for developers), the binary install via npm takes under 60 seconds; `openclaw onboard` then begins immediately but itself requires several interactive decisions. The QuickStart path meets a "5 minutes" bar, not a "1 minute" bar.

**Hermes -- does not meet the bar for a clean install; closer than OpenClaw for the raw binary step.**

The installer downloads and provisions Python 3.11, uv, Node.js, ripgrep, and ffmpeg -- a substantial dependency tree. Community benchmarks put the installer at 2--3 minutes end-to-end. A first working conversation adds another few minutes. Total from zero: 5--15 minutes depending on machine and network. As with OpenClaw, a user with these prerequisites already installed could get a binary in under a minute, but the "clean machine" case does not meet the bar.

**Vellum (managed) -- meets the bar for the cloud path only.**

The web app setup is documented at "about 30 seconds" after account creation. The `.dmg` managed desktop app installs in the typical macOS drag-to-Applications timeframe -- also likely under 60 seconds for the install step, with the initial assistant provisioning adding a few minutes. However, the managed cloud path involves a Vellum account, which is a prerequisite with its own friction. The open-source local path (source clone + `vellum hatch`) does not publish a time estimate and involves more steps.

**Summary against the benchmark:**

| Product | Sub-60-sec install? | Caveat |
|---|---|---|
| OpenClaw | Only if Node.js 22+ already present | Prereq download breaks the bar on a bare machine |
| Hermes | No | Dependency download (Python, Node, ripgrep, ffmpeg) takes 2--3 min minimum |
| Vellum cloud | Yes (web app ~30 sec) | Requires Vellum account; managed cloud, not self-hosted |
| Vellum local | Not documented | Open-source path timing unspecified; likely similar to competitors |

No product reliably hits sub-60-second install on a bare machine for a self-hosted path. The closest is Vellum's managed cloud web path, which is not self-hosted.

---

## Head-to-head

### Easiest to set up

**Vellum (managed cloud) is objectively the lowest friction path to a first interaction**, requiring only an account signup and browser or `.dmg` install. However, it trades friction for data control -- the assistant lives in Vellum's cloud by default.

Among fully self-hosted paths, **OpenClaw is marginally easier to set up** than Hermes. The `openclaw onboard` wizard is more guided than Hermes's 4-command sequence, and community assessment corroborates this. OpenClaw's Node.js-only dependency tree is also simpler than Hermes's Python + Node + system tools stack.

Vellum's local path occupies an interesting middle ground: once installed, the conversational onboarding (no wizard) is arguably the lowest-friction first-interaction experience of the three, but the install step itself is the least documented.

### Most genuinely local / user-owned

All three claim local-first posture. The meaningful distinctions:

- **OpenClaw** has no core runtime cloud dependency and no telemetry. ClawHub marketplace sync sends anonymized data by default but is fully disableable. The loopback-only default is a genuine security posture. Data is human-readable Markdown + SQLite in `~/.openclaw/`. Credentials at 0600. The weakest point: ElevenLabs TTS is hardwired for voice; local voice requires a code change or plugin.

- **Hermes** has no telemetry at all, documented explicitly in the FAQ. The Nous Portal is strictly opt-in per tool. The `~/.hermes/` store is human-readable (Markdown memory, YAML config). Full air-gapped operation is possible with local models. The bounded memory format (2,200/1,375 character limits) means the local store is intentionally small and auditable.

- **Vellum** has usage analytics enabled by default in local mode, with an opt-out. This is the only product of the three with documented default data egress from local mode beyond LLM inference API calls. With opt-out applied, local mode is strongly private. The vector store (Qdrant) and SQLite database are local binary formats; Markdown files are human-readable. Credentials are isolated in `protected/` and never sent to the model.

**Hermes edges out for local purity** -- no telemetry at any level, explicit FAQ confirmation, and the full air-gapped path is well-documented. OpenClaw is a close second (ClawHub telemetry is the only default egress). Vellum requires an affirmative opt-out step to reach comparable data isolation.

### Tradeoffs

| Tradeoff | OpenClaw | Hermes | Vellum |
|---|---|---|---|
| Ease vs. control | Easier wizard, more cloud deps | More steps, cleaner local | Cloud-first default, optional local |
| Time-to-first-chat | ~5 min (QuickStart) | ~10 min | ~30 sec (cloud); unspecified (local) |
| Availability | Mac-awake only (local) | Mac-awake only (local) | Always-on (cloud); Mac-awake (local) |
| Config expressiveness | JSON5 + Markdown workspace | YAML + Markdown workspace | JSON + Markdown workspace |
| SOUL.md authoring | Manual / community templates | Manual | Auto-generated from first conversation |
| Deployment options breadth | Widest (5+ patterns) | Widest (7 backends) | Growing (2 stable; Docker/Apple Container coming) |
| Privacy default | Good (no telemetry; ClawHub opt-out) | Best (no telemetry, explicit) | Requires opt-out step in local mode |

---

## Design considerations for a from-scratch build

These are observations about the landscape derived from this dimension's research. They are factual characterizations, not recommendations.

**The sub-60-second bar is structurally hard to hit for self-hosted paths.** All three incumbents require either a multi-tool dependency download (Python + Node + system libraries for Hermes; Node for OpenClaw) or an account-gated managed service (Vellum cloud) to approach 60-second install. A self-hosted assistant that eliminates the dependency download step -- perhaps by shipping a single statically-linked binary or a pre-built container -- would be the first to genuinely meet this bar on a bare machine.

**Wizard vs. no-wizard is a real UX split.** OpenClaw and Hermes both use sequential configuration wizards. Vellum's "conversational boot" -- where the assistant writes its own personality files through dialogue -- is architecturally the most novel approach and matches the product's "no 47-step wizard" positioning. However, it requires the assistant to already be somewhat functional before onboarding begins, which creates a dependency on having a working LLM connection first.

**The always-on vs. data-owned tradeoff is unresolved in the open-source space.** All three self-hosted deployments tie availability to machine uptime. Solving always-on without requiring a managed cloud (e.g., via a small VPS with a simple one-liner deploy, or a phone-based daemon) is a gap none of the three has cleanly addressed for the non-technical user segment.

**Default privacy posture differs meaningfully.** A new builder can choose to match Hermes (no telemetry, explicit FAQ confirmation, bounded local store) or Vellum (opt-out analytics, cloud-optional) or OpenClaw (marketplace sync opt-out, no core telemetry) as their baseline. The choice signals values to users who care about this dimension before they read any documentation.

**The `~/.product-name/` convention is universal.** All three use a hidden home-directory folder as the data store root. The internal structure (Markdown workspace files + SQLite + optional vector DB) is also nearly identical. This convergence suggests the community has settled on a functional baseline; differentiation is not available here.

**SOUL.md authoring is a real UX friction point.** OpenClaw and Hermes both require users to write SOUL.md manually. Vellum's approach -- letting the assistant draft its own personality from a first conversation -- observably reduces the cold-start friction for users who are not comfortable editing config files. Any from-scratch build faces the same choice.

---

## Sources

### New (from fresh research for this document)

- [OpenClaw Install Docs -- docs.openclaw.ai/install](https://docs.openclaw.ai/install) — Install commands, prerequisites, Node.js version, package manager options (NEW)
- [OpenClaw Onboard Wizard -- docs.openclaw.ai/start/wizard](https://docs.openclaw.ai/start/wizard) — 7-stage wizard steps, QuickStart vs manual modes (NEW)
- [OpenClaw ClawHub Telemetry -- docs.openclaw.ai/clawhub/telemetry](https://docs.openclaw.ai/clawhub/telemetry) — What is collected, CLAWHUB_DISABLE_TELEMETRY, hashed metadata details (NEW)
- [OpenClaw DigitalOcean 1-Click -- docs.digitalocean.com/products/marketplace/catalog/openclaw](https://docs.digitalocean.com/products/marketplace/catalog/openclaw/) — $12/mo tier, non-root openclaw user, systemd setup (NEW)
- [Introducing OpenClaw on DigitalOcean -- digitalocean.com/blog/moltbot-on-digitalocean](https://www.digitalocean.com/blog/moltbot-on-digitalocean) — 1-Click hardened image, security defaults (NEW)
- [OpenClaw Setup Guide 2026 -- verdent.ai/guides/openclaw-setup-guide](https://www.verdent.ai/guides/openclaw-setup-guide-from-zero-to-ai-assistant) — Time breakdown by phase, API key prerequisites (NEW)
- [OpenClaw Onboarding Quickstart vs Manual -- advenboost.com/openclaw-onboarding-quickstart](https://advenboost.com/openclaw-onboarding-quickstart/) — 4 min 37 sec benchmark, M1 Mac timing (NEW)
- [OpenClaw Privacy Guide -- atomicmail.io/blog/using-openclaw-ai-safely](https://atomicmail.io/blog/using-openclaw-ai-safely-full-privacy-security-guide) — No core runtime telemetry claim, DISABLE_TELEMETRY env var (NEW)
- [Hermes Agent Installation -- hermes-agent.nousresearch.com/docs/getting-started/installation](https://hermes-agent.nousresearch.com/docs/getting-started/installation) — Curl command, Windows PowerShell variant, auto-installed prereqs (NEW)
- [Hermes Agent Quickstart -- hermes-agent.nousresearch.com/docs/getting-started/quickstart](https://hermes-agent.nousresearch.com/docs/getting-started/quickstart) — 6-step sequence, doctor command, 64K context minimum (NEW)
- [Hermes Agent Configuration -- hermes-agent.nousresearch.com/docs/user-guide/configuration](https://hermes-agent.nousresearch.com/docs/user-guide/configuration) — config.yaml structure, 7 execution backends, data storage paths (NEW)
- [Hermes Agent Install Guide 2026 -- hermesatlas.com/guide/install](https://hermesatlas.com/guide/install/) — 2--3 min installer, Git-only hard prereq, disk space requirements (NEW)
- [Hermes Agent FAQ -- hermes-agent.nousresearch.com/docs/reference/faq](https://hermes-agent.nousresearch.com/docs/reference/faq) — Explicit no-telemetry confirmation (NEW)
- [Vellum Installation Docs -- vellum.ai/docs/getting-started/installation](https://www.vellum.ai/docs/getting-started/installation) — No terminal required for .dmg path; ~30 sec web setup; macOS 15 requirement (NEW)
- [Vellum Local Hosting -- vellum.ai/docs/hosting-options/local-hosting](https://www.vellum.ai/docs/hosting-options/local-hosting) — Local native, Docker (coming), Apple Container (coming); Mac-awake-only availability (NEW)
- [Vellum Hosting Options -- vellum.ai/docs/hosting-options](https://www.vellum.ai/docs/hosting-options) — Managed vs local vs self-hosted GCP/AWS; always-on vs. privacy tradeoff (NEW)
- [Vellum Privacy & Data -- vellum.ai/docs/trust-security/privacy-and-data](https://www.vellum.ai/docs/trust-security/privacy-and-data) — Usage analytics opt-out; credentials never sent to model; Share Feedback only on request (NEW)
- [Vellum The Workspace -- vellum.ai/docs/key-concepts/the-workspace](https://www.vellum.ai/docs/key-concepts/the-workspace) — Full ~/.vellum/ directory tree, BOOTSTRAP.md onboarding and deletion, plaintext Markdown files (NEW)
- [Vellum Quick Start -- vellum.ai/docs/getting-started/quick-start](https://www.vellum.ai/docs/getting-started/quick-start) — "No 47-step setup wizard," conversational onboarding, approvals system, channel setup (NEW)

### From existing dossiers

- [GitHub: openclaw/openclaw](https://github.com/openclaw/openclaw) — Primary repo; storage layout, `~/.openclaw/` structure, credentials model
- [docs.openclaw.ai](https://docs.openclaw.ai) — Official docs; install, features, channel list, release policy
- [DigitalOcean: "What is OpenClaw?"](https://www.digitalocean.com/resources/articles/what-is-openclaw) — 1-Click deploy, $24/month reference (earlier pricing tier)
- [GitHub: NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent) — Primary repo; language breakdown, install method, `~/.hermes/` structure
- [Hermes Agent Docs](https://hermes-agent.nousresearch.com/docs/) — Memory system, tools, MCP, SOUL.md, security model
- [State of Hermes Agent -- hermesatlas.com](https://hermesatlas.com/reports/state-of-hermes-april-2026) — "More tedious than OpenClaw" community assessment
- [GitHub: vellum-ai/vellum-assistant README](https://github.com/vellum-ai/vellum-assistant/blob/main/README.md) — `vellum hatch`, deployment modes, Bun prereq, ONNX local embeddings
- [Introducing Vellum -- vellum.ai/blog/introducing-vellum](https://www.vellum.ai/blog/introducing-vellum) — Launch post; "Yours" design principle; data ownership framing
