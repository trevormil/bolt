---
title: "Differentiation & Feasibility — Capstone Synthesis"
date: 2026-05-26
status: synthesis
note: >
  This is the capstone analysis for the research stage. It synthesizes every
  doc in research/ into candidate differentiators for OUR from-scratch
  assistant, scored against a feasibility/fit rubric, with a recommended
  primary thesis. It is a RECOMMENDATION with options — the final direction is
  the human's call and is NOT locked here.
---

# Differentiation & Feasibility — Capstone Synthesis

The project question for this stage: **what exists, and what are our
differentiators?** The "what exists" half is answered across the
[dossiers](./openclaw.md), the [8 dimension specs](./comparison/00-overview.md),
the [landscape scan](./landscape.md), [user needs](./user-needs.md),
[evaluation](./evaluation.md), and [cost economics](./cost-economics.md). This
doc answers the second half: where the credible differentiation is, and what's
actually buildable in a 2–3 day "use the models" project.

---

## Five forces the research converges on

1. **The cloud giants have commoditized the chat surface.** ChatGPT, Claude,
   Gemini, Copilot are converging on the same memory/agentic/extensibility
   features ([landscape](./landscape.md)). Competing on chat quality means
   racing trillion-dollar R&D budgets — a loss.
2. **The OSS incumbent (OpenClaw) is dominant but trust-damaged.** ~375K★ and
   multi-million MAU, but a public security record (83% prompt-injection success,
   a CVSS-9.9 cluster, 135K exposed instances), documented post-setup fragility
   ("half my time fixing things"), and an "off-putting personality" reputation
   ([security](./comparison/06-security-trust.md), [user-needs](./user-needs.md)).
3. **The core stack is table stakes.** Local-first + markdown memory + SOUL.md
   identity + MCP + skills + multi-channel is the price of entry, not a
   differentiator ([overview](./comparison/00-overview.md)). Building it is not
   the hard part.
4. **The demand side screams "trust."** The #1 abandonment driver is *execution
   hallucination* — "says Done, did nothing." 70%+ of users distrust AI with
   their data. One bad autonomous action collapses trust asymmetrically
   ([user-needs](./user-needs.md)).
5. **Accuracy has a low ceiling, and visibility beats raw rate.** Frontier agents
   sit ~38–42% on hard real-world tasks; errors compound (95%/step → 36% over 20
   steps). Silent failures destroy trust far more than loud ones
   ([evaluation](./evaluation.md)).

**The throughline:** every lens — supply, demand, accuracy, security, the
partner's own positioning, the founder's philosophy — points at **trust** as the
unclaimed, defensible wedge. Not "more capable." *More trustworthy, and able to
prove it.*

---

## Candidate differentiators, scored

Each candidate scored against five gates. ●●● = strong, ●●○ = partial, ●○○ = weak.

| Candidate | Real gap vs incumbents | Hits a real user need | Feasible in 2–3 days ("use the models") | Brand-match (Vellum / Vargas) | Defensible vs giants |
|-----------|:---:|:---:|:---:|:---:|:---:|
| **D1 · Trust & verifiability** (proof-of-action, progressive trust, legible audit ledger) | ●●● | ●●● | ●●● | ●●● | ●●● |
| **D2 · Frictionless onboarding** (<1 min install + first correct task before you close the tab) | ●●● | ●●● | ●●○ | ●●○ | ●●○ |
| **D3 · Cost transparency + zero-config routing** | ●●○ | ●●○ | ●●● | ●●○ | ●●○ |
| **D4 · Interaction "vibes"** (adaptive personality, proactivity that's rare+correct) | ●●● | ●●○ | ●●○ | ●●○ | ●●● |
| **D5 · Knowledge-native** (operates on your notes/files, Khoj-style) | ●●○ | ●●○ | ●●○ | ●●● | ●●○ |
| **D6 · Radical legibility** (a core you can read in an afternoon) | ●●● | ●○○ | ●●● | ●●● | ●●○ |

Notes on the close calls:
- **D2** is feasibility-●●○ because "first task completes *correctly*" leans on accuracy, which has a hard ceiling; the install half is trivially achievable.
- **D4** is need-●●○ because "vibes" is real but fuzzy and hard to demonstrate as a crisp differentiator in a short build.
- **D5** is gap-●●○ because Khoj already occupies "document-first," and it's a narrower market — though it's the single best Vargas brand-match.
- **D6** is need-●○○ because end users don't read source; it's a *trust signal* and a dev-audience play, not a user-felt feature. Strong as a *supporting* trait.

---

## Recommended thesis (decision pending)

> **"The assistant that proves what it did."**
> A personal assistant whose headline isn't capability — it's **verifiable
> trust**. Three pillars, all of which the research shows are unclaimed:
>
> 1. **Proof-of-action, not "Done!"** Every action surfaces the actual tool call
>    + real result (and deterministic verification where the output is checkable),
>    directly attacking the #1 abandonment driver — execution hallucination.
> 2. **Progressive trust.** A legible permission ladder — *read → propose →
>    act-with-approval → autonomous-within-limits* — that matches the real arc of
>    how a user learns to trust an agent, and naturally places human checkpoints
>    exactly where the compounding-error and overconfidence failure modes bite.
> 3. **An auditable trust ledger.** A plain, human-readable record of what the
>    assistant knows, did, and spent — including a live cost meter — so trust is
>    *inspectable*, not asserted.

**Why this one wins the rubric:**
- **Gap:** No incumbent surfaces proof-of-action or an auditable trust ledger to
  users ([evaluation](./evaluation.md) §implications; [landscape](./landscape.md)
  white-space #2). Claude *narrates* memory use; nobody lets you *audit* it.
- **Need:** Directly answers the top documented pains — execution hallucination
  (F1), data distrust (F6), one-bad-action abandonment ([user-needs](./user-needs.md)).
- **Feasible:** It's a **runtime + UX discipline**, not model R&D — capture
  tool-call traces, render them legibly, gate actions, meter cost. Exactly the
  kind of thing "use the models" + 2–3 days rewards. Deterministic verification
  where possible aligns with the highest-evidence accuracy mitigations.
- **Brand-match:** It's David Vargas's published stance ("what if the AI tried to
  work *against* you?" → fail-closed) and *the exact axis Vellum already markets*
  (progressive trust vs OpenClaw's "full autonomy, fewer guardrails"). We'd
  out-execute on the partner's own thesis — strong signal for a hiring project.
- **Defensible:** Against the giants (they won't expose reasoning/tool-calls
  legibly) and against OpenClaw (it directly targets its most-documented weakness).

**Supporting differentiators that compound with it (cheap to add, reinforce the
thesis):**
- **D3 cost meter** — folds into the trust ledger ("here's what this cost").
- **D2 sub-minute install** — the PRD's measurable bar; first impression of a
  trustworthy tool is one that *works immediately*.
- **D6 legibility** — a readable core is itself a trust signal; nearly free given
  the build is small.

**The honest case against / risks:**
- "Trust" can read as abstract — the build must make it *concrete and demoable*
  (the proof-of-action UI is the demo, not a slide).
- Vellum is already pointed here, so we're not inventing the axis — our edge is
  *execution + legibility*, and we must be visibly better, not just present.
- Proof-of-action adds UI surface; in 2–3 days it must stay focused (one or two
  high-value tool integrations done legibly > many done opaquely).

---

## Alternative theses (if you want a different lane)

- **Knowledge-native (D5)** — strongest pure Vargas/tools-for-thought brand-match;
  the assistant lives in your notes/files. Risk: Khoj occupies it; narrower TAM.
- **Frictionless onboarding (D2) as the headline** — lead with the PRD's literal
  benchmark (sub-minute to first real outcome). Risk: thinner story; "fast to
  install" alone isn't a lasting identity.
- **Cost-first (D3)** — lead with transparent, routed, predictable cost. Risk:
  an infra/ops story, less emotionally resonant; weaker as a headline than as
  support.

---

## Feasibility frame (2–3 days, "use the models", TypeScript)

What the recommended thesis implies is buildable, deliberately minimal:
- A small agent runtime (the loop is commodity — write it thin, lean on the model).
- **MCP client** for "connect ≥1 application" (the PRD requirement) — instant
  ecosystem, no bespoke integrations.
- A **proof-of-action layer**: structured capture of every tool call + result,
  rendered legibly to the user; deterministic verification on checkable outputs.
- A **progressive-trust permission gate** (read / propose / approve / auto-within-limits).
- A **trust ledger + cost meter** view.
- One or two genuinely useful integrations done *legibly* (e.g. email or calendar
  via MCP) rather than breadth.
- Sub-minute `bunx`/`npx` install as the opening demo beat.

Explicitly **out of scope** for the build (table-stakes we don't differentiate
on, or breadth traps): 20+ channels, voice, a Canvas UI, a skill marketplace,
multi-agent orchestration. Match parity only where cheap.

---

## What is NOT decided here

- The actual **direction pick** (recommended D1+supports, but yours to choose).
- The **product name** (still `vellum-project` placeholder).
- The **stack specifics** (LangGraph vs thin custom loop; which MCP servers; UI
  shell — TUI vs local web).
- The **demo scenario** (which one or two tasks we showcase).

## The decision in front of us

Pick the primary differentiator (recommended: **D1 · trust & verifiability**,
with D2/D3/D6 as supports). Everything downstream — architecture, the one or two
showcase integrations, the demo script, the name — flows from that choice. The
research stage has done its job: the landscape is mapped and the opportunity is
no longer a guess.
