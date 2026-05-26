# Competitive Research

Deep research on the personal-assistant landscape we're building into, for the
Vellum "OpenClaw Competitor" project (see the repo-root [README](../README.md)
for the spec).

**Date:** 2026-05-26 · **Status:** complete · **Decisions made:** none (research only)

## Method

Three independent deep-research agents ran in parallel, one per subject, each
tasked to go as technically deep as public primary sources allow plus traction
and pros/cons. Each dossier is reproduced **verbatim**; synthesis is isolated to
`comparison.md` and clearly labeled as analysis. Figures are point-in-time (late
May 2026) and carry per-source caveats noted inline.

## Start here

- **[`differentiation.md`](./differentiation.md)** — 🎯 the capstone: what exists +
  what *our* differentiators are. Candidate differentiators scored, recommended
  thesis, feasibility. **The decision artifact for this stage.**
- **[`PRIMER.md`](./PRIMER.md)** — fast, skimmable reference (TL;DR per product,
  master table, glossary, "where each wins"). Use this throughout the project.
- **[`comparison/00-overview.md`](./comparison/00-overview.md)** — landscape map +
  cross-dimension scorecard tying the eight deep-dives together.

## Files

| File | What's in it |
|------|--------------|
| [`differentiation.md`](./differentiation.md) | 🎯 **Capstone** — candidate differentiators scored, recommended thesis ("the assistant that proves what it did"), feasibility |
| [`PRIMER.md`](./PRIMER.md) | **Quick reference** — TL;DR, master comparison table, glossary, when-each-wins |
| [`landscape.md`](./landscape.md) | **Wider landscape** — consumer giants (ChatGPT/Claude/Gemini/Siri/Copilot) + other OSS + white-space map |
| [`user-needs.md`](./user-needs.md) | **Demand side** — jobs-to-be-done, top frustrations, adoption/abandonment triggers, "great vibes" decoded |
| [`evaluation.md`](./evaluation.md) | **Accuracy & eval** — agent benchmarks, real task-success, failure modes, what improves accuracy |
| [`cost-economics.md`](./cost-economics.md) | **Cost** — what drives $/task, real cost data, reduction levers, pricing models |
| [`comparison/`](./comparison/) | **Eight deep-dive specs** (01–08) + overview/scorecard (00) — one per dimension |
| [`comparison.md`](./comparison.md) | Original **synthesis** — convergence matrix, real differentiators, open opportunity space |
| [`openclaw.md`](./openclaw.md) | OpenClaw dossier — ~375K-star incumbent; architecture, traction, security debt, pros/cons |
| [`hermes.md`](./hermes.md) | Hermes dossier — resolves to **NousResearch/hermes-agent**; self-improving skills, ~168K stars |
| [`vellum.md`](./vellum.md) | Vellum dossier — company + David Vargas DNA + their own shipped assistant (`vellum-assistant`) |
| [`sources.md`](./sources.md) | Consolidated, de-duplicated source list |

### The eight dimension specs (`comparison/`)

| # | Dimension | Leads (per its head-to-head) |
|---|-----------|------------------------------|
| 01 | Architecture & runtime | Hermes (loop discipline) / OpenClaw (multi-agent spec) |
| 02 | Memory, state & identity | Vellum (retrieval + entity-identity) |
| 03 | Extensibility & tooling | Hermes (open standard) / OpenClaw (marketplace) |
| 04 | Interaction surfaces | OpenClaw (voice + Canvas + 22 channels) |
| 05 | Models, cost & performance | Hermes (200+ models, routing) |
| 06 | Security & trust | Vellum by design / OpenClaw weakest by record |
| 07 | Install, onboarding & data ownership | Hermes (most genuinely local) |
| 08 | Ecosystem, maturity & governance | OpenClaw (dominant scale) |

## Headline findings

1. **The PRD's "our assistant" = `vellum-ai/vellum-assistant`** ("Personal
   Intelligence," launched May 7 2026). Off-limits to fork, alongside OpenClaw.
   "Personal Assistant Species" is internal framing; "Personal Intelligence" is
   the public label.
2. **The three converge on the same primitives** — local-first, markdown memory,
   `SOUL.md` identity, multi-provider LLM, skills, multi-channel. That stack is
   **table stakes**, not a differentiator.
3. **Adoption gap is huge:** OpenClaw (~375K★, 3.2M MAU) ≫ Hermes (~168K★) ≫
   Vellum assistant (~486★, brand-new).
4. **Real differentiators:** OpenClaw = breadth/ubiquity; Hermes =
   self-improvement; Vellum = progressive trust + safety (the axis Vellum itself
   markets, and OpenClaw's CVE record shows the gap is real).

See [`comparison.md`](./comparison.md) for the full analysis and the (undecided)
opportunity space.
