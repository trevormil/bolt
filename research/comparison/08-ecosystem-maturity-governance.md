---
title: "Dimension 08: Ecosystem, Maturity & Governance"
dimension: ecosystem-maturity-governance
date: 2026-05-26
status: comparison
note: >
  All figures are point-in-time (late May 2026). GitHub metrics and community
  sizes fluctuate daily; treat exact numbers as directionally accurate, not
  precision measurements. No product decision is made or implied here — this
  document maps the landscape only.
---

# Dimension 08: Ecosystem, Maturity & Governance

## At a glance

| Metric | OpenClaw | Hermes | Vellum (vellum-assistant) |
|---|---|---|---|
| GitHub stars (May 2026) | ~373,000–375,000 | ~168,000 | ~481–486 |
| GitHub forks | ~72K–78K | ~27,800 | ~73 |
| Contributors | 1,200–2,300 (sources vary) | 300+ | small core team |
| Age at research date | ~6 months (relaunch Jan 2026) | ~3 months (Feb 25, 2026) | ~3 weeks (May 7, 2026) |
| MAU / scale | 3.2M MAU; 500K+ instances (Apr 2026) | "most-used on OpenRouter" (point-in-time claim) | not published; product brand-new |
| Funding & backing | Bootstrapped; OpenAI now sponsors under MIT | Nous Research ($70M total: seed + $50M Series A) | Vellum AI (YC W23, ~$29.5M total) |
| Governance model | OpenClaw Foundation (non-profit, Austria); RFC process active; full bylaws in draft as of late May 2026 | Corporate-owned by Nous Research; MIT license; no independent foundation | Corporate-owned by Vellum AI; MIT license; no independent foundation |
| Release cadence | ~one release every 1–2 days; YYYY.M.D versioning; three tracks (stable/beta/dev) | ~one major release every 7–10 days; semver (v0.14.0 current as of May 16, 2026) | minor releases roughly weekly; v0.8.4 current as of May 22, 2026 |
| Community | Discord ~176K members; 44K+ ClawHub skills; 1K+ MCP servers; ClawCon SF (1,200 attendees) + NYC + Austin + Miami tours | Discord active; 652+ agentskills.io skills; 80+ ecosystem projects; NVIDIA partnership | Discord active (size not published); 60+ built-in skills; no independent ecosystem events yet |
| Ecosystem revenue layer | 168+ startups; ~$400K/month combined (May 2026 per TrustMRR) | Nous Portal subscription; no third-party SaaS ecosystem reported yet | enterprise LLM dev platform (separate product) sustains the company; no assistant-specific ecosystem revenue reported |
| Maturity tier | Dominant incumbent; battle-tested but security-scarred | Fast-rising credible challenger | Earliest entrant; design-complete but unproven at scale |

---

## OpenClaw

### Adoption trajectory

OpenClaw's rise is genuinely without precedent in open-source history. The project began as "Clawdbot" (Peter Steinberger, November 2025), relaunched as OpenClaw on January 29–30, 2026, and gained ~34,000 stars in the first 48 hours of relaunch. It surpassed React's ten-year GitHub record in early March 2026 (~247K stars), a milestone React took a decade to reach. By late May 2026 the repository sits at approximately 373,000–375,000 stars — the most-starred software project in GitHub history by a significant margin, with 72K–78K forks and between 1,200 and 2,300 contributors depending on counting methodology (the wide range reflects sources aggregating co-authors differently).

Growth has decelerated from the viral phase: one May 2026 snapshot measured ~1,700 new stars per week, consistent with a project that has passed peak virality and settled into organic adoption momentum. Sixty-two tagged releases in a recent 30-day window (per star-history.com data) underscore that development velocity has not decelerated even as star growth has.

MAU reached 3.2 million in April 2026, with 500,000+ running instances across 82 countries (Data Science Collective, April 2026). Website traffic reached 38 million monthly visitors in the same period.

### Ecosystem depth

OpenClaw's ecosystem is the strongest differentiator on this dimension. Key markers as of late May 2026:

- **ClawHub skills marketplace:** 44,000+ community skills (up from 5,700 in February 2026 — roughly an 8x increase in three months). Scale introduces supply-chain risk: Cisco researchers flagged 17% of ClawHub skills as potentially malicious; ~800 malicious skills were removed in a single March sweep. The npm malware parallel is explicit in security reporting.
- **MCP server community:** 1,000+ community-built MCP servers.
- **npm ecosystem:** 88 npm packages directly depend on `openclaw`.
- **Third-party framework derivatives:** NemoClaw (NVIDIA, announced GTC March 17, 2026 — enterprise security layer wrapping OpenClaw); IronClaw (NEAR AI — Rust reimplementation, privacy-first); PicoClaw, ZeroClaw, NanoClaw (lighter forks competing on different tradeoffs). This level of derivative development signals that OpenClaw functions as a platform, not just a tool.
- **Startup ecosystem revenue:** At least 168 startups building on OpenClaw generated approximately $400,000/month combined as of May 2026 (TrustMRR data). Claw Mart alone leads at ~$106,000/month selling curated operator configurations. Hosting startups (Clawhosters.com, ClawHost, exoclaw, Run My Claw) compete on one-click deployment.
- **Conference circuit:** ClawCon SF (January 2026, 1,200 attendees from 34 countries); ClawCon NYC (March, 1,313 RSVPs); ClawCon Austin (March, 756 attendees); ClawCon Miami (March). A Cline $1M open-source grant was announced at ClawCon SF, demonstrating the commercial ecosystem treating ClawCon as a serious industry event.
- **Discord:** "Friends of the Crustacean" server reached 100,000 members in ~six weeks from launch — faster than Midjourney's previous record. As of late May 2026 the server has approximately 176,000 members with ~22,000 online at peak.
- **OpenClaw-RL** (Princeton/Gen-Verse): an academic RL fine-tuning layer, indicating the project has reached the threshold where universities engage with it as infrastructure.

### Governance

OpenClaw's governance trajectory is the most complex of the three products — it passed through a personal project → founder-driven open source → foundation transition in the span of five months.

**Timeline:**
- January 2026: Steinberger announces OpenClaw Foundation formation alongside OpenAI sponsorship agreement. MIT license locked in.
- February 2026: Foundation operational; OpenAI formally sponsors.
- March–April 2026: Steinberger joins OpenAI's Agents team; day-to-day development transitions to community maintainers under Foundation oversight.
- Late May 2026: Foundation filed in Austria as a *gemeinnützige Privatstiftung* (Austrian non-profit foundation, roughly equivalent to a U.S. 501(c)(6)). A draft charter (PR #42 in the foundation RFC repo, `org/openclaw-foundation/rfcs/0001-foundation.md`) is under community review with a June 30, 2026 comment deadline. Formal bylaws not yet published as of research date.

**Current governance mechanisms (operational but not yet fully codified):**
- 5–7 member elected technical steering committee with super-majority (5/7) veto over roadmap decisions.
- Public RFC process (GitHub Discussions with "RFC" label) for all major changes — API breaks, architectural shifts, policy changes. Two-week community discussion window before maintainer vote.
- Quarterly community calls with operator participation (recordings published to Foundation YouTube).
- Board of community-elected maintainers distinct from the steering committee.
- Dave Morin cited as one independent board member; full board membership list not published.

**Assessment:** The governance structure is credibly independent-leaning — the Foundation holds the domain, GitHub org, and trademarks, and is not a corporate entity. The OpenAI sponsorship introduces a potential influence vector worth monitoring, but the MIT license and RFC process provide structural protections. The key open question as of late May 2026 is whether the formal charter ratification (expected by June 30) will cement these informal mechanisms into enforceable bylaws.

### Release cadence and stability

OpenClaw's release velocity is extraordinary: ~one release every 1–2 days, with YYYY.M.D versioning producing release names like `2026.5.19`. Three tracks exist (stable, beta, dev), but in practice the rapid cadence means "stable" is a relative term.

Breaking-change frequency is a documented operational burden for deployers:
- `2026.3.2`: changed default tool profile (breaking for operators relying on exec access); changed ACP dispatch default; removed `api.registerHttpHandler()` in favor of `api.registerHttpRoute()` — three distinct breaking changes in one release.
- `2026.3.22`: shipped with 12 breaking changes alongside 30+ security fixes.
- `2026.3.31`: six breaking changes documented.

Community tooling has emerged specifically to address upgrade risk: ManageMyClaw's "OpenClaw Update Survival Guide," ClawCloud's upgrade checklists, and getopenclaw.ai's per-release upgrade checklists represent an unmet need the project itself hasn't filled. The recommended community advice for production operators: pin a known-good version, update only for security CVEs, and always back up config before any upgrade.

One assessment framed the tradeoff directly: "OpenClaw ships 13 releases in one month — one every two days — which is aggressive for software running unattended business workflows... without staging environments, migration guides, or versioned upgrade paths, that velocity transfers directly to operational burden." (ManageMyClaw, 2026.)

---

## Hermes

### Adoption trajectory

Hermes Agent launched publicly February 25, 2026, three weeks after OpenClaw's viral peak. Its initial growth was described by multiple sources as the fastest-growing agent framework of 2026 in percentage terms: 57,200 stars in six weeks, 95,600 within roughly seven weeks. By May 2026 the repo has approximately 168,000 stars (~1,700/week growth rate in a recent snapshot), 27,800 forks, and 300+ contributors — with v0.14.0 (May 16) crediting 215 community contributors in that single release cycle alone.

Star-history.com ranked it global #46 across all GitHub repositories as of mid-May 2026 — a meaningful position for a three-month-old project.

Nous Research's claim that Hermes is "the most used agent in the world according to OpenRouter" (as cited in an NVIDIA blog post) is a point-in-time assertion on a specific metric (OpenRouter routing volume) rather than overall MAU; OpenClaw's self-reported 3.2M MAU on a broader deployment base represents a different measurement. Both claims can be simultaneously true without contradiction.

The ecosystem has also produced secondary projects: `hermes-agent-self-evolution` companion (3,600 stars, 398 forks); `awesome-hermes-agent` (curated community list); `hermeshub` (third-party skill browser). 80+ ecosystem projects have been counted across registries.

### Ecosystem depth

Hermes's ecosystem is younger but structured around an open standard designed for portability:

- **Skills Hub (agentskills.io):** 652+ community skills across four registries as of v0.13.0. The agentskills.io open standard means skills are theoretically portable across any conforming runtime — a deliberate interoperability play OpenClaw's ClawHub does not match. A HuggingFace skills tap was added in v0.14.0.
- **hermeshub:** Third-party browser/installer for Hermes skills. Third-party skills are scanned before installation — a supply-chain posture explicitly informed by ClawHub's malicious-skill problem.
- **NVIDIA partnership:** RTX AI Garage and DGX Spark integration formally announced. Provides hardware-optimized local model deployment paths (Qwen 3.6 27B/35B cited as primary local models) and commercial legitimacy.
- **Nous Portal:** Launched April 27, 2026. Optional managed subscription (free tier: $0 with $0.10 credit; paid tiers add credit budgets and bundled tools). Generates Nous Research revenue from the Hermes user base without gating core functionality behind a paywall.
- **`hermes proxy` tool (v0.14.0):** Creates an OpenAI-compatible local endpoint backed by any OAuth-authed provider. Enables third-party tools (Codex, Aider, Cline, Continue) to use Claude Pro or SuperGrok without separate API keys — a cross-ecosystem integration vector that could drive adoption via adjacent tooling.

### Governance

Hermes is corporate-owned by Nous Research, MIT-licensed, with no independent foundation. This is the simplest governance structure of the three: all decisions are made by Nous Research employees, primarily founder-level contributors (Teknium leading commit count).

**Concentration risk:** Despite 300+ contributors, commit concentration is pronounced. Teknium alone drove 179 PRs in the v0.8 release window. The April 2026 Hermes Atlas report flags small maintainer core as a bus-factor risk "despite 300+ community contributors." As of early March 2026, 14 distinct contributors merged PRs in one release window — healthier distribution than the headline suggests, but still founder-heavy.

**Alignment incentive that changes the calculus:** Nous Research runs Hermes Agent in production to generate real-world RLHF signal and training data for their model family (Hermes 2/3/4). This dual-use means the company has a strong commercial motivation to keep the agent high-quality and actively maintained — corporate interest aligns with community interest in a way that differs from a project that is purely philanthropic.

**Longevity backing:** $70M total raised ($50M Series A led by Paradigm, April 2025; ~$20M prior seed from Distributed Global, North Island Ventures, Delphi Digital, a16z grant). With 20–41 employees and Paradigm backing, the project has institutional runway. The key longevity risk is not financial abandonment but the possibility of a pivot or acquisition that changes the governance relationship.

**Release cadence:** 14 major versions in approximately three months (February–May 16, 2026) — roughly one every 7–10 days. This is aggressive but notably more structured than OpenClaw's daily cadence. v0.13.0 closed 864 commits, 588 PRs, 282 issues. v0.14.0 closed 808 commits, 633 PRs, 1,393 files changed. No community "survival guide" ecosystem has emerged for Hermes upgrades, suggesting breaking-change frequency is lower in practice. The project is tracking toward a v1.0 stability milestone in mid-to-late 2026 per road-map signals, though no confirmed date is published.

---

## Vellum

### Adoption trajectory

Vellum's `vellum-assistant` launched publicly May 7, 2026 — three weeks before this research was conducted. As of late May 2026 the repository has approximately 481–486 stars and ~73 forks. Multiple sources captured slightly different counts across a three-week window (395, 481, 486) reflecting normal daily fluctuation on a low-count repo.

This is not a meaningful adoption figure in isolation — it reflects the reality of a product that is three weeks old at research date. The contextually relevant fact is that Vellum AI is not a startup making its first bet: the company has $29.5M in funding (YC W23, Leaders Fund Series A July 2025), an enterprise LLM dev platform with 150+ paying customers (Redfin, Drata, Headspace among named accounts), and a co-founder (David Vargas) with a documented track record of building and shipping developer tools (RoamJS, SamePage Network). The assistant's current traction reflects age, not organizational weakness.

### Ecosystem depth

The assistant's ecosystem is effectively pre-launch by ecosystem standards:

- **Skills:** 60+ built-in skills at launch; manifest-driven (SKILL.md + TOOLS.json). No public third-party skills marketplace as of research date.
- **Channels:** macOS, Telegram, Slack, web app, CLI, Chrome Extension, iPhone. The assistant has its own email address, GitHub account, and Slack handle — it operates as a distinct entity rather than an impersonator, which is an identity model none of the other products have shipped.
- **Community:** Active Discord (size not published); 3 issues marked "help wanted" on GitHub as of May 25, 2026.
- **Content marketing:** Vellum operates an aggressive SEO content operation — 200+ blog posts including "10 Best OpenClaw Alternatives in 2026," "8 Best Open-Source Personal AI Assistants in 2026," and related comparison content. This drives organic discovery for the assistant product without depending on a pre-existing community. Estimated 67% dev-platform focus / 33% personal-assistant focus as of research date.
- **No third-party ecosystem revenue layer yet.** The company's revenue comes from the enterprise platform (estimated ~$3.5M ARR as of mid-2025 per GetLatka algorithmic estimate). The assistant is currently a product launch, not a platform with a startup ecosystem on top.

### Governance

Vellum's governance is corporate with no independent foundation — structurally the same as Hermes but with different risk characteristics:

**Alignment incentive:** The enterprise platform and the personal assistant are both Vellum AI products. The platform has enterprise customers and generates revenue; the assistant is new. It is plausible that enterprise platform decisions (sales focus, compliance priorities, acquisition) could affect open-source assistant development in ways that community contributors cannot influence.

**Bus-factor:** The assistant repo has a small core team. The GitHub activity log (99 updates as of May 25, 2026) is active but concentrated. A three-week-old project with no external contributors yet is structurally a single-team project; community contribution dynamics are undetermined.

**Brand tension:** Vellum is simultaneously an LLMOps enterprise platform and a consumer personal assistant. The `vellum.ai` homepage leads with the assistant product as of May 2026. This dual-product structure creates a scenario where the brand could bifurcate or where the assistant product could be deprioritized if enterprise platform needs dominate resource allocation. No announcement or signal of such a pivot exists — this is a structural observation, not a prediction.

**Longevity backstop:** The enterprise platform, with paying enterprise customers, provides organizational stability that a pure open-source project without revenue would not have. The assistant benefiting from — or competing with — platform development resources is an open question.

**Release cadence:** Minor releases roughly weekly (v0.8.0 through v0.8.4 in approximately two weeks post-launch). The cadence reflects active early iteration; the v0.8.x series focused on Memory v2, iOS polish, Twilio calling, and subagent UI refinements. No breaking-change survival guides or operator upgrade friction has been reported — the project is too new for that pattern to have emerged.

---

## Head-to-head

### The adoption gap

The gap between OpenClaw and the field is not a competitive gap — it is a generational gap. OpenClaw has more GitHub stars than the next 20 most-starred agent frameworks combined. Its community (176K Discord, 3.2M MAU, 500K+ instances, ClawCon global conferences) operates at a scale where community momentum is self-sustaining regardless of what any competitor does. Hermes is a credible #2 in absolute terms (168K stars, 300+ contributors, NVIDIA partnership) but represents roughly 45% of OpenClaw's star count at three months of age versus OpenClaw's six. Vellum's assistant, at three weeks old with 486 stars, is not in the same competitive conversation on adoption metrics — its relevance is architectural and conceptual, not adoption-driven.

What is not clear from raw numbers: whether OpenClaw's MAU and instance count translate to sticky, productive use, or whether they include a large number of experimental installs. The security record (17% native defense rate vs prompt injection; CVE clusters; 135K+ exposed instances) suggests a meaningful fraction of the installed base is misconfigured or underused.

### Momentum versus stability tradeoffs

The three products represent three distinct positions on a momentum/stability axis:

**OpenClaw** maximizes momentum at the cost of stability. A release every 1–2 days with recurring breaking changes means production operators must choose between running stale versions (missing security patches) or absorbing frequent migration work. The Foundation and RFC process should eventually impose governance brakes on the worst breaking-change behavior, but as of late May 2026 the charter is not yet ratified.

**Hermes** sits in the middle. One major release every 7–10 days is aggressive by industry standards but meaningfully slower than OpenClaw. The v1.0 tracking signal suggests the team is aware that the current pace is not sustainable for enterprise adoption; the implied stability investment ahead is visible in the roadmap emphasis on "stability milestones."

**Vellum** has no meaningful release stability track record yet — three weeks is not enough signal. The v0.8.x series suggests weekly minor releases, which is appropriate for a just-launched product. Whether this becomes an OpenClaw-style daily cadence or a Hermes-style biweekly cadence is unknown.

### Governance and longevity risk

| Risk factor | OpenClaw | Hermes | Vellum |
|---|---|---|---|
| Creator departure risk | Founder now at OpenAI; Foundation transitioning ownership. RFC process and steering committee limit single-point dependency. | Nous Research team; Teknium commit-concentrated but Paradigm-backed company. | Small team; corporate-owned; no governance transition planned. |
| Funder pivot risk | OpenAI sponsorship creates a potential influence vector; MIT license and Foundation structure limit OpenAI control. | Paradigm/a16z backing aligns with crypto/DeFi interests; Nous Portal subscription ties revenue to agent quality. | Leaders Fund / YC enterprise focus may create pressure to prioritize platform over assistant if both compete for engineering capacity. |
| Supply chain risk | Highest: 44K ClawHub skills with 17% malicious-flag rate (Cisco). Supply chain attacks are a documented, recurring problem. | Moderate: 652 agentskills.io skills with scan-before-install posture; explicitly designed to avoid ClawHub's problem. | Lowest currently: 60 built-in skills, no third-party marketplace. Risk will grow with ecosystem. |
| Governance transparency | Most transparent: public RFC process, Foundation formation underway, MIT locked. Full bylaws pending ratification (due June 30). | Partially transparent: MIT license, all decisions corporate. No public RFC process. | Least transparent: smallest team, no public governance process. Entirely normal for a three-week-old project. |

The highest longevity risk for a developer building on any of these frameworks today is OpenClaw's breaking-change cadence (operational risk, not existential risk), Hermes's bus-factor concentration in Teknium (personal risk for the project's coherent direction), and Vellum's dual-product resource allocation uncertainty (organizational risk not yet observable).

---

## Design considerations for a from-scratch build

These are neutral observations about what the maturity landscape implies for a new entrant. No direction is chosen here.

**The ecosystem bar is already high on breadth.** OpenClaw's 44,000+ skills and 1,000+ MCP servers set a community-contribution expectation that no from-scratch build will match at launch. A new entrant competing on ecosystem size is competing on OpenClaw's strongest axis. A new entrant competing on ecosystem *quality* (curation, safety, interoperability) has more room — as Hermes's scan-before-install posture illustrates.

**The open standard play.** Hermes's choice to build against the agentskills.io open standard (rather than a proprietary ClawHub) is a governance bet: if the standard catches on, Hermes inherits portability. A from-scratch build could adopt the same standard at launch rather than inventing a fourth format.

**Governance documents on day one.** All three projects have governance gaps of some kind — OpenClaw's bylaws are still in draft after six months; Hermes has no process; Vellum is three weeks old. A new entrant that publishes its governance model at launch (even a simple one: "maintained by [entity]; changes require RFC; MIT locked") occupies a position none of the incumbents hold.

**Release cadence as a product signal.** OpenClaw's "every two days" cadence is a marketing story ("most active project in the space") and an operational liability simultaneously. A from-scratch build's initial release policy is a governance statement: biweekly or monthly cadence with explicit deprecation windows signals different priorities than daily shipping.

**The maturity premium.** OpenClaw's CVE history and Hermes's "self-improvement gains unverified" status both reflect the penalty of being very early. A from-scratch build that ships later than these projects can observe the CVE patterns (WebSocket auth, TOCTOU races, missing origin validation, insufficient sandbox) and design against the documented failure modes rather than discovering them under adversarial conditions at scale.

**Community cold-start.** OpenClaw's Discord hit 100K members in six weeks from a viral GitHub moment. That is not reproducible by design — it required an unusual founder story, a $1.3M token bill narrative, and Twitter timing. A from-scratch build's community strategy needs to be sized to what is achievable without a viral moment, which means developer tools, documentation quality, and a clear use-case wedge rather than a community size target.

**The dual-product question.** Vellum's structural tension (enterprise platform vs consumer assistant under one brand) is a cautionary example for any project entering this space as a side product of an existing business. A from-scratch build with a single-product focus avoids this structural distraction — though it also lacks the organizational backstop that Vellum's platform revenue provides.

---

## Sources

### From dossiers (openclaw.md, hermes.md, vellum.md)

- [GitHub: openclaw/openclaw](https://github.com/openclaw/openclaw) — stars, forks, contributor counts, release history
- [OpenClaw Wikipedia](https://en.wikipedia.org/wiki/OpenClaw) — naming history, founding dates, Chinese restriction, Foundation formation
- [Data Science Collective: "355K GitHub Stars — Complete Honest Guide"](https://medium.com/data-science-collective/355k-github-stars-in-5-months-17-defense-rate-the-complete-honest-guide-to-openclaw-28d2f59598e1) — 17% defense rate, 3.2M MAU, 180 startups/$320K revenue (Apr 2026), 17% malicious skills (Cisco)
- [openclawvps.io: "OpenClaw Statistics" (April 2026)](https://openclawvps.io/blog/openclaw-statistics) — stars timeline with dates, CVE cluster data
- [steipete.me: "OpenClaw and OpenAI"](https://steipete.me/posts/2026/openclaw) — Foundation formation, OpenAI relationship
- [Yahoo Finance: "Steinberger joins OpenAI"](https://finance.yahoo.com/news/openclaw-founder-steinberger-joins-openai-223554158.html) — OpenAI sponsorship, MIT lock-in
- [The Register: "OpenClaw security issues"](https://www.theregister.com/2026/02/02/openclaw_security_issues/) — "Whac-A-Mole," CVE history
- [The Hacker News: "Four Flaws Enable Data Theft"](https://thehackernews.com/2026/05/four-openclaw-flaws-enable-data-theft.html) — CVE-2026-44112/44113/44115/44118
- [GitHub: NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent) — primary repo; star/fork counts, language breakdown, release tags
- [Release v0.14.0 (v2026.5.16)](https://github.com/NousResearch/hermes-agent/releases/tag/v2026.5.16) — scope metrics (808 commits, 633 PRs, 215 contributors)
- [Release v0.13.0 (2026.5.7)](https://github.com/NousResearch/hermes-agent/releases/tag/v2026.5.7) — "Tenacity Release"; 864 commits, 588 PRs, 282 issues
- [The State of Hermes Agent — April 2026 (Hermes Atlas)](https://hermesatlas.com/reports/state-of-hermes-april-2026) — star trajectory, bus-factor concerns, performance reports
- [NVIDIA Blog — Hermes Unlocks Self-Improving AI Agents](https://blogs.nvidia.com/blog/rtx-ai-garage-hermes-agent-dgx-spark/) — NVIDIA partnership, OpenRouter claim
- [Nous Research $50M Series A (SiliconANGLE)](https://siliconangle.com/2025/04/25/nous-research-raises-50m-decentralized-ai-training-led-paradigm/) — funding details
- [Hermes Agent Security Threat Model (Repello AI)](https://repello.ai/blog/hermes-agent-security) — CVEs, bus-factor, memory injection
- [GitHub: vellum-ai/vellum-assistant](https://github.com/vellum-ai/vellum-assistant) — primary repo
- [Introducing Vellum: Your own Personal Intelligence (May 7, 2026)](https://www.vellum.ai/blog/introducing-vellum) — launch, 60+ skills, channels
- [Vellum Series A (Business Wire, July 2025)](https://www.businesswire.com/news/home/20250710009580/en/Vellum-Raises-$20M-Series-A-to-Bring-Rigor-Speed-and-Reliability-to-Enterprise-AI-Development) — $20M Series A, ~$29.5M total
- [Vellum Y Combinator profile](https://www.ycombinator.com/companies/vellum) — founding, team size

### New (from fresh May 2026 research)

- [OpenClaw Foundation (openclaw.org)](https://www.openclaw.org/) — NEW: official Foundation site; governance structure description
- [OpenClaw foundation governance explained — RunLobster](https://www.runlobster.com/news/openclaw-foundation-governance-and-future-roadmap-explained) — NEW: RFC process detail, steering committee composition (5–7 members, 5/7 super-majority), Austrian filing, draft charter PR #42
- [Who Owns OpenClaw? — Remote OpenClaw](https://www.remoteopenclaw.com/blog/who-owns-openclaw) — NEW: governance transition narrative, board structure, MIT lock-in detail
- [OpenClaw Update Survival Guide — ManageMyClaw](https://managemyclaw.com/blog/openclaw-update-survival-guide/) — NEW: operator breaking-change burden; "one every two days" framing; recommended update strategy
- [OpenClaw 2026.3.2 breaking changes — Medium (Kanan Rahimov)](https://medium.com/openclawcloud/openclaw-2026-3-2-breaking-changes-what-to-check-before-and-after-you-update-cc9a823bd197) — NEW: specific breaking changes in 2026.3.2 (tool profile defaults, ACP dispatch, plugin HTTP routes)
- [OpenClaw v2026.3.22 Release Guide — BibiGPT/aitodo](https://aitodo.co/blog/posts/openclaw-v2026322-release-update-breaking-changes-guide-2026-en) — NEW: 12 breaking changes + 30+ security fixes in one release
- [ClawCon SF 2026 recap — OpenClaw Blog](https://openclaws.io/blog/clawcon-sf-recap/) — NEW: ClawCon SF details (1,200 attendees, Fort Mason, Jan 15–17)
- [ClawCon SF: Cline's $1M open source grant — Cline](https://cline.bot/blog/clawcon-sf-clines-1m-open-source-grant-meets-openclaw-builders) — NEW: commercial ecosystem treating ClawCon as industry event; Cline grant
- [How OpenClaw Is Reshaping the Startup Ecosystem — VCBacked](https://www.vcbacked.co/blog/openclaw-startup-ecosystem) — NEW: startup ecosystem size, TrustMRR revenue data (~$400K/month, 168 startups)
- [The OpenClaw Ecosystem 2026: NemoClaw, NanoClaw, ClawHub — innFactory](https://innfactory.ai/en/blog/openclaw-ecosystem-clawhub-nemoclaw-nanoclaw-ai-agent-guide/) — NEW: NemoClaw architecture (OpenShell kernel-level sandboxing, YAML policy engine); IronClaw (Rust, NEAR AI); PicoClaw/ZeroClaw/NanoClaw landscape
- [NVIDIA NemoClaw Explained — Particula](https://particula.tech/blog/nvidia-nemoclaw-openclaw-enterprise-security) — NEW: GTC 2026 March 17 announcement date; NemoClaw as plugin/runtime wrapper
- [Friends of the Crustacean Discord 100K — OpenClaw.report](https://openclaw.report/news/openclaw-discord-100k-members) — NEW: Discord 100K milestone in ~six weeks; Midjourney comparison
- [openclaw/openclaw star history — Star History](https://www.star-history.com/openclaw/openclaw/) — NEW: 373.4K stars, 77.5K forks, 2.3K contributors snapshot (May 21, 2026)
- [OpenClaw vs Hermes Agent: Stars, Downloads & Usage — DEV Community (rosgluk)](https://dev.to/rosgluk/openclaw-vs-hermes-agent-stars-downloads-usage-2026-b07) — NEW: live GitHub data comparison; ~1,700 stars/week current cadence for both
- [AI Agent Star Race — Medium (@rosgluk)](https://medium.com/@rosgluk/the-ai-agent-star-race-i-pulled-live-github-data-for-20-frameworks-in-may-2026-b4919dfba5e4) — NEW: star-history global rank #46 for Hermes
- [Skills and agentskills.io — Hermes Agent Blog](https://hermesagents.net/blog/skills-and-agentskills-io/) — NEW: ecosystem standard; skill count across four registries (647+)
- [Hermes Development Roadmap 2026 — Remote OpenClaw](https://www.remoteopenclaw.com/blog/hermes-development-roadmap-2026) — NEW: v1.0 target mid-to-late 2026; roadmap priorities (mobile, pluggable context, stability)
- [Hermes Agent Updates May 2026 — Releasebot](https://releasebot.io/updates/nousresearch/hermes-agent) — NEW: release cadence tracking
- [Nous Portal subscription — KuCoin](https://www.kucoin.com/news/flash/nous-research-launches-nous-portal-subscription-platform-to-integrate-hermes-agent-workflows) — from dossier; also confirmed in fresh search
- [vellum-ai/vellum-assistant activity — GitHub](https://github.com/vellum-ai/vellum-assistant/activity) — NEW: 99 updates as of May 25, 2026; 3 help-wanted issues; last updated May 25, 2026
- [Vellum community page](https://www.vellum.ai/community) — NEW: Discord invite (discord.gg/BbVhBYHPP3) confirmed
