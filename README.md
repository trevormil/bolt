# vellum-project

> A personal assistant built from scratch to rival **OpenClaw** — the Vellum
> hiring-partner project. The product name is a placeholder (`vellum-project`)
> pending a branding decision.

**Status:** early / pre-architecture. Competitive research is in progress under
[`research/`](./research/). No product or architecture decisions have been made
yet.

---

## Project Spec

> Source: Vellum PRD — _"OpenClaw Competitor"_. Tier: Silver. Version 1.
> Category: AI-solution. Last updated 2026-02-16. Technical contact: **David
> Vargas Fuertes**. Reproduced verbatim below.

We believe personal assistants are the future of software and will eat up every
category. But we also imagine a competitive ecosystem of hundreds of personal
assistant providers. Build one from scratch to rival OpenClaw, highlighting any
improvements, tradeoffs, and overall differences with the framework's design.

### Problem & Context

**Business Context**

We are building the first Personal Assistant Species that will rival OpenClaw,
and want as many people with the agency and vision to build the best one as
possible.

**Impact Metrics**

Cost reduction, onboarding, extensibility, task fulfillment accuracy, great
vibes.

### Requirements & Success Criteria

**Functional Requirements**

- Easy for us to set up
- Easy for us to interact with it
- Easy for us to connect at least one application to it

**Performance Benchmarks**

- Installation in under a minute

**Code Quality Expectations**

None — use the models.

**Time Constraints**

2–3 days.

**Technical Contact**

David Vargas Fuertes.

### Technology

- **Required Languages:** TypeScript preferred, but can choose any.
- **AI / ML Frameworks:** The LLM providers.
- **Dev Tools:** Up to you.
- **Cloud Platforms:** Up to you.
- **Other Requirements:** No other specific requirements.

### Off-Limits Tech

Do **NOT** just fork our assistant or OpenClaw. Build your assistant from
scratch.

### Submission & AI Policy

- **AI Usage Documentation:** Optional.
- **Required Deliverables:** Source Code · Technical Documentation · Demo Video ·
  Deployment Guide · AI Usage Log.
- **Attachments:** None.
- **Links:** None.

---

## Repository layout

| Path | Purpose |
|------|---------|
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | **The E2E system design** — surfaces, orchestrator + personas, BitBadges payment/vault layer, trust ledger, lifecycle, stack, scope. |
| [`research/`](./research/) | Competitive + landscape research, chosen differentiators, and the BitBadges integration. Start at `research/PRIMER.md`. |
| [`backlog/`](./backlog/) | In-repo tickets (markdown), the work tracker — via the `/ticket` skill. |
| [`docs/runbooks/`](./docs/runbooks/) | Ops runbooks (e.g. the Meridian devnet chain). |
| [`CLAUDE.md`](./CLAUDE.md) | How we work here + key context for agents. |

_(More to come as the project takes shape — still pre-build / planning.)_
