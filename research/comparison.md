---
title: "Head-to-Head: OpenClaw vs Hermes vs Vellum"
date: 2026-05-26
status: synthesis
note: >
  This file is ANALYSIS synthesized from the three raw dossiers
  (openclaw.md, hermes.md, vellum.md). It deliberately makes NO product or
  architecture decision for our build — it maps the landscape and the open
  opportunity space only. Figures are point-in-time (late May 2026) and
  carry the same source caveats as the dossiers.
---

# Head-to-Head: OpenClaw vs Hermes vs Vellum

## The single most important finding

**Vellum already ships its own open-source personal assistant** —
`vellum-ai/vellum-assistant`, branded **"Personal Intelligence,"** launched
publicly May 7, 2026 (MIT, TypeScript/Swift). The PRD line *"Do NOT just fork
our assistant or OpenClaw"* refers to **this repo plus OpenClaw** — both are
TypeScript, both are off-limits to fork. **"Personal Assistant Species"** is an
internal/hiring framing; the public category label Vellum uses is **"Personal
Intelligence."**

Practical consequence: we are building a *third* thing from scratch, in a space
where the partner itself has a shipped opinion we can study but not copy.

## Popularity & maturity (late May 2026)

| | **OpenClaw** | **Hermes** | **Vellum (vellum-assistant)** |
|---|---|---|---|
| GitHub stars | ~375,000 | ~168,000 | ~486 |
| Forks | 58K–78K | ~27,800 | ~73 |
| Contributors | 1,200+ | 300+ | small core |
| First release | Jan 2026 (relaunch; orig. Nov 2025) | Feb 25, 2026 | May 7, 2026 |
| MAU / scale | 3.2M MAU, 500K+ instances | "most-used on OpenRouter" (point-in-time claim) | brand-new |
| Backing | Bootstrapped; OpenAI now sponsors | Nous Research ($70M total) | Vellum (YC W23, ~$29.5M) |
| License | MIT | MIT | MIT |
| Maturity verdict | Dominant, sprawling, battle-scarred | Fast-rising challenger | Earliest, least proven |

**Read:** OpenClaw is the 800-lb incumbent by every adoption metric. Hermes is
the credible #2 with a model-lab behind it. Vellum's assistant is a fresh
entrant — which is *why* this challenge exists: they want builders exploring the
space they just entered.

## Technical convergence — the "table stakes" baseline

All three independently converged on nearly the same primitives. Treat this as
the **commodity baseline**, not a place to differentiate:

| Primitive | OpenClaw | Hermes | Vellum |
|---|---|---|---|
| Local-first / self-hosted | ✅ `~/.openclaw/` | ✅ `~/.hermes/` | ✅ local mode |
| Markdown memory files | ✅ MEMORY/SOUL/HEARTBEAT.md | ✅ MEMORY.md/USER.md | ✅ essentials/threads/recent/buffer.md |
| Named identity / personality | ✅ SOUL.md | ✅ SOUL.md | ✅ SOUL.md |
| Vector/semantic recall | ✅ sqlite-vec | ✅ SQLite FTS5 + providers | ✅ vector KG, BM25+dense |
| Multi-provider LLM | ✅ 35+ | ✅ 200+ via OpenRouter | ✅ Claude/OpenAI/Gemini/Ollama |
| Local model support | ✅ Ollama/vLLM | ✅ Ollama/LM Studio/llama.cpp | ✅ Ollama + ONNX embeddings |
| MCP support | ✅ native + 1,000+ servers | ✅ since v0.6.0 | ⚠️ manifest skills (SKILL.md+TOOLS.json); MCP not confirmed |
| Skills/plugins | ✅ ClawHub 44K | ✅ agentskills.io 652+ | ✅ 60+ built-in |
| Multi-channel messaging | ✅ 20+ | ✅ 22 | ⚠️ macOS/Telegram/Slack/web/CLI/Chrome |
| `curl \| bash` install | ✅ | ✅ + pip | (managed or local) |

> **Implication for our build:** "local-first + markdown memory + SOUL.md
> identity + MCP" is no longer a differentiator — it is the *price of entry*.
> Anyone shipping a credible 2026 assistant has all of it. (This corrects the
> earlier working thesis in this project that local-first/knowledge-native would
> be the wedge — it's baseline.)

## Where they actually differ (the real axes)

- **OpenClaw — breadth & ubiquity.** 20+ channels, voice, Canvas interactive UI,
  native mobile, deepest ecosystem. Differentiates on *being everywhere* and
  *having everything*. Weakness: sprawl + security debt.
- **Hermes — self-improvement.** Procedural-memory skill system that writes and
  refines its own SKILL.md files over time (DSPy/GEPA self-evolution companion);
  seven-layer proactive security model. Differentiates on *getting better with
  use*.
- **Vellum — progressive trust & safety.** Explicitly positions against
  OpenClaw: *"ask for approval until you decide to grant more freedom"* vs.
  OpenClaw's *"full autonomy with fewer guardrails."* A **fail-closed trust
  engine**, the creator/assistant-as-separate-entity model, proactive hourly
  self-check-ins. Differentiates on *trust earned progressively* + *the
  assistant is its own entity* (own email/GitHub/Slack identity).

## Security — the clearest gap in the incumbent

OpenClaw's adoption massively outran its security maturity:
- **17% native defense rate** vs adversarial prompt injection (83% succeed
  unhardened).
- Four chained CVEs (CVSS up to 9.6) patched May 2026; a 9-CVE cluster in 4 days
  in March; "Whac-A-Mole" per The Register.
- 135K+ instances exposed on `0.0.0.0`; 800+ malicious skills on ClawHub.

Hermes designed security in proactively but still carries a documented
memory-injection attack surface (poisoned docs persist in SQLite) and
skill-marketplace supply-chain risk. Vellum's "fail-closed trust engine" is the
youngest and least battle-tested but is *architecturally* the most
safety-forward — and notably it's the axis Vellum itself chose to market on.

## Pros / cons at a glance

**OpenClaw** — ✅ ubiquity, ecosystem, model-agnostic, MCP-native, MIT. ❌ severe
security debt, sprawl, breaking-change velocity, recall limits at scale.

**Hermes** — ✅ self-improving skills, broadest model reach, NVIDIA partnership,
proactive security, MIT. ❌ setup "more tedious," perf-overhead reports, memory
injection, small maintainer core, self-improvement gains unverified.

**Vellum** — ✅ progressive-trust safety model, clean creator/assistant identity
framing, user-owned data, strong design DNA (David Vargas: tools-for-thought,
focused-core + extensibility, "we don't speak JSON"). ❌ tiny adoption, youngest
codebase, narrower channels, MCP not confirmed.

## Open opportunity space — observations only (NO decision made)

Surfacing where a from-scratch entrant *could* push, given the above. These are
prompts for the next conversation, not a chosen direction:

1. **Install/onboarding speed as a headline.** The PRD's measurable bar
   (install <1 min) is met loosely by all three; none make sub-minute
   *first-useful-interaction* their identity. Room to own "fastest from zero to
   first real task."
2. **Trust/safety as the default, not a setting.** Vellum chose this axis;
   OpenClaw's CVE record proves the gap is real. A from-scratch assistant could
   make a verifiable, legible trust model its core.
3. **"Great vibes" / interaction quality.** The PRD lists it as a metric; the
   incumbents compete on breadth, not delight. Underserved.
4. **Cost transparency / routing.** "Cost reduction" is a PRD metric; per-agent
   model selection exists but transparent cost accounting is not a headline
   anywhere.
5. **Radical legibility.** OpenClaw (52K commits) and Hermes are large; a core
   small enough to read in an afternoon is a genuine contrast — and matches
   David Vargas's stated "focused-core + extensibility" philosophy.
6. **Design DNA brand-match.** If optimizing for the Vellum audience: lean into
   tools-for-thought heritage, focused core, extensibility-as-empowerment, and
   the "meet the model in the middle" (not-JSON) instinct from his writing.

**Deliberately not decided here:** which of these to pursue, the product shape,
the stack, or the name. That's the next step.
