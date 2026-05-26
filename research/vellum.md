---
title: "Vellum AI — Research Dossier"
subject: vellum
date: 2026-05-26
status: raw-research
note: Verbatim subagent dossier. Analysis lives in comparison.md, not here.
key-finding: >
  Vellum already ships its own open-source personal assistant
  (vellum-ai/vellum-assistant, "Personal Intelligence"). The PRD's "do NOT fork
  our assistant" refers to THIS. "Personal Assistant Species" is internal/hiring
  framing; the public category label is "Personal Intelligence."
---

# Vellum AI — Technical and Market Research Dossier

*Research conducted May 2026. All claims sourced; URLs listed at end.*

---

## 1. What Vellum Is: Company Overview

**Founding & team.** Vellum was incorporated in January 2023, entered Y Combinator W23, and is headquartered in New York. Three co-founders: **Akash Sharma** (CEO, ex-McKinsey Silicon Valley, 5 years); **Sidd Seethepalli** (MIT engineer, ex-Quora ML Platform, ex-DataRobot MLOps, Founding Engineer at Dover S19); **Noa Flaherty** (MIT engineer, ex-DataRobot MLOps). All three worked together at Dover (YC S19) building production LLM applications from early 2020. The team is ~23 people (YC profile, 2026). David Vargas Fuertes joined as a fourth Founding Engineer in July 2023 (theorg.com).

**Funding.**
- Seed: $5M (July 2023) — Y Combinator, Rebel Fund, Eastlink Capital, Pioneer Fund, Arash Ferdowsi (Dropbox co-founder), Dharmesh Shah (HubSpot co-founder), others. Total then: ~$9.5M.
- Series A: $20M (July 10, 2025) — led by Leaders Fund, with Socii Capital, Y Combinator, Rebel Fund, Pioneer Fund, Eastlink Capital. Total declared: $29.5M.
- The "Introducing Vellum" blog post (May 7, 2026) cites "$25 million from Dharmesh Shah, Arash Ferdowsi, Rebel Fund, and Y Combinator" — this appears to be a cumulative figure across all rounds inclusive of the personal assistant product phase, not a separate raise. No discrete new round announcement has been found for 2026 as of this research.

**Dual-product structure.** Vellum operates two distinct products under one brand, which makes external analysis confusing:

1. **Vellum Enterprise Dev Platform** — an LLMOps/workflow platform for engineering teams. This is what raised the Series A, what the 150-customer and Redfin/Drata/Headspace references point to, and what the original YC pitch describes.

2. **Vellum Personal Intelligence** (launched publicly May 7, 2026) — an end-user personal assistant product with persistent identity, memory, and proactive outreach. Open-source (MIT license), GitHub repo `vellum-ai/vellum-assistant`, v0.8.4 as of May 22, 2026. This is what `assistant.vellum.ai` and the homepage `vellum.ai` now primarily describe.

The company appears to be in a product-line expansion, not a pivot — the enterprise platform continues operating while the personal assistant launches.

---

## 2. The Personal Assistant Product: "Personal Intelligence"

**Published brand name.** Vellum calls this category "Personal Intelligence" — defined in their GLOSSARY.md as: *"The category we are creating. A new kind of entity: an LLM combined with their own identity, aligned solely with their creator's interests, that grows over time."*

**"Personal Assistant Species" framing.** This phrase does not appear in any published Vellum marketing copy, blog post, GitHub document, or press release found in this research. It is likely an internal or hiring-context framing. The nearest published analogue is the GLOSSARY definition above and the framing "the first Personal Intelligence" in blog copy.

**Product launch.** May 7, 2026. Authored/announced by Anita Kirkovska. Tagline: *"Your own Personal Intelligence."* Positioning: *"Vellum is a Personal Intelligence that belongs to you — you give your assistant a name, a personality, and a world to learn, and from that moment forward they are shaped entirely by you."*

**Explicit competitor positioning.** The product page names **OpenClaw** directly: Vellum "ask[s] for approval until you decide to grant more freedom" while OpenClaw offers "full autonomy with fewer guardrails." This trust-progressive model is a stated differentiator.

**Core vocabulary (from GLOSSARY.md, primary source):**
- **Assistant**: *"A specific instance of a Personal Intelligence. Every assistant has their own name, identity, memory, and capabilities. They are not a chatbot, not a copilot, not an agent."*
- **Creator**: *"The person who guides and is responsible for an assistant. The creator grants permissions, teaches, and is liable for the assistant's actions, but the assistant acts as their own entity, not as the creator."*
- **Memory**: *"Persistent, structured knowledge of their creator — their preferences, their history, the world around them."*
- **Skill**: *"A capability the assistant can learn and use. Skills are modular and can be added, removed, or updated...encompasses tools."*
- **Trust Rules**: *"Policies governing what assistants can do autonomously without the creator's consent."*

**Four design principles (from the launch post):** Inviting (accessible everywhere), Yours (user owns code and data, self-hostable), Distinct (individual personality), Trust-seeking (earns autonomy progressively).

**Technical architecture (from README.md and docs):**

*Working memory* — four persistent markdown files loaded into each conversation context:
- `essentials.md` — critical facts
- `threads.md` — open commitments
- `recent.md` — immediate context
- `buffer.md` — raw incoming information

*Long-term memory* — a knowledge graph in a vector database, hybrid retrieval (BM25 sparse + dense embeddings), memory items typed as identity/preferences/projects/events with source attribution and deduplication. Consolidation process runs every 4 hours (described as analogous to sleep-based memory consolidation in biological systems).

*Identity layer* — `SOUL.md` defines the assistant's personality. During onboarding the assistant observes the creator's communication patterns and writes its own personality files. Per-user `NOW.md` acts as an ephemeral scratchpad for current focus.

*Proactivity* — the assistant "checks in with itself" hourly, reviews notes for unfinished work or upcoming deadlines, sends messages proactively without user prompting across connected channels.

*Security model* — described as "fail-closed trust engine." Actor identity resolved once per session (per README: "guardian, trusted, or unknown" though GLOSSARY only exposes Trust Rules, not these labels directly). Credentials stored in secrets vault; never passed to the model. All tool execution in sandboxed environments.

*Multi-provider LLM* — Claude (Anthropic), OpenAI, Google Gemini, Ollama. Local embeddings via ONNX by default.

*Channels* — macOS app (Swift, 20.2% of codebase), Telegram, Slack, web app, CLI, Chrome Extension. iPhone supported at launch; Android/Windows on roadmap. The assistant has its own email address, GitHub account, and Slack handle — it operates as a separate entity, not as an impersonator.

*Skills/plugins* — manifest-driven (SKILL.md + TOOLS.json), injected at runtime. 60+ skills out of the box. Sandboxed execution.

*Deployment modes* — Managed (Vellum Cloud, encrypted/isolated per user) or Local (fully on-machine, self-hosted).

**Stack language breakdown (GitHub repo):** TypeScript 78.5%, Swift 20.2%, Shell 0.8%, JS/CSS/HTML ~0.3%. MIT license.

**GitHub traction (as of May 22, 2026):** 486 stars, 73 forks. Latest release v0.8.4. Active Discord community.

---

## 3. Enterprise Dev Platform: Architecture and Market

**Platform pillars:**
1. **Prompt Management** — centralized templating with Jinja support, variable reuse, version history, environment promotion (dev → staging → prod).
2. **Workflow Orchestration** — visual workflow builder with 12+ node types. Agent Node (launched Sep 2025) enables multi-tool capabilities with automatic schema generation, loop logic, context management. Natural-language workflow generation from voice or text description.
3. **Evaluations** — test suites with reusable normalized metrics (0–1 scoring), CI/CD integration via API, A/B testing across prompt/model variants.
4. **Observability** — production monitoring for latency, error rates, quality scores; Clickhouse-backed analytics.

**Technical stack:** Kubernetes orchestration, PostgreSQL (relational), Clickhouse (analytics), Python SDK. SDKs also in Go, Node.js, Ruby. Deployment: cloud, self-hosted, hybrid with air-gapped support.

**Security/compliance:** AES-256 GCM (at rest), TLS/HTTPS (transit), SOC 2, HIPAA, GDPR.

**Model support (as of Dec 2025):** 20+ models from 6+ providers — OpenAI GPT-5.2, Google Gemini 3 Flash, Mistral Large 3/Medium 3.1, Claude, Llama 4, and others.

**Pricing (published tiers):**
- Free: $0 / 50 credits/month / 3 hosted apps / 7-day retention
- Pro: $25/month / 200 credits / debugging console / 30-day retention
- Business: $79/user/month / 500 credits/user / unlimited apps / 10 GB history / 1-year retention
- Enterprise: Custom / RBAC / SSO / VPC

**Customers and traction:**
- "Over 150 companies" cited in Series A materials (July 2025)
- Named: Swisscom, Redfin (deployed to "millions of users across 14 markets"), Drata ("7,000+ isolated knowledge bases"), Headspace, DeepScribe, Rely Health, Rentgrata, GravityStack, Seeking Alpha
- Estimated 2024 ARR: ~$3.5M (GetLatka algorithmic estimate, unverified)
- Revenue growth: ~2x between Jan 2024 and mid-2025 (unverified secondary source)
- Early (July 2023): 40 paying customers at $300–400/month, 25–30% MoM growth

---

## 4. David Vargas Fuertes — Background and Design Philosophy

**Education.** MIT, B.S. 2017 (implied by "MIT 2017" reference).

**Career timeline:**
- MIT Media Lab — Software Developer (while at MIT)
- BioWare — Software Engineer
- Bridgewater Associates — Software Engineer
- Mark43 — Software Engineer
- **RoamJS** (dvargas92495) — independent open-source engineer, creator of a comprehensive suite of Roam Research extensions. Built roamjs-discourse-graph, roamjs-workbench (originally Roam42, handed to him by TfTHacker on 04/20/2021), roamjs-com, roamjs-scripts, and many others. This is a significant body of work in the tools-for-thought / personal knowledge management ecosystem.
- **SamePage Network** — Founder, 2022–2023. A real-time collaboration layer for tools-for-thought (connecting Roam, Logseq, Obsidian, etc. so they share a notebook protocol).
- **Vellum AI** — Founding Full-Stack Engineer, July 2023–present.

**GitHub handle:** dvargas92495. Primary languages: TypeScript/JavaScript. Significant open-source output in the Roam Research plugin ecosystem.

**Published writing at Vellum:**
- *"Your AI Assistant Should Work for You, Not Worry You"* (Mar 18, 2026) — security philosophy for AI assistants; "designed with one assumption: what if the AI tried to work against you?"
- *"Built-In Tool Calling for Complex Agent Workflows"* (Sep 18, 2025) — product update introducing Agent Node
- *"We Don't Speak JSON"* (Sep 15, 2025) — argues against forcing LLMs to produce JSON; explores YAML and DSL alternatives; names the "token tax" of JSON schema injection; notes probabilistic/deterministic mismatch
- *"Introducing New Execute Prompt APIs"* (Jan 4, 2024) — API product update

**Design philosophy (synthesized from primary sources):**

From the RoamJS/Roam Garden writing: David articulates a **focused-core + powerful-extensibility** philosophy — platforms should maintain a clear, minimal core and expose APIs/extensibility so users and community build the diversity of functionality. He cites Google vs. Yahoo as the exemplar (simplicity wins). He argues against "low-hanging fruit" features that incur opportunity cost, and for community empowerment through extensibility (NPM/node.js as the model).

From "We Don't Speak JSON": skepticism of cargo-culted conventions (JSON for LLM output) when the underlying model architecture (probabilistic) is mismatched with the use (deterministic structure). He proposes meeting the model in the middle — formats structured enough for programs but natural enough for LLMs.

From the security article framing: zero-trust-by-default thinking — assume adversarial conditions, design fail-closed.

**Connecting thread:** David's arc runs from local-first tools-for-thought (Roam extensions, SamePage) through founding a cross-tool collaboration network, into LLM dev tooling, and now the personal assistant product. The Vellum personal assistant's emphasis on user data ownership, self-hosting, local ONNX embeddings, and the creator-assistant relationship mirrors the local-first, user-owned-data values of the tools-for-thought community he came from. The SOUL.md / NOW.md / memory-as-markdown-files architecture is structurally analogous to how power users in Roam Research manage their personal knowledge graphs.

---

## 5. Market Position: Pros, Cons, Competitive Landscape

**Enterprise dev platform competitors:** LangSmith (LangChain), Humanloop (acqui-hired by Anthropic in 2025, sunsetting), Langfuse (open-source), Adaline, Galileo, Maxim, PromptLayer. Vellum differentiates on end-to-end coverage (prompt mgmt + orchestration + evals + observability in one tool) vs. competitors that tend to be deeper in one layer.

**Strengths (enterprise platform):**
- End-to-end: no need to stitch separate prompt mgmt + eval + observability tools
- Visual builder lowers barrier for non-engineering stakeholders
- Strong enterprise credentials: SOC 2, HIPAA, GDPR, VPC deployment
- Multi-provider model routing (20+ models) with resilience/failover
- Test-driven development philosophy built into product UX

**Weaknesses (enterprise platform):**
- Observability is monitoring-dashboard oriented, not inline blocking (vs. Galileo which has inline guardrails)
- Evaluation metrics latency not sub-200ms for production inline use
- Pricing not fully transparent; enterprise tiers require sales engagement
- Development-bias: infrastructure-as-code teams may find the visual-first approach awkward

**Personal assistant competitive landscape:**
The product page names **OpenClaw** as the primary rival (described as "full autonomy with fewer guardrails"). Other natural comparisons: Anthropic Claude (stateless, no persistent memory), ChatGPT (no user-owned data), Mem (memory-focused but no action layer), Cursor/GitHub Copilot (coding only). Vellum's differentiators: persistent cross-session identity, user-owned data / self-hosting, proactive outreach (no prompt required), and progressive trust model.

**Structural risk:** The brand is now simultaneously an LLMOps enterprise platform and a consumer personal assistant — a rare combination that could create confusion in both markets. The homepage `vellum.ai` as of May 2026 leads with the personal assistant product ("Your Personal Intelligence"), which could confuse enterprise buyers who were evaluating the dev platform.

**SEO / content:** Vellum runs an aggressive content marketing operation — 200+ blog posts, heavy on comparison content ("Best X alternatives," "Y vs Z") with roughly 67% dev-platform focus and 33% personal-assistant focus. This is consistent with an SEO moat strategy documented in third-party analysis.

---

## Sources

- [Vellum Series A announcement — Business Wire](https://www.businesswire.com/news/home/20250710009580/en/Vellum-Raises-$20M-Series-A-to-Bring-Rigor-Speed-and-Reliability-to-Enterprise-AI-Development)
- [Announcing our $20M Series A — Vellum Blog](https://www.vellum.ai/blog/announcing-our-20m-series-a)
- [GitHub: vellum-ai/vellum-assistant repo](https://github.com/vellum-ai/vellum-assistant)
- [GitHub: vellum-ai/vellum-assistant README](https://github.com/vellum-ai/vellum-assistant/blob/main/README.md)
- [GitHub: vellum-ai/vellum-assistant GLOSSARY.md](https://github.com/vellum-ai/vellum-assistant/blob/main/GLOSSARY.md)
- [Introducing Vellum: Your own Personal Intelligence — Vellum Blog (May 7, 2026)](https://www.vellum.ai/blog/introducing-vellum)
- [Vellum homepage — "Your Personal Intelligence"](https://www.vellum.ai/)
- [Vellum Product page](https://www.vellum.ai/product)
- [Vellum Docs: What is Vellum](https://www.vellum.ai/docs/getting-started/what-is-vellum)
- [Vellum Workflow Orchestration product page](https://www.vellum.ai/products/orchestration)
- [Vellum Product Update December 2025](https://www.vellum.ai/blog/vellum-product-update-december-2025)
- [David Vargas author page — Vellum Blog](https://www.vellum.ai/blog/author/david-vargas)
- [David Vargas — The Org (Founding Engineer at Vellum)](https://theorg.com/org/vellum-1/org-chart/david-vargas)
- [David Vargas — LinkedIn](https://www.linkedin.com/in/dvargas92495/)
- [dvargas92495 — GitHub profile](https://github.com/dvargas92495)
- [RoamJS GitHub org](https://roamjs.com/)
- [dvargas92495 Roam Garden — "No. This Should NOT Be Native to Roam"](https://dvargas92495.roam.garden/no.-this-should-not-be-native-to-roam/)
- [We Don't Speak JSON — Vellum Blog (Sep 15, 2025)](https://www.vellum.ai/blog/we-dont-speak-json)
- [TechCrunch: Prompt engineering startup Vellum.ai raises $5M (July 2023)](https://techcrunch.com/2023/07/11/prompt-engineering-startup-vellum-ai/)
- [Vellum — Y Combinator company profile](https://www.ycombinator.com/companies/vellum)
- [Galileo vs Vellum comparison](https://galileo.ai/blog/galileo-vs-vellum)
- [Vellum — GetLatka revenue estimate](https://getlatka.com/companies/vellum.ai)
- [Vellum — Crunchbase](https://www.crunchbase.com/organization/vellum-74f3)
- [Humanloop sunset / Vellum alternatives — context from market search](https://automationatlas.io/answers/best-vellum-alternatives-2026/)
