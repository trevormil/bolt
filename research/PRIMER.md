# Primer: OpenClaw vs Hermes vs Vellum

A fast, skimmable reference for the personal-assistant landscape — meant to be
consulted throughout the project. For depth, follow the links to the
[dimension specs](./comparison/). All figures are point-in-time (late May 2026).

---

## 30-second TL;DR

- **OpenClaw** — the **incumbent giant**. ~375K★, multi-million MAU, 22 channels,
  voice, interactive Canvas, huge skill marketplace. Ubiquitous and
  feature-complete — but sprawling and carrying serious security debt.
- **Hermes** (NousResearch/hermes-agent) — the **credible challenger**. ~168K★,
  backed by a $70M model lab. Self-improving skills, 200+ models, strong
  developer/CLI ergonomics, proactive security layering. Setup is fiddly.
- **Vellum** (vellum-ai/vellum-assistant) — the **newcomer with a thesis**.
  ~486★, weeks old. "Personal Intelligence": an assistant that is *its own
  entity* (own email/GitHub/Slack), earns autonomy via **progressive trust**,
  and is the most security-forward by architecture. Tiny, unproven.

> **This is the partner's project.** `vellum-ai/vellum-assistant` + OpenClaw are
> the **"do not fork"** targets. We build a third thing from scratch.

---

## Master comparison table

| | **OpenClaw** | **Hermes** | **Vellum** |
|---|---|---|---|
| **One-liner** | Message-me-anywhere incumbent | Self-improving dev-grade challenger | Trust-first "Personal Intelligence" |
| **Stars (May '26)** | ~375,000 | ~168,000 | ~486 |
| **First release** | Jan 2026 (relaunch) | Feb 25, 2026 | May 7, 2026 |
| **Backing** | Bootstrapped; OpenAI sponsors | Nous Research ($70M) | Vellum (YC, ~$29.5M) |
| **Language** | TypeScript (Node) | Python + TS | TypeScript + Swift |
| **License** | MIT | MIT | MIT |
| **Runtime model** | Single Gateway daemon, 1/host | Multi-process, shared agent loop | 3-process, isolated credential executor |
| **Memory** | Markdown + SQLite (sqlite-vec) | Markdown (bounded) + SQLite FTS5 | 4 markdown files + vector KG |
| **Identity** | SOUL/IDENTITY/USER.md (3 files) | Single SOUL.md + overlays | SOUL.md + assistant-as-own-entity |
| **Extensibility** | Skills + npm plugins + MCP | agentskills.io (open std) + MCP | SKILL.md + TOOLS.json (MCP unconfirmed) |
| **Marketplace** | ClawHub ~44K skills | agentskills.io ~647 skills | 60+ built-in |
| **Channels** | 22 + voice + Canvas + mobile | 22, CLI/TUI-first, no voice | 6 focused + Chrome ext |
| **Proactivity** | HEARTBEAT.md checklist | Config-driven cron | Hourly agent self-check-in |
| **Models** | 35+ providers, per-agent select | 200+ (OpenRouter) + Pareto router | Claude/OpenAI/Gemini/Ollama |
| **Cost lever** | Per-channel cheap/strong split | OAuth-sub reuse via `hermes proxy` | Local ONNX embeddings |
| **Security record** | Weakest (CVE storm, 135K exposed) | Layered; open memory-injection bug | Strongest by design; unproven |
| **Install** | `curl \| bash` / npm | `curl \| bash` / pip | Managed web (~30s) or local |
| **Data ownership** | Local; disableable metadata | Most local (no telemetry) | Local; analytics on by default |
| **Maturity** | Battle-scarred, dominant | Fast-rising, stabilizing | Brand-new, untested |

---

## Where each one wins

- **OpenClaw wins on** reach and completeness — if "talk to it from any app, with
  voice, with a rich UI, with a skill for everything" is the goal, nothing else
  is close. Ecosystem gravity is its moat.
- **Hermes wins on** developer ergonomics, model freedom (200+), self-improving
  skills, and being the most genuinely *local/private*. The power-user's pick.
- **Vellum wins on** trust architecture and conceptual clarity — the
  creator/assistant entity model and progressive-trust security are the most
  coherent answer to "should I actually let this thing act for me?"

## What's table stakes (everyone already has it)

Local-first · markdown memory files · `SOUL.md` personality · semantic recall ·
multi-provider LLMs · local-model support · a skill/plugin system · multi-channel
messaging · `curl | bash` install. **Building these is not a differentiator.**

## The three least-saturated axes (where a new entrant could differentiate)

1. **Security / trust by design** — Vellum stakes a claim; OpenClaw's record
   shows the gap is real. Most concrete opening.
2. **Install + onboarding speed** — the PRD's sub-60s bar isn't cleanly met by
   anyone on a bare machine.
3. **Interaction "vibes"** — a stated PRD metric the incumbents under-invest in.

---

## Glossary (recurring terms)

- **Gateway** — OpenClaw's single long-lived daemon process that owns sessions,
  routing, and channel connections (one per host).
- **`SOUL.md`** — the markdown file defining an assistant's personality/voice.
  Convention shared by all three.
- **Working vs long-term memory** — working = small markdown files loaded every
  turn (e.g. `essentials.md`, `recent.md`); long-term = a searchable store
  (SQLite/vector DB) queried on demand.
- **Consolidation / compaction** — periodically summarizing/condensing memory so
  context doesn't bloat (Vellum runs it on a 4-hour "sleep-like" cycle).
- **MCP (Model Context Protocol)** — the open standard for exposing tools/data to
  an assistant; lets you wire in any MCP server as new capabilities.
- **Skill** — a packaged capability, usually a `SKILL.md` (natural-language
  procedure) ± tool config. "agentskills.io" is the open cross-tool skill
  standard Hermes uses.
- **Progressive trust / Trust Rules** — Vellum's model: the assistant asks for
  approval until you grant it more autonomy (vs OpenClaw's "full autonomy,
  fewer guardrails").
- **Canvas / A2UI** — OpenClaw's interactive UI surface; agents emit HTML with
  `a2ui-*` action attributes that call back into tools.
- **HEARTBEAT.md** — OpenClaw's file of proactive task checklists the agent
  reviews on a schedule.
- **Sub-agent / delegation** — spawning isolated child agents for sub-tasks
  (OpenClaw caps nesting at depth 2; Hermes caps turns).
- **Sandbox** — isolated execution context for tool/code runs (Docker in
  OpenClaw/Hermes; OS-native `sandbox-exec`/`bwrap` in Vellum).

---

## Go deeper

| Want… | Read |
|-------|------|
| The full landscape map + scorecard | [comparison/00-overview.md](./comparison/00-overview.md) |
| A specific dimension in depth | [comparison/](./comparison/) (01–08) |
| Raw per-product dossiers | [openclaw.md](./openclaw.md) · [hermes.md](./hermes.md) · [vellum.md](./vellum.md) |
| Original synthesis + opportunity space | [comparison.md](./comparison.md) |
