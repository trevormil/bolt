---
title: "Comparison Overview & Cross-Dimension Scorecard"
date: 2026-05-26
status: synthesis
note: >
  Executive summary tying together the eight dimension specs in this folder.
  This is ANALYSIS, not raw research, and it makes NO product/architecture
  decision for our build. Figures are point-in-time (late May 2026) with the
  same source caveats as the per-dimension docs.
---

# Comparison Overview & Cross-Dimension Scorecard

Eight deep-dive specs compare **OpenClaw**, **Hermes** (NousResearch/hermes-agent),
and **Vellum** (vellum-ai/vellum-assistant, "Personal Intelligence") across the
dimensions that matter for building a personal assistant. This file is the map;
each linked doc is the territory.

| # | Dimension | Doc |
|---|-----------|-----|
| 01 | Architecture & runtime | [01-architecture-runtime.md](./01-architecture-runtime.md) |
| 02 | Memory, state & identity | [02-memory-identity.md](./02-memory-identity.md) |
| 03 | Extensibility & tooling | [03-extensibility-tooling.md](./03-extensibility-tooling.md) |
| 04 | Interaction surfaces & channels | [04-interaction-surfaces.md](./04-interaction-surfaces.md) |
| 05 | Models, cost & performance | [05-models-cost-performance.md](./05-models-cost-performance.md) |
| 06 | Security & trust | [06-security-trust.md](./06-security-trust.md) |
| 07 | Install, onboarding & data ownership | [07-install-onboarding-data.md](./07-install-onboarding-data.md) |
| 08 | Ecosystem, maturity & governance | [08-ecosystem-maturity-governance.md](./08-ecosystem-maturity-governance.md) |

> For a fast, skimmable reference, see [`../PRIMER.md`](../PRIMER.md). For the
> raw per-product dossiers, see [`../openclaw.md`](../openclaw.md),
> [`../hermes.md`](../hermes.md), [`../vellum.md`](../vellum.md).

## Cross-dimension scorecard

Qualitative "who leads this axis" read, distilled from each dimension's
head-to-head. **Leads** = strongest on that axis as of late May 2026; it is not
an overall-quality score, and "leads" on security-by-design (Vellum) means
*architecturally* strongest, not *proven* strongest.

| Dimension | OpenClaw | Hermes | Vellum | Leads |
|-----------|:--------:|:------:|:------:|-------|
| Architecture & runtime | ●●● | ●●● | ●●○ | **Hermes** (loop discipline) / **OpenClaw** (multi-agent spec) |
| Memory & identity | ●●● | ●●○ | ●●● | **Vellum** (retrieval + entity-identity model) |
| Extensibility & tooling | ●●● | ●●● | ●●○ | **Hermes** (open standard) / **OpenClaw** (marketplace size) |
| Interaction surfaces | ●●● | ●●○ | ●●○ | **OpenClaw** (breadth: voice + Canvas + 22 channels) |
| Models, cost & perf | ●●○ | ●●● | ●●○ | **Hermes** (200+ models, routing, proxy) |
| Security & trust | ●○○ | ●●○ | ●●● | **Vellum** by design / **OpenClaw** weakest by record |
| Install & data ownership | ●●○ | ●●● | ●●○ | **Hermes** (most genuinely local) |
| Ecosystem & maturity | ●●● | ●●○ | ●○○ | **OpenClaw** (dominant scale) |

●●● strong · ●●○ moderate · ●○○ weak. See each doc for the evidence behind the dots.

## One-line read per dimension

1. **Architecture** — Hermes has the tightest agent-loop discipline (explicit
   90-turn cap, 50-turn sub-agent cap, gated parallel tool batching); OpenClaw
   has the most fully-specified multi-agent orchestration (lane-based FIFO
   queue, depth-2 sub-agents, documented tool exclusions); Vellum is strongest
   on credential-isolation architecture (a separate `credential-executor` RPC
   process so the model never sees raw tokens) but is the youngest.
2. **Memory & identity** — all three converged on `SOUL.md` + markdown working
   memory (table stakes). They diverge on consolidation (OpenClaw event-driven,
   Hermes inline-overflow, Vellum scheduled 4-hour "sleep") and retrieval
   (Vellum's graph/PCA approach is most advanced). Vellum's creator/assistant
   *entity* model — the assistant gets its own email, GitHub, Slack — is the
   most opinionated and the most coherent with "Personal Intelligence."
3. **Extensibility** — OpenClaw's ClawHub (~44K skills) is the largest but
   carries real supply-chain risk (the ClawHavoc campaign, 1,184 malicious
   skills); Hermes's agentskills.io is an *open standard* portable across 32+
   tools with OAuth-2.1 MCP; Vellum uses SKILL.md + TOOLS.json with OS-native
   sandboxing and version-hash binding.
4. **Interaction** — OpenClaw owns breadth: 22 channels + voice (wake word +
   Talk Mode) + the interactive Canvas UI + native mobile. Hermes matches the
   channel count but is CLI/TUI-first with no native voice. Vellum runs a
   focused 6-surface set, but is alone in a first-party Chrome extension and an
   hourly *proactive self-check-in* engine.
5. **Models & cost** — Hermes reaches the most models (200+ via OpenRouter +
   a Pareto router + `hermes proxy` to reuse OAuth subscriptions). OpenClaw does
   per-agent/per-channel model selection with strong prompt-cache hit rates.
   Vellum's clearest cost lever is local ONNX embeddings; its routing is thin at
   v0.8.4. (A widely-cited Hermes fixed-overhead/token-throughput complaint may
   be version-stale — flagged in the doc.)
6. **Security & trust** — the sharpest split. OpenClaw is weakest *by record*
   (a dense advisory history, a CVSS-9.9 cluster, a four-CVE chain to ~9.6,
   135K+ exposed instances, marketplace malware). Hermes is proactively layered
   but has an unresolved SQLite memory-injection surface (issue #496). Vellum
   has the strongest security *architecture* (credential execution service,
   fail-closed OS sandbox, skill version-hashing) but only weeks of public
   exposure — unproven under adversarial load. **This is the axis Vellum itself
   markets on, and the one where the incumbent's gap is most concrete.**
7. **Install & data** — none cleanly meets the PRD's sub-60-second bar on a bare
   machine. Vellum's *managed cloud* web path (~30s) is the only genuine
   sub-minute experience, but needs an account. Hermes is the most genuinely
   local (no telemetry, explicit FAQ). Vellum is the only one shipping usage
   analytics *on by default* in local mode (documented opt-out). Vellum's
   conversational onboarding (no wizard; the assistant writes its own `SOUL.md`)
   is the most novel UX.
8. **Ecosystem & maturity** — not close on scale. OpenClaw (~375K★, multi-million
   MAU, ~$400K/mo ecosystem revenue, a forming Foundation) ≫ Hermes (~168K★,
   $70M-backed lab, v1.0 roadmap) ≫ Vellum assistant (~486★, weeks old). Momentum
   and stability trade off: OpenClaw's ~2-day release cadence brings breaking
   changes.

## The two findings that frame everything

1. **The "do not fork" targets are `vellum-ai/vellum-assistant` + OpenClaw.**
   Vellum already shipped its own assistant ("Personal Intelligence," May 7
   2026). We are building a *third* thing, in a space where the partner has a
   public opinion we can study but not copy.
2. **The core stack is commoditized.** Local-first + markdown memory + `SOUL.md`
   identity + MCP + skills + multi-channel is *table stakes* across all three.
   Differentiation must come from a dimension above the baseline — the specs
   point most concretely at **security/trust**, **onboarding/install speed**,
   and **interaction "vibes"** as the least-saturated axes.

## What this implies for a from-scratch entrant (observations, not a decision)

- The baseline stack is well-understood and reproducible; building it is not the
  hard part or the differentiator.
- The clearest *unclaimed-by-the-incumbent* quality is **trustworthy-by-design
  security** — and it happens to align with both the partner's own positioning
  and the founder's published "assume the AI works against you" philosophy.
- The PRD's measurable bar (**install < 1 min**) is, per the research, *not*
  cleanly met by anyone on a bare machine — a genuine opening to own.
- "Great vibes" / interaction quality is a stated PRD metric the incumbents
  under-invest in (they compete on breadth).

**No direction is selected here.** This overview exists to make the next
decision well-informed. See [`../comparison.md`](../comparison.md) for the
original synthesis and the open opportunity space.
