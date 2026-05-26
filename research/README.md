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

## Files

| File | What's in it |
|------|--------------|
| [`openclaw.md`](./openclaw.md) | OpenClaw dossier — ~375K-star incumbent; architecture, traction, security debt, pros/cons |
| [`hermes.md`](./hermes.md) | Hermes dossier — resolves to **NousResearch/hermes-agent**; self-improving skills, ~168K stars |
| [`vellum.md`](./vellum.md) | Vellum dossier — company + David Vargas DNA + their own shipped assistant (`vellum-assistant`) |
| [`comparison.md`](./comparison.md) | **Synthesis** — popularity table, technical convergence matrix, real differentiators, open opportunity space |
| [`sources.md`](./sources.md) | Consolidated, de-duplicated source list |

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
