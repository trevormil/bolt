---
title: "Extensibility & Tooling: OpenClaw vs Hermes vs Vellum"
dimension: extensibility-tooling
date: 2026-05-26
status: comparison
note: >
  Point-in-time research (late May 2026). Statistics and feature availability
  reflect sources available at time of writing; the space is moving weekly.
  No product decision has been made or implied by this document.
---

# Extensibility & Tooling

## At a glance

| Dimension | OpenClaw | Hermes | Vellum (vellum-assistant) |
|---|---|---|---|
| **Skill format** | SKILL.md (proprietary superset of agentskills.io) | SKILL.md (agentskills.io conformant) | SKILL.md + TOOLS.json (proprietary; MCP also supported) |
| **Plugin API** | npm packages; `openclaw.extensions` in package.json; typed plugin registry: Channel, Memory, Tool, Provider, CLI Backend, Workflow | Python packages; `plugin.yaml` + `__init__.py register(ctx)`; types: Tool, Platform, Memory, ContextEngine, ImageGen, VideoGen | Not publicly documented as a third-party plugin API at time of research |
| **MCP support** | Native; stdio + SSE + streamable-http; dual role (client + server); 1,000+ community servers | Since v0.6.0 (late March 2026); stdio + HTTP/OAuth 2.1; parallel tool calls as of v0.14.0; dual role (client + `hermes mcp serve`) | Mentioned explicitly as a supported extensibility path; sandbox uses native OS sandboxing; depth of MCP config not yet publicly detailed |
| **Marketplace** | ClawHub: 44,000+ skills (historically 1,184 confirmed malicious; VirusTotal partnership added Feb 2026) | agentskills.io Skills Hub: 652+ skills; HuggingFace tap (v0.14.0); hermeshub community browser | 28 bundled skills in 7 categories; no third-party marketplace at launch |
| **Built-in tools** | bash, browser (CDP), file ops, Canvas, cron, web search (Brave/DuckDuckGo/Exa/Firecrawl) | 70+ tools registered via `tools/registry.py`; toolsets bucketed by domain; LSP diagnostics (v0.14.0); `execute_code` pipeline tool | Core workspace tools (file_read, bash, etc.); host tools (host_bash, host_file_*) with trust-gated access; browser; 28 bundled skill packages |
| **Third-party code safety** | Docker sandbox per session (off for main, on for DM/group by default); skill security scan at ClawHub (VirusTotal + ClawScan + static); supply-chain attack history (ClawHavoc) | Seven documented security layers; sandbox backends: local/Docker/SSH/Singularity/Modal/Daytona/Vercel; skill sandbox risk noted but not individually sandboxed per skill | Native OS sandboxing: sandbox-exec (macOS SBPL) + bwrap (Linux); fail-closed trust engine; credentials in secrets vault, never passed to model |

---

## OpenClaw

### SKILL.md format

OpenClaw's SKILL.md is a proprietary superset of the agentskills.io open standard. The base agentskills.io spec (originated at Anthropic) requires only `name` and `description` frontmatter fields. OpenClaw adds an `metadata.openclaw` block (aliased `metadata.clawdbot`, `metadata.clawdis` for legacy compatibility) that gates skill loading and drives security analysis:

| Field | Type | Effect |
|---|---|---|
| `requires.env` | string[] | Mandatory env vars; blocks load if missing |
| `requires.bins` | string[] | All listed binaries must exist |
| `requires.anyBins` | string[] | At least one binary required |
| `requires.config` | string[] | openclaw.json key paths must be truthy |
| `primaryEnv` | string | Main credential var (surfaced in UI) |
| `envVars` | array | Detailed env var declarations (`name`, `required`, `description`) |
| `os` | string[] | Platform restrictions (`darwin`, `linux`, `win32`) |
| `always` | boolean | Auto-activates without model decision |
| `user-invocable` | boolean (default true) | Exposes as a slash command |
| `disable-model-invocation` | boolean (default false) | Keeps slash command but removes from agent context |
| `command-dispatch: "tool"` | string | Bypasses model, goes directly to tool |
| `homepage` | string | URL surfaced in macOS Skills UI |

**Token cost:** OpenClaw documents the overhead precisely: 195 characters for the first eligible skill, then approximately 97 characters per skill (plus name/description lengths). Roughly ~24 tokens per skill at OpenAI-style tokenization. Skills are snapshotted at session start; hot-reload triggers when the watcher detects changes or a new remote node appears.

**Discovery hierarchy (highest to lowest precedence):**
1. Workspace skills (per-agent `<workspace>/skills`)
2. Project agent skills
3. Personal agent skills (`~/.agents/skills`)
4. Managed/local skills (`~/.openclaw/skills`)
5. Bundled skills
6. Extra directories (configured)

Name conflicts resolve toward higher-precedence sources. Agent allowlists are explicit: a non-empty `agents.list[].skills` replaces defaults entirely; omitting the key inherits defaults; an empty array blocks all skills.

**ClawHub publishing constraints:** 50MB bundle limit, text-based files only (no binaries), all skills use MIT-0 license, paid service dependencies must be documented but are unsupported at payment level, PowerShell scripts accepted.

### Plugin API

Plugins are npm packages discovered via the `openclaw.extensions` field in `package.json`. The Plugin SDK uses a `register(api)` callback receiving an `OpenClawPluginApi` object. Key registration methods:

**Provider registration:**
- `api.registerProvider(...)` -- LLM text inference
- `api.registerEmbeddingProvider(...)` -- vector embeddings
- `api.registerSpeechProvider(...)` -- TTS/STT
- `api.registerImageGenerationProvider(...)`, `api.registerWebSearchProvider(...)`

**Tool and channel registration:**
- `api.registerTool(tool, opts?)` -- agent tools; declared in `contracts.tools` manifest
- `api.registerCommand(def)` -- commands bypassing LLM; supports `agentPromptGuidance` for routing hints
- `api.registerChannel(...)` -- full messaging-platform adapters
- `api.registerCliBackend(...)` -- local AI inference backends

**Infrastructure hooks:**
- `api.registerHook(events, handler, opts?)` -- lifecycle events
- `api.registerHttpRoute(params)` -- Gateway HTTP endpoints
- `api.registerService(service)` -- background services
- `api.registerCli(registrar, opts?)` -- CLI subcommands with lazy loading

**Plugin state:**
- `api.session.state.registerSessionExtension(...)` -- plugin-owned JSON-compatible session state
- `api.session.workflow.enqueueNextTurnInjection(...)` -- exactly-once context injection per turn
- `api.lifecycle.registerRuntimeLifecycle(...)` -- cleanup on reset/delete/reload
- `api.runContext.setRunContext / getRunContext` -- per-run scratch state

**Slot exclusion:** If multiple plugins declare `kind: "memory"`, only the one selected in `plugins.slots.<slot>` loads. Same pattern for context engines. Mutually exclusive slots prevent conflicting providers.

**Hot loading:** Plugins are hot-reloadable when configured. Bundled plugins use the same SDK surface but can declare `contracts.agentToolResultMiddleware` for targeted runtime injection not available to community plugins.

### MCP support

OpenClaw supports three transport types in `openclaw.json`:

```json
{
  "mcp": {
    "servers": {
      "server-name": {
        "command": "executable",
        "args": ["arg1"],
        "transport": "streamable-http",
        "url": "https://example.com/mcp",
        "headers": { "Authorization": "Bearer token" }
      }
    }
  }
}
```

- **stdio** -- spawns child process, communicates over stdin/stdout JSON-RPC 2.0. OpenClaw filters `NODE_OPTIONS`, `PYTHONPATH`, `RUBYOPT`, and similar interpreter startup variables to prevent injection attacks.
- **SSE** -- connects to remote HTTP Server-Sent Events endpoint.
- **streamable-http** -- bidirectional HTTP streaming for remote servers; canonical spelling in OpenClaw config.

**Dual-role MCP:** `openclaw mcp serve` starts OpenClaw itself as a stdio MCP server, exposing agent tools (`conversations_list`, `conversation_get`, `messages_read`, `attachments_fetch`, `events_poll`, `events_wait`, `messages_send`, `permissions_list_open`, `permissions_respond`) to other MCP clients (Claude Code, Cursor, external agents).

**Composio integration:** The `@composio/openclaw-plugin` connects to `https://connect.composio.dev/mcp` and registers 20,000+ tools via just-in-time loading, so the agent only receives tool schemas for what the current task actually needs rather than flooding context with the full catalog. This is a third-party workaround for the "context bloat at scale" problem inherent to large tool registries.

Community has published 1,000+ MCP servers for OpenClaw use.

### Marketplace and supply-chain risk

ClawHub grew from 5,700 skills at launch (January 2026) to 44,000+ by late May 2026 -- roughly an 8x increase in five months. This velocity created serious supply-chain pressure:

- **ClawHavoc campaign (February 2026):** Koi Security's Oren Yomtov audited 2,857 skills; 341 were malicious (11.9%), with 335 traced to a single coordinated campaign primarily delivering Atomic macOS Stealer (AMOS). Attackers subsequently pivoted to embedding malicious commands in skill-page *comments* rather than SKILL.md itself, bypassing initial SKILL.md-focused scanning.
- **Antiy Labs total count:** 1,184 malicious skills historically published across ClawHub's lifetime.
- **Cisco researchers (March 2026):** flagged ~17% of ClawHub skills as potentially malicious.
- **Response:** VirusTotal partnership announced February 7, 2026 -- daily rescanning via VirusTotal + ClawScan + static analysis. Skill pages now expose the latest scan state pre-install.

The VirusTotal integration is meaningful but the attack-and-patch dynamic has been recurring. The fact that malicious content shifted to skill-page comments after SKILL.md scanning was added demonstrates active adversary adaptation.

### Built-in tool catalog

Core built-ins: `bash` execution, browser automation (Chromium via Chrome DevTools Protocol), file operations, Canvas UI server (port 18793), cron/scheduling, web search (configurable providers: Brave, DuckDuckGo, Exa, Firecrawl).

The **Lobster** YAML pipeline engine enables deterministic sequential workflows with JSON data piping, loop constructs (`maxIterations`, `condition`), and sub-workflow nesting -- a layer above individual tool calls.

---

## Hermes

### SKILL.md format

Hermes uses the agentskills.io open standard without proprietary extensions at the frontmatter level. Skills are structured procedural documents capturing not just instructions but also pitfalls and verification steps -- a deliberate design choice to make skills useful for self-improvement, not just capability injection.

**Two surfaces:**
- `skills/` -- bundled, active by default
- `optional-skills/` -- require explicit `hermes skills install <name>`

**Auto-curation:** `curator.py` runs as a background process, tracks skill usage frequency, and auto-archives stale skills to `~/.hermes/skills/.archive/`. The agent autonomously creates new SKILL.md files after completing complex tasks and refines them during reuse. Skills are version-controlled; the `hermes-agent-self-evolution` companion (DSPy + GEPA) adds post-task evolutionary optimization with safety gates: full test suite required, file size limits enforced, human review before integration.

**HuggingFace tap (v0.14.0):** Added as a trusted skill tap alongside agentskills.io, extending the browsable catalog. Install via `hermes skills install <name>`.

### Plugin API

Hermes plugins are Python packages with a two-file minimal structure:

```
my-plugin/
  plugin.yaml      # Manifest: name, version, description, requires_env
  __init__.py      # Exports register(ctx) function
```

The `register(ctx)` callback receives a `PluginContext` object. Registration methods:

- `ctx.register_tool(schema, handler)` -- adds callable tools with JSON schemas; handler signature: `def handle_tool(params, **kwargs) -> str`
- `ctx.register_hook(event, handler)` -- lifecycle hooks
- `ctx.register_command(def)` -- slash commands
- `ctx.register_cli_command(def)` -- `hermes plugin subcommand` entries
- `ctx.register_skill(...)` -- bundled namespaced skills
- `ctx.register_platform(...)` -- gateway channel adapters
- `ctx.register_image_gen_provider(...)`, `ctx.register_video_gen_provider(...)`
- `ctx.register_context_engine(...)` -- compression engines (single-select)
- `ctx.inject_message(content, role)` -- inject messages into active conversation

**v0.14.0 additions:**
- `ctx.llm.complete(...)` / `ctx.llm.complete_structured(...)` -- plugins can make their own LLM calls using the user's active provider and credentials; no separate API key needed.
- `tool_override` flag -- plugins can replace a built-in tool implementation entirely with their own.

**Available lifecycle hooks:** `pre_tool_call`, `post_tool_call`, `pre_llm_call`, `post_llm_call`, `on_session_start`, `on_session_end`, `on_session_finalize`, `on_session_reset`, `subagent_stop`, `pre_gateway_dispatch`.

**Discovery order (later sources override earlier):**
1. Bundled (`<repo>/plugins/`)
2. User (`~/.hermes/plugins/`)
3. Project (`.hermes/plugins/`; requires `HERMES_ENABLE_PROJECT_PLUGINS=true`)
4. pip (`hermes_agent.plugins` entry points)
5. NixOS (`services.hermes-agent.extraPlugins` for declarative installs)

General plugins are **opt-in by default** -- users must add to `plugins.enabled` in `config.yaml`. Exceptions auto-load: bundled infrastructure plugins, single-select memory and context-engine slots, and bundled model providers.

**Sub-category directories** route to dedicated loaders: `plugins/platforms/`, `plugins/image_gen/`, `plugins/memory/`, `plugins/context_engine/`, `plugins/model-providers/`.

**Plugin management:**
```bash
hermes plugins                         # curses UI
hermes plugins install user/repo       # install + prompt to enable
hermes plugins enable/disable <name>
```

### MCP support

MCP support was added in **v0.6.0** (late March 2026). Configuration in `~/.hermes/config.yaml`:

```yaml
mcp_servers:
  github:
    command: "npx"
    args: ["-y", "@modelcontextprotocol/server-github"]
    env:
      GITHUB_PERSONAL_ACCESS_TOKEN: "***"
  remote_api:
    url: "https://mcp.example.com/mcp"
    headers:
      Authorization: "Bearer ***"
  # OAuth 2.1 for hosted services (Linear, Sentry, Stripe, etc.):
  linear:
    url: "https://mcp.linear.app/mcp"
    auth: oauth
```

**Tool filtering per server:**
- Whitelist: `tools: {include: [create_issue, list_issues]}`
- Blacklist: `tools: {exclude: [delete_customer]}`
- Disable utility tools: `prompts: false`, `resources: false`

**Tool naming:** Tools are registered as `mcp_<server>_<tool_name>`, with hyphens and dots in server/tool names normalized to underscores to produce valid function-calling identifiers.

**Parallel execution (v0.14.0):** When `supports_parallel_tool_calls: true` is set per server, Hermes runs multiple tools from that server simultaneously via `ThreadPoolExecutor` (max 8 workers). The documentation explicitly warns to enable only for servers whose tools are safe to run concurrently.

**Dual-role MCP:** `hermes mcp serve` exposes Hermes as a stdio MCP server with 10 tools (`conversations_list`, `messages_read`, `messages_send`, etc.). This allows Claude Code, Cursor, Codex, and other MCP clients to use Hermes's messaging capabilities as a backend.

**Editor integrations:** VS Code, Zed, and JetBrains connect to Hermes as an agent backend over stdio/JSON-RPC; these editors can register their own MCP servers directly into Hermes's tool namespace.

**Security controls:** Stdio env variable filtering (only explicitly configured vars plus a safe baseline pass through); config-level tool whitelisting/blacklisting; rate limiting and tool-loop depth limits per server.

### Marketplace and supply-chain risk

The agentskills.io Skills Hub lists 652+ community skills as of v0.13.0. This is significantly smaller than ClawHub's 44,000+, which provides some supply-chain surface reduction, but Hermes has documented the same class of risk: malicious skills get code execution on install without per-skill runtime sandboxing. The `hermes-agent-self-evolution` system adds a safety gate (test suite + size limits + human review) before evolved skill files are integrated -- but this applies only to auto-generated skills, not community-installed ones.

Skills installed from agentskills.io or the HuggingFace tap do not currently pass through a dedicated malware scanner equivalent to ClawHub's VirusTotal integration.

### Built-in tool catalog

70+ tools registered in `tools/registry.py`, organized into domain toolsets (`toolsets.py`): browser, file, terminal, delegation, and others. Toolsets can be enabled/disabled via curses UI (`hermes tools`) or `config.yaml`.

Notable tools: `execute_code` (programmatic tool-calling to collapse multi-step pipelines), `delegate_task` (subagent spawning), `cronjob` (durable scheduled tasks), `terminal(background=True)` (background processes), `/handoff` (v0.14.0, transfers session between models/personas without losing context).

**LSP diagnostics (v0.14.0):** Runs a real language server on every file write and surfaces new errors before the next turn -- a developer-productivity differentiator not present in OpenClaw or Vellum.

---

## Vellum

### SKILL.md + TOOLS.json format

Vellum uses a two-file manifest system that is proprietary but explicitly mentions MCP as a supported extensibility path. The system is described in Vellum's GLOSSARY.md:

> "Skill: A capability the assistant can learn and use. Skills are modular and can be added, removed, or updated... encompasses tools."

**SKILL.md:** Instructions that teach the assistant when and how to use the skill. A minimal skill requires only this file. When the assistant determines a skill is relevant, it calls `skill_load` to activate it -- the full SKILL.md is injected into the conversation context at that point (lazy loading).

**TOOLS.json:** Present in more complex skills. Defines:
- Tool names and input parameters
- Risk levels (specific values not publicly enumerated)
- Execution targets: `sandboxed` (workspace-isolated) or `host` (full machine access)
- TypeScript executors in a co-located `tools/` directory

The assistant can autonomously generate new skill packages using `scaffold_managed_skill`, which produces SKILL.md + TOOLS.json + TypeScript executors and saves the result to the user's `skills/` directory.

**Catalog discovery:** Every conversation receives a catalog of available skills (names, descriptions, activation hints). This is structurally equivalent to the agentskills.io progressive disclosure model, but implemented independently within Vellum's own stack.

**Conformance to agentskills.io:** As of this research, Vellum's SKILL.md does not appear to declare conformance with the agentskills.io open standard, and the TOOLS.json layer is Vellum-specific. Cross-compatibility with other agentskills.io-conformant tools is unclear -- the presence of a SKILL.md file alone does not guarantee portability if consuming tools ignore TOOLS.json.

### Plugin API

Vellum does not appear to publish a third-party plugin API equivalent to OpenClaw's npm plugin registry or Hermes's Python plugin system. Extensibility is documented via skills (SKILL.md + TOOLS.json) and MCP server integration. Whether internal "skill plugin" infrastructure exists but is not yet public, or whether Vellum's design intentionally channels all extensibility through skills + MCP rather than a lower-level plugin API, is not determinable from available sources.

### MCP support

Vellum's Skills & Tools documentation explicitly lists MCP as a supported tool extensibility path: "Via MCP servers or custom skill tools." The enterprise Vellum dev platform supports connecting Agent Nodes to MCP servers (documented on Speakeasy's integration guide). The personal assistant (`vellum-assistant`) references MCP in the context of tool extension.

However: the specific MCP configuration format, supported transports, tool filtering options, and whether `vellum-assistant` exposes itself as an MCP server are not documented at the same level of detail as OpenClaw or Hermes. The `comparison.md` base dossier flags this: "MCP not confirmed" for the personal assistant at the time of that writing. Subsequent evidence indicates MCP is supported but the implementation depth is less publicly specified.

### Sandboxing model

Vellum's sandboxing is the most OS-native of the three:
- **macOS:** `sandbox-exec` with SBPL (Seatbelt) profiles
- **Linux:** `bwrap` (Bubblewrap) userspace sandbox

Two execution tiers:
- **Sandboxed tools:** Core workspace operations (file_read, bash, etc.) run inside the sandbox
- **Host tools:** `host_bash`, `host_file_read`, `host_file_write`, `host_file_edit` run directly on the host machine, gated by trust rules and explicit permission prompts

The "fail-closed trust engine" resolves actor identity once per session (guardian / trusted / unknown) and credentials are stored in a secrets vault, never passed directly to the model. This is a materially different security posture than OpenClaw's after-the-fact sandbox overlays or Hermes's configurable multi-backend approach.

### Built-in skills and marketplace

Vellum ships **28 bundled skills** organized into seven categories at v0.8.4 (note: the vellum.ai product page cites "60+ skills" -- this discrepancy likely reflects skills available via the managed catalog vs. skills bundled in the open-source repo; treat the 60+ figure as uncertain until confirmed against primary source). Categories include Communication, Research & Content, Productivity, Computer Use, Monitoring, Development, and System.

No third-party skills marketplace or registry has been announced for the personal assistant. The catalog referenced in docs appears to be Vellum-curated rather than community-contributed at this stage.

---

## Head-to-head

### Open standard vs proprietary extensibility

**The agentskills.io divide:**
- Hermes is a conformant agentskills.io consumer. Skills authored for Hermes are in principle portable to any of the 32+ products that have adopted the standard (Claude Code, Codex CLI, Gemini CLI, GitHub Copilot, VS Code, Cursor, Goose, Junie, Databricks Genie, Snowflake Cortex Code, Spring AI, and many others as of March 2026).
- OpenClaw uses agentskills.io as a base but extends it significantly via `metadata.openclaw`. OpenClaw-specific fields (`requires.bins`, `os`, `always`, `command-dispatch`, etc.) are ignored by other agentskills.io consumers. Skills remain structurally portable for the base instructions; the OpenClaw-specific gating and capability declarations are lost.
- Vellum's SKILL.md appears structurally similar but uses TOOLS.json for the executable layer. Cross-compatibility is unclear.

The existence of the agentskills.io standard (originated at Anthropic, now with 32+ adopters and a Vercel-hosted marketplace at skills.sh with 89,753 skills) is a significant ecosystem coordination point that OpenClaw adopted early and Hermes fully embraces, while Vellum's relationship with the standard is ambiguous.

**Plugin API design philosophies:**
- OpenClaw's TypeScript npm plugin API is the widest surface: it supports adding entirely new LLM providers, new messaging channels, new embedding backends, new voice/media providers, lifecycle hooks, and HTTP routes. The flip side is that this wide surface also means a compromised plugin has wide blast radius.
- Hermes's Python plugin API is comparably wide (platforms, memory, context engines, image/video gen), and v0.14.0's `ctx.llm` access allows plugins to make LLM calls with the user's credentials. `tool_override` is a sharp tool -- it allows replacing built-in tools entirely, which is powerful for correctness but creates a trust-escalation path if a malicious plugin exploits it.
- Vellum's current extensibility surface is narrower: skills + MCP. Whether this is intentional design conservatism (consistent with the "focused-core + extensibility" philosophy documented in David Vargas's writing) or simply early-stage limitation is not clear from public sources.

### Who is most / least extensible, and the tradeoffs

**Most extensible at the framework layer:** OpenClaw. The npm plugin API covers every major subsystem. The Lobster YAML pipeline engine, the multi-transport MCP bridge, the ClawHub marketplace, and the Composio just-in-time adapter for 20,000+ tools give developers the widest possible surface. The tradeoff: wider surface = more attack area, and ClawHub's supply-chain history (1,184 confirmed malicious skills, recurring CVEs, attacker-adapted evasion) demonstrates this is not theoretical.

**Most extensible via portable skills:** Hermes + agentskills.io. A skill written for Hermes can run without modification on Claude Code, Codex CLI, Gemini CLI, and 30+ other tools. The self-evolving skill system is architecturally unique: the agent creates and refines its own SKILL.md files from session traces, compounding value over time. Marketplace size (652+ skills) is much smaller than ClawHub, which cuts both ways -- less choice, less supply-chain exposure.

**Least extensible at launch:** Vellum. 28 bundled skills, no announced community marketplace, no published third-party plugin API. This is also the newest product by far (May 7, 2026) and the comparison is partly unfair. Vellum's extensibility story is coherent -- SKILL.md + TOOLS.json + MCP covers the meaningful use cases -- but the ecosystem depth is not yet present.

**MCP depth ranking:** OpenClaw > Hermes > Vellum (by documentation depth and confirmed features). All three support MCP as an integration path; OpenClaw and Hermes both operate in dual client+server roles and have detailed public configuration references. Vellum's MCP support is confirmed at the product level but less publicly specified.

**Supply-chain risk ranking:** OpenClaw (highest, documented at scale) > Hermes (moderate, class of risk is the same but smaller marketplace + no dedicated scanner) > Vellum (lowest, curated catalog only). This is correlated with marketplace maturity -- a larger marketplace inherently increases supply-chain surface.

---

## Design considerations for a from-scratch build

These are structural observations only. No product direction is implied.

**On skill format choice:** The agentskills.io standard now has 32+ adopters including major platform vendors. A from-scratch build that conforms to the base spec can use the growing skills.sh marketplace (89,753 skills) and the agentskills.io Skills Hub as day-one content without building a proprietary catalog. The tradeoff is that agentskills.io is instruction-only -- executable tool definitions require a runtime-specific layer (OpenClaw's metadata.openclaw gates, Vellum's TOOLS.json executors, Hermes's bundled scripts).

**On progressive disclosure:** All three products independently converged on loading only name+description at startup and injecting full instructions on activation. This is validated as the right architecture for managing context costs at scale. The token arithmetic matters: OpenClaw documents ~24 tokens per available skill; at 652 skills (Hermes Hub size), that's ~15,600 tokens just in skill catalog overhead if all loaded eagerly. Selective activation is not optional at this scale.

**On MCP as the extensibility primitive vs. a bespoke plugin API:** MCP (donated to the Linux Foundation's Agentic AI Foundation in December 2025, now vendor-neutral) is the maturing interop standard for tool connectivity. A from-scratch assistant that is MCP-native for all executable tool integrations -- rather than requiring a bespoke plugin SDK -- would have lower third-party integration friction. The risk is that MCP trust boundaries are still maturing; the protocol does not inherently solve the "malicious server registers dangerous tools" problem.

**On sandbox strategy:** OpenClaw's Docker-per-session model, Hermes's seven switchable backends, and Vellum's OS-native sandbox-exec/bwrap represent meaningfully different cost/complexity/isolation tradeoffs. Docker provides strong isolation with meaningful overhead; OS-native sandboxing (Vellum's approach) is lower overhead but platform-specific; the multi-backend pattern (Hermes) gives deployment flexibility at the cost of configuration complexity. The fail-closed default (require explicit permission for host access) is the safest starting posture regardless of backend.

**On marketplace timing:** ClawHub's experience demonstrates that a marketplace that grows faster than security review capacity becomes a supply-chain liability. A tiered trust model -- a curated "verified" set plus a community tier with clear risk disclosure -- separates the discovery benefit from the unconditional trust problem. The VirusTotal integration OpenClaw added post-incident is reactive; designing the trust gradient in before the marketplace exists is qualitatively different.

**On plugin API scope:** The full-subsystem plugin APIs in OpenClaw and Hermes enable community-built channel adapters, memory backends, and LLM providers. This is powerful but also widens the blast radius of a compromised plugin. A narrower initial plugin surface (tool registration only, no provider or channel replacement) could be appropriate if the goal is to minimize attack surface while still enabling tool extensibility. Expanding scope later is feasible; retracting it after community adoption is not.

---

## Sources

### New (from this research pass)

- [OpenClaw Skills Documentation](https://docs.openclaw.ai/tools/skills) -- SKILL.md format, loading hierarchy, token cost formula, agent allowlists
- [ClawHub SKILL.md Format Specification](https://github.com/openclaw/clawhub/blob/main/docs/skill-format.md) -- Full ClawHub-specific frontmatter fields, publishing constraints, MIT-0 licensing requirement
- [OpenClaw Plugin SDK Overview](https://docs.openclaw.ai/plugins/sdk-overview) -- Plugin types, registration API, slot exclusion, hot loading, manifest contracts
- [OpenClaw MCP Documentation](https://docs.openclaw.ai/cli/mcp) -- Transport types (stdio/SSE/streamable-http), openclaw.json config format, dual server role, env variable filtering
- [Agent Skills Open Standard -- agentskills.io home](https://agentskills.io/home) -- Full adopter list (32+ products), open standard origin at Anthropic, progressive disclosure model
- [Agent Skills Specification -- agentskills.io](https://agentskills.io/specification) -- Complete SKILL.md spec: required/optional fields, directory structure, progressive disclosure stages, validation tooling
- [Hermes Agent MCP Documentation](https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp) -- Config format (stdio/HTTP/OAuth 2.1), tool filtering, `hermes mcp serve`, parallel execution, env filtering security
- [Hermes Agent Plugin System Documentation](https://hermes-agent.nousresearch.com/docs/user-guide/features/plugins) -- plugin.yaml, register(ctx) API, ctx.llm, tool_override, discovery order, lifecycle hooks
- [Vellum Skills & Tools Documentation](https://vellum.ai/docs/key-concepts/skills-and-tools) -- SKILL.md + TOOLS.json format, skill_load activation, 28 bundled skills, sandboxed vs host execution, MCP mention
- [ClawHub Malicious Skills -- PointGuard AI](https://www.pointguardai.com/ai-security-incidents/openclaw-clawhub-malicious-skills-supply-chain-attack) -- ClawHavoc campaign timeline, 341 initial / 824 expanded malicious skill count
- [ClawHub Incident -- Termdock](https://www.termdock.com/en/blog/clawhub-malicious-skills-incident) -- February 2026 incident details, attacker comment-based pivot
- [OpenClaw + VirusTotal Integration -- Penligent](https://www.penligent.ai/hackinglabs/openclaw-virustotal-clawhub-skill-scanning-turns-the-marketplace-into-a-supply-chain-boundary/) -- VirusTotal partnership details, scanning pipeline
- [Composio MCP with OpenClaw](https://composio.dev/toolkits/github/framework/openclaw) -- Just-in-time 20,000+ tool catalog, @composio/openclaw-plugin mechanics
- [Hermes Agent Plugin Docs (raw GitHub)](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/plugins.md) -- Source for plugin discovery sub-categories
- [Anthropic Opens Agent Skills Standard -- VentureBeat](https://venturebeat.com/technology/anthropic-launches-enterprise-agent-skills-and-opens-the-standard) -- Standard origin, partner skills at launch (Atlassian, Figma, Canva, Stripe, Zapier, Notion)
- [Agent Skills Open Standard -- The New Stack](https://thenewstack.io/agent-skills-anthropics-next-bid-to-define-ai-standards/) -- Governance and ecosystem framing
- [Agent Skills Adopter Count -- paperclipped.de](https://www.paperclipped.de/en/blog/agent-skills-open-standard-interoperability/) -- 32 adopters as of March 2026
- [hermes mcp serve -- Lushbinary](https://lushbinary.com/blog/hermes-agent-mcp-integration-complete-guide/) -- Server mode details
- [MCP governance -- Wikipedia: Model Context Protocol](https://en.wikipedia.org/wiki/Model_Context_Protocol) -- December 2025 Linux Foundation donation
- [Vellum Security & Permissions](https://www.vellum.ai/docs/developer-guide/security) -- sandbox-exec, bwrap, host tool gating
- [Vellum MCP + Agent Nodes -- Speakeasy](https://www.speakeasy.com/docs/mcp/build/integrate/clients/using-vellum-agents-with-gram-mcp-servers) -- MCP support in Vellum dev platform Agent Nodes

### From base dossiers (openclaw.md, hermes.md, vellum.md)

- [GitHub: openclaw/openclaw](https://github.com/openclaw/openclaw) -- Plugin system, MCP overview, skill hierarchy
- [Composio: GitHub MCP with OpenClaw](https://composio.dev/toolkits/github/framework/openclaw) -- 20K+ tool catalog via Composio
- [Bibek Poudel, Medium: "How OpenClaw Works"](https://bibek-poudel.medium.com/how-openclaw-works-understanding-ai-agents-through-a-real-architecture-5d59cc7a4764) -- Plugin types, MCP, skill injection
- [Data Science Collective: "355K GitHub Stars -- Complete Honest Guide"](https://medium.com/data-science-collective/355k-github-stars-in-5-months-17-defense-rate-the-complete-honest-guide-to-openclaw-28d2f59598e1) -- 17% malicious skills figure (Cisco), ClawHavoc count
- [Hermes Agent AGENTS.md](https://github.com/NousResearch/hermes-agent/blob/main/AGENTS.md) -- Skills system overview, MCP v0.6.0 addition, toolsets.py
- [Release v0.14.0](https://github.com/NousResearch/hermes-agent/releases/tag/v2026.5.16) -- ctx.llm, tool_override, parallel MCP, HuggingFace tap
- [Skills System Docs](https://hermes-agent.nousresearch.com/docs/user-guide/features/skills) -- SKILL.md format, agentskills.io alignment, Skills Hub 652+ count
- [Hermes Agent Security Threat Model (Repello AI)](https://repello.ai/blog/hermes-agent-security) -- Memory injection, MCP trust boundary
- [GitHub: vellum-ai/vellum-assistant README](https://github.com/vellum-ai/vellum-assistant/blob/main/README.md) -- SKILL.md + TOOLS.json, 60+ skills claim
- [GitHub: vellum-ai/vellum-assistant GLOSSARY.md](https://github.com/vellum-ai/vellum-assistant/blob/main/GLOSSARY.md) -- Skill definition, trust rules
- [Introducing Vellum: Your own Personal Intelligence](https://www.vellum.ai/blog/introducing-vellum) -- Progressive trust model, fail-closed trust engine
