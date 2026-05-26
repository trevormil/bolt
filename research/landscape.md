---
title: "The Wider Landscape: Personal AI Assistants Beyond the Three"
subject: landscape
date: 2026-05-26
status: research
note: >
  Point-in-time snapshot (late May 2026). All figures, pricing, and feature
  claims carry the usual caveat: this space moves fast and specifics change
  without announcement. No product or architecture decision is made or implied
  here — this is raw landscape mapping only.
---

# The Wider Landscape: Personal AI Assistants Beyond the Three

The [three-way comparison](./comparison.md) covers OpenClaw, Hermes, and
vellum-ai/vellum-assistant in depth. This document zooms out: what are the
products real users actually compare against — the consumer giants — and what is
the OSS/framework layer underneath? Where is the field crowded vs. empty?

---

## At a glance

Consumer giants comparison (late May 2026):

| Product | Data model | Extensibility | Memory / personalization | Cost (consumer) | Biggest limitation |
|---|---|---|---|---|---|
| **ChatGPT** | Cloud (OpenAI) | GPTs / Actions; MCP via Codex only (no localhost) | Cross-chat memory + Memory Sources; project-scoped | Free · $8 Go · $20 Plus · $200 Pro | Agent mode web-only; desktop/local app control absent |
| **Claude** | Cloud (Anthropic) | Remote MCP (Pro+); Skills; desktop extensions | Auto-memory all plans (Mar 2026); Project workspaces | Free · $20 Pro · $100/$200 Max | Computer Use macOS-only (research preview); strong model, thin ecosystem |
| **Gemini** | Cloud (Google) | Extensions to Google apps; Gems (custom agents) | Memories (auto); Personal Intelligence (Google-data integration) | Free · $7.99 AI Plus · $19.99 AI Pro · $99.99 AI Ultra | Privacy opt-in required; deep Google lock-in; no local option |
| **Apple Intelligence / Siri** | Hybrid: on-device + Private Cloud Compute | App Intents (developer-declared); Shortcuts | On-device personal context (no cloud training); no persistent cross-session memory yet | Bundled with Apple hardware/OS — no subscription | Delayed rollout; capability explicitly "sharply limited" at launch in sensitive categories; Apple-ecosystem-only |
| **Microsoft Copilot** | Cloud (Microsoft/Azure) | Copilot Connectors; Skills; MCP (federated); Power Platform plugins | M365 semantic index (email, docs, calendar); limited consumer memory | Free · $20/mo Copilot Pro · $19.99/mo M365 Premium bundle | Requires M365 subscription for useful depth; consumer offering is shallow without enterprise graph |

---

## Consumer giants

### ChatGPT (OpenAI)

**What it is as a personal assistant.** ChatGPT started as a chat interface and
has accumulated personal-assistant features incrementally: voice, image
generation, web browsing, a canvas for document work, and — since mid-2025 —
Agent Mode (the rebrand of Operator). Agent Mode lets ChatGPT browse websites,
fill forms, and execute multi-step web tasks autonomously while the user
watches or steps away.

**Core strengths.** Brand recognition and install base; best consumer onboarding
of any AI product; GPT-5 model quality; the richest conversation experience
(voice, image in/out, canvas, code execution); Custom GPTs let anyone publish a
specialized assistant.

**Data model.** Fully cloud. Conversation history, memory, and files live on
OpenAI servers. Memory Sources (rolled out broadly 2026) give users visibility
into what context shaped a given response — saved memories, past chats, or
connected files (including Gmail integration for Plus/Pro).

**Extensibility.** Custom GPTs with Actions (OpenAI-hosted). MCP is supported
via Codex (their coding product) but the main ChatGPT interface cannot connect
to localhost MCP servers without a tunnel (e.g. ngrok). GPTs are platform-locked
— a GPT's integrations only work inside that GPT, not cross-app.

**Memory / personalization.** Cross-chat memory applies by default to all
conversations; project-scoped memory is available; Gmail integration for context
(Plus/Pro). Memory Sources give per-response transparency.

**Cost.** Free ($0) · Go ($8/mo) · Plus ($20/mo) · Pro ($200/mo, includes 5x
higher quota, Deep Research 50 sessions/mo). OpenAI introduced a mid-tier
$100/mo plan in April 2026. Business ($25/user/mo) and Enterprise (custom).

**Biggest limitation.** Agent Mode is web-only — it cannot control your desktop
applications or local files. No local model option. Data is on OpenAI's servers
by definition. Integrations in Custom GPTs are siloed to that GPT and must be
built on OpenAI's own platform.

---

### Claude (Anthropic)

**What it is as a personal assistant.** Claude positions itself as a thinking
partner first, a doer second — but 2026 expanded the doer surface substantially.
Computer Use (launched March 2026 in research preview) gives Claude direct
control over a Mac — mouse, keyboard, browser, and apps — making it capable of
multi-step desktop workflows. Claude Cowork bundles this with memory and Projects
for a cohesive personal-assistant experience.

**Core strengths.** Model quality (Opus 4 / Sonnet 4.6); nuanced long-form
reasoning; Projects for context organization; MCP extensibility at the Pro tier;
explicit transparency about memory usage ("Based on what you told me about your
React project last week...").

**Data model.** Cloud by default. Auto-memory activated for all plans (free
included) in March 2026 — Claude detects and stores preferences/project facts
automatically. Computer Use extends this into local desktop control, but the
session data still routes through Anthropic's cloud.

**Extensibility.** Remote MCP connectors (Pro+); Skills (packaged capability
bundles, similar to OpenClaw skills but fewer); desktop extensions; Google
Workspace and Slack connectors. No public MCP marketplace comparable to ClawHub,
but any MCP server can be wired in.

**Memory / personalization.** Automatic cross-session memory (all plans); Project
workspaces for organized context; persistent threads across Computer Use sessions.
Memory is transparent — Claude narrates what it's pulling from.

**Cost.** Free · $20/mo Pro · $100/mo Max (5x usage) · $200/mo Max (20x usage).
Team plans start at $20/seat/mo (standard) or $100/seat/mo (Premium, includes
Claude Code). Enterprise: 500K context, HIPAA, SSO, custom pricing.

**Biggest limitation.** Computer Use is macOS-only (research preview as of May
2026); no Windows or Linux desktop agent. MCP ecosystem is small compared to
OpenClaw's ClawHub (~44K skills). Strong in model quality; thinner in
multi-channel reach (no native mobile agent mode, no voice overlay).

---

### Google Gemini / Assistant

**What it is as a personal assistant.** Gemini is Google's unified AI layer,
replacing Google Assistant for most consumers. Its personal-assistant advantage
is unique: it has access to a user's entire Google data graph — Gmail, Calendar,
Drive, Photos, YouTube history, Maps, Search history — through the Personal
Intelligence feature. No competitor has this cross-app data integration at scale.

**Core strengths.** Unmatched breadth of personal data (Google ecosystem);
1M-token context window on Pro; multimodal (Gemini Live voice, image in/out,
video); Gems (custom personal agents); Android-native; Deep Research.

**Data model.** Cloud (Google). Personal Intelligence — which connects Gemini to
Google apps — is opt-in and off by default. Free-tier usage can be used to train
models; paid tiers (AI Plus and above) explicitly exclude user data from
training. No local option.

**Extensibility.** Extensions to Google apps (first-party). Gems for custom
agents. Third-party extensions are narrower than GPTs/MCP — the main leverage is
through the Google app integrations, not an open plugin marketplace.

**Memory / personalization.** Memories feature (auto, launched 2026) stores
preferences and past-conversation context. Personal Intelligence is the
higher-order layer — connects to Gmail, Drive, Photos, etc. to answer questions
that require reading your actual life data. Memory import from other AI assistants
is now available.

**Cost.** Free (Gemini 2.5 Flash + limited Pro) · $7.99/mo AI Plus · $19.99/mo
AI Pro (Gemini 3.1 Pro, 1M context, 1,000 AI credits/mo) · $99.99/mo AI Ultra
(reduced from $249.99 at Google I/O 2026; old $249.99 tier still available as
$200/mo for heaviest users). Workspace (business) tiers separate.

**Biggest limitation.** Lock-in is both the strength and the weakness — Personal
Intelligence is only compelling if you're in the Google ecosystem; every
interesting feature routes through Google servers; privacy opt-in raises friction
for adoption. No local/offline mode. Extension marketplace is narrower than
OpenAI's GPTs or MCP.

---

### Apple Intelligence + Siri

**What it is as a personal assistant.** Apple's approach is architectural rather
than product-first: Apple Intelligence is a system-wide layer baked into iOS,
iPadOS, and macOS. Siri gets smarter ambient context (on-screen awareness,
personal data retrieval) and gains a chatbot-style interface in 2026 — but its
killer angle is that the intelligence runs on your device without your data
leaving it, via the Neural Engine and Private Cloud Compute.

**Core strengths.** Privacy by architecture: on-device inference; Private Cloud
Compute for heavier requests; Apple Account is never tied to Siri queries; audio
never leaves the device by default. Deep OS integration: Siri can act across
apps via App Intents without each app needing a special API. Hardware moat: every
recent iPhone/iPad/Mac is the edge device. Always-on ambient availability.

**Data model.** Hybrid. Lightweight tasks run entirely on-device (Neural Engine).
Heavier tasks route to Private Cloud Compute — Apple's on-server inference that
cannot store or share user data, verified via open-source reference
implementation. Apple explicitly does not associate Siri queries with your Apple
Account.

**Extensibility.** App Intents is the framework: third-party apps declare
"intents" (discrete actions Siri can invoke). This requires developer adoption —
apps that don't declare intents are invisible to Siri. Shortcuts remain the
power-user extensibility layer. No open plugin marketplace; all actions are
mediated through Apple's App Intents framework and app review process.

**Memory / personalization.** On-device personal context — Siri can read
on-screen content, pull from Photos, Mail, and Calendar without copying data to
the cloud. Persistent cross-session memory in the ChatGPT/Claude sense is not yet
a shipping feature as of May 2026; Apple's model is ambient awareness rather than
explicit stored facts.

**Cost.** Bundled — no subscription. Requires recent Apple hardware (A17 Pro /
M1 or later). The "cost" is hardware lock-in, not monthly fees.

**Biggest limitation.** Entirely Apple-ecosystem-only; no Android, no Windows, no
web access without an Apple device. Rollout has been delayed repeatedly (V1 Siri
architecture problems; full redesigned Siri arriving in stages through 2026).
Apple is explicitly "sharply limiting" what Siri can do at launch in sensitive
categories (banking, medical). App Intents adoption depends on third-party
developers, which takes years to reach critical mass. No local-model flexibility
— you use Apple's on-device models or nothing.

---

### Microsoft Copilot

**What it is as a personal assistant.** Copilot is Microsoft's AI layer across
the M365 ecosystem (Word, Excel, PowerPoint, Outlook, Teams) with an increasingly
capable consumer face. The personal-assistant story depends heavily on which tier
you're on: the free Copilot consumer app is a thin ChatGPT-like interface; the
paid M365 Copilot (Pro / Business / Enterprise) is a genuinely powerful assistant
with access to your work data graph.

**Core strengths.** Deepest integration with the dominant office productivity
suite; M365 semantic index (email, docs, calendar, Teams history) creates a
powerful enterprise knowledge base; Copilot Cowork (2026) adds agentic, multi-step
actions inside documents and cross-device mobile; 100M+ MAU across all Copilot
products.

**Data model.** Cloud (Azure). The semantic index is built from M365 content.
Copilot Connectors support two models: synced (external content indexed into
Microsoft Graph) and federated (real-time retrieval via MCP without data
movement). Enterprise compliance and data residency controls available at E3/E5
tiers.

**Extensibility.** Copilot Studio for building custom agents; 100+ first-party
Microsoft 365 connectors; Power Platform plugin ecosystem; MCP support via
federated connectors (real-time, no data copy); Skills (reusable instruction
sets). This is the richest enterprise extensibility story of any consumer giant.

**Memory / personalization.** The "memory" is the M365 semantic index — Copilot
knows what's in your inbox, calendar, and documents because it indexes them.
Consumer-tier personalization (outside M365) is shallow. Copilot Tasks (2026)
adds proactive, background task management.

**Cost.** Free Copilot (web/mobile) · $20/mo Copilot Pro (adds M365 app
integration, requires M365 Personal/Family at $7–10/mo additional) · $19.99/mo
M365 Premium (all-in bundle launched Oct 2025) · M365 Copilot Business $18–21/user/mo
· Enterprise $30/user/mo · M365 E7 "Frontier Suite" $99/user/mo (launched May
2026).

**Biggest limitation.** The powerful personal-assistant features require paid M365
subscription — the free Copilot is a thin wrapper. Consumer use outside Microsoft's
ecosystem is weak. Strong at work tasks; weak at life tasks (no Google-equivalent
personal data integration, no local model option). Privacy model is cloud-first
with enterprise controls, not privacy-first by architecture.

---

## Other open-source assistants and agent frameworks

> **End-user personal assistant vs. developer framework:** A personal assistant
> ships as a product — you install it, configure a persona, and talk to it about
> your life. A developer framework is a library or platform you use to build an
> agent; it has no persona, no memory, and no channels out of the box. Several
> projects below blur this line. The distinction matters because "can a
> non-developer use it on day one?" is a meaningful product question.

### Open Interpreter

**Positioning.** The original "give the LLM a REPL" project — lets an LLM run
Python, JavaScript, shell commands, and interact with the OS via natural language.
Positioned as a local, open-source Code Interpreter replacement.

**Status / traction.** One of the early high-star OSS AI agent projects; community
active but the space has moved on to more purpose-built tools (OpenHands for
coding, OpenClaw for personal assistance). Still useful as a raw capability
demonstration.

**Key differentiator.** Maximal local execution — runs code directly on your
machine without containerization by default (which is also its main safety risk).

**Local-first?** Yes. Code runs on your host.

**End-user assistant or framework?** Closer to end-user, but requires comfort with
a terminal and the security implications of running LLM-generated code on bare
metal.

---

### OpenHands (formerly OpenDevin)

**Positioning.** AI-driven software engineering agent. The rebrand from OpenDevin
to OpenHands reflects the broadening mission: "All Hands AI." Built for developers,
not general end-users.

**Status / traction.** Active GitHub repo (GitHub: OpenHands/OpenHands); strong
developer community; v1.6.0+ as of early 2026.

**Key differentiator.** Sandboxed container execution by default — fixing Open
Interpreter's main foot-gun. Handles complex multi-file engineering tasks (write
code, run tests, iterate) autonomously.

**Local-first?** Yes, Docker-based sandbox.

**End-user assistant or framework?** Developer tool / coding agent. Not a personal
life assistant. Narrower scope than OpenClaw/Hermes.

---

### Letta (formerly MemGPT)

**Positioning.** "The platform for building stateful agents" — not itself an
end-user assistant, but a framework that makes memory-centric agents much easier to
build. The original MemGPT paper (2023) introduced the OS-virtual-memory analogy
for LLM context management; Letta is the production evolution.

**Status / traction.** ~13K+ GitHub stars on the main letta-ai/letta repo. Active
development; Letta v1 architecture ships in 2026 with a redesigned agent loop
(deprecating heartbeats, moving to native reasoning). Letta Code is a memory-first
coding agent that sits fourth on Terminal-Bench.

**Key differentiator.** Explicit tiered memory architecture: core memory (always in
context), archival memory (searchable on demand), recall memory (conversation
history). Agents programmatically rewrite their own context blocks — self-improving
memory management. LettaBot shows how this applies to multi-channel personal
assistance (Telegram, Slack, Discord, WhatsApp, Signal).

**Local-first?** Self-hostable; also offers a managed cloud platform.

**End-user assistant or framework?** Framework. You build an agent on Letta; you
don't install Letta and get a persona-ready assistant. LettaBot is the closest to
end-user, but it requires setup.

---

### Khoj

**Positioning.** "Your AI second brain" — a self-hostable personal assistant that
indexes your documents (PDFs, Markdown, Notion, Word, org-mode) and lets you query
them, do deep research, and run automations. Explicitly targets knowledge workers
who want private, local-first AI over their own data.

**Status / traction.** Active GitHub project (khoj-ai/khoj); railway.app and
RepoCloud one-click deployment options show meaningful adoption. Strong in the
Obsidian/Emacs/personal PKM community.

**Key differentiator.** Document-first — designed to ingest and search your personal
knowledge base (not just conversation history). Built-in web search via SearxNG and
a code execution sandbox. Automations run on a schedule. Multi-platform: browser,
Obsidian plugin, Emacs, desktop, mobile, WhatsApp.

**Local-first?** Yes — full self-host option; also a hosted cloud tier. No documents
leave your infrastructure in self-host mode.

**End-user assistant or framework?** End-user assistant. You install it, point it at
your documents, and talk to it. No code required for basic use.

---

### Leon

**Positioning.** An older (pre-2026) OSS personal assistant that positions itself as
a local, skills-based, voice-friendly assistant — deliberately not a cloud product.

**Status / traction.** ~16.9K GitHub stars on leon-ai/leon; development is at the
"2.0 Developer Preview" phase as of early 2026, with new docs not yet ready. Slower
cadence than OpenClaw/Hermes.

**Key differentiator.** Explicit local-model preference; a hybrid approach using
LLM + classification + NLP for speed/accuracy without forcing all reasoning through
a paid API. Deterministic workflows alongside agentic execution.

**Local-first?** Yes — designed to run on your own server without cloud dependency.

**End-user assistant or framework?** End-user, but engineering-level setup required
for v2.0. Consumer onboarding is underdeveloped compared to OpenClaw.

---

### Suna (Kortix)

**Positioning.** An open-source generalist AI agent — explicitly positioned as a
free, self-hostable alternative to proprietary agentic products like Manus AI.
("Suna" is "Manus" reversed.) Focused on complex task automation: browser
automation, file management, web crawling, API integration, shell execution.

**Status / traction.** GitHub: kortix-ai/suna; Apache 2.0 license. Active in
early-mid 2026; growing community attention as the Manus-alternative framing
resonated.

**Key differentiator.** Generalist web agent with browser automation (Playwright),
all command execution sandboxed in Docker, and multimodal capability (text, code,
data). Explicitly designed for autonomous task completion, not conversational
assistance.

**Local-first?** Self-hostable. Docker-based sandbox.

**End-user assistant or framework?** Closer to end-user than a framework, but the
setup bar is Docker + backend deployment. Not yet a one-command install experience.

---

### Agent-builder frameworks (CrewAI, AutoGPT, LangGraph)

These are **not personal assistants** — they are developer infrastructure for
building multi-agent systems. Listed here because they appear in the same
conversation and the distinction is easy to blur.

| Framework | What it is | Key differentiator | Maturity (May 2026) |
|---|---|---|---|
| **LangGraph** | Graph-based agent orchestration (LangChain) | State persistence, human-in-the-loop checkpoints; best for production | v0.4 GA (Apr 2026); dominant in enterprise |
| **CrewAI** | Role-based multi-agent teams | Intuitive task delegation; enterprise observability and scheduling | Widely used; strong at structured workflows |
| **AutoGPT** | Original autonomous-agent experiment | 183K+ GitHub stars (hype-driven); modular block architecture rebuilt in 2024 | Beta; largely eclipsed by AutoGen + CrewAI for real use |

**The critical distinction:** a personal assistant is a product that has a persona,
remembers you, and talks to you. A framework is scaffolding — you write code on top
of it to build the assistant. OpenClaw and Hermes are built using the ideas behind
these frameworks, but the frameworks themselves require significant engineering to
become a personal assistant. This is the gap these OSS frameworks currently leave
open for product-layer builders.

---

## White-space map

Clustering the whole field:

```
CLOUD-CONSUMER
  ChatGPT · Claude (consumer) · Gemini · Copilot
  → Very crowded. Model quality converging. Differentiation: ecosystem depth,
    data integration, brand. All store your data. All subscription-gated for power use.

APPLE-HARDWARE-NATIVE
  Apple Intelligence / Siri
  → Unique (on-device, OS-integrated). Moat = hardware. Non-transferable.

OSS SELF-HOSTED — END-USER PRODUCTS
  OpenClaw · Hermes · vellum-ai/vellum-assistant · Khoj · Leon · Suna
  → Crowding at the top (OpenClaw dominant). Khoj has a document-first niche.
    Leon is slow. Suna has a task-agent niche. Vellum-assistant is brand new.

OSS — MEMORY SPECIALISTS / INFRA
  Letta/MemGPT · Open Interpreter · OpenHands
  → Framework or specialist tool, not consumer product. Real adoption but
    requires developer investment.

AGENT-BUILDER FRAMEWORKS
  LangGraph · CrewAI · AutoGPT · AutoGen
  → Developer infrastructure only. High GitHub star counts, low end-user reach.
```

**Where nobody plays well:**

1. **Privacy-first + truly frictionless.** Apple Intelligence is private but Apple-only
   and feature-limited. OSS tools are private but require setup. Cloud tools are
   frictionless but cloud-only. A tool that is both genuinely private (local model +
   local data option) AND consumer-grade onboarding (sub-60s to first useful
   interaction) does not yet exist.

2. **Trust / explainability as a first-class UX surface.** Vellum-assistant stakes a
   claim here, but it is weeks old. None of the cloud giants expose their reasoning
   or tool calls in a legible, trustable UI. Claude tells you what memory it used;
   nobody shows you the full trust ledger in a way a non-technical user can audit.

3. **Cross-ecosystem personal data integration without Google lock-in.** Gemini's
   Personal Intelligence is powerful but requires being inside Google's world.
   There is no neutral "connect my Gmail, Apple Calendar, Notion, and local files"
   personal data layer — this space is wide open.

4. **Interaction quality / "vibes" as a deliberate design axis.** Every player
   competes on capability. None has made the feel of the interaction — pacing,
   voice, personality coherence over time — a public differentiator. The PRD lists
   "great vibes" as a goal; no incumbent has claimed that phrase.

5. **Always-on proactivity that isn't annoying.** OpenClaw's HEARTBEAT.md and
   Vellum's hourly self-check-in are first attempts. The field is mostly reactive
   (user initiates). A truly ambient assistant that proactively notices and surfaces
   things without overwhelming the user is an unsolved UX problem at every tier.

6. **Radical legibility / readable codebase as a trust signal.** OpenClaw has 52K+
   commits. Hermes is large. Vellum-assistant is small but brand new. A codebase
   small enough to read in an afternoon — combined with a trust model you can audit —
   would be a genuine contrast, especially for the security-conscious user segment.

---

## Implications for our differentiation (observations, not a decision)

The following are observations from this landscape scan. No product direction is
chosen here.

**The cloud giants commoditize the chat surface.** ChatGPT, Claude, and Gemini are
all converging on similar memory, agentic, and extensibility features. Competing
on chat quality alone is a race to match trillion-dollar R&D budgets.

**The OSS layer has an incumbent (OpenClaw) with a security reputation problem.**
OpenClaw's CVE record and 83% adversarial prompt injection success rate are public
knowledge. Users who have read about it carry distrust. This is a real opening for
a trust-architected alternative — Vellum-assistant is trying to claim it, but they
are weeks old and untested.

**Khoj shows that "document-first" is a real and underserved sub-market.**
Knowledge workers with Obsidian vaults, Notion workspaces, and local PDFs want an
assistant that knows their documents — not just chat history. This segment exists
and has purchasing intent.

**The frameworks (LangGraph, CrewAI, Letta) are not competition; they are
infrastructure.** If we build on any of them, we are building the product layer on
top, not replacing them. Worth knowing because "should we use LangGraph?" is a
stack question, not a competitive positioning question.

**Apple's privacy model is the latent user expectation.** Even if most users use
ChatGPT, Apple has trained an entire generation to expect that "AI on my device
should not send my data to a company." A product that delivers on that expectation
without requiring Apple hardware will appeal to that latent belief.

**Pricing complexity is everywhere; pricing clarity is rare.** Every cloud product
has 4–6 tiers with usage limits, add-ons, and enterprise custom pricing. A simpler
offer (one price, clear limits, no surprise overage) would stand out.

---

## Sources

- [ChatGPT Features 2026 — Suprmind](https://suprmind.ai/hub/chatgpt/features/)
- [ChatGPT Pricing 2026 — TechJackSolutions](https://techjacksolutions.com/ai-tools/chatgpt/chatgpt-pricing/)
- [ChatGPT Agent Mode / Operator — USAII](https://www.usaii.org/ai-insights/openai-releases-most-advanced-chatgpt-agent-what-to-expect)
- [ChatGPT and MCP Servers — EvoMap](https://evomap.ai/blog/chatgpt-mcp-support-and-alternatives)
- [Claude Memory 2026 — LumiChats](https://lumichats.com/blog/claude-memory-2026-complete-guide-how-to-use)
- [Claude Computer Use Agent, March 2026 — Tech-Insider](https://tech-insider.org/anthropic-claude-computer-use-agent-2026/)
- [Anthropic adds free memory (March 2026) — MacRumors](https://www.macrumors.com/2026/03/02/anthropic-memory-import-tool/)
- [Claude Pricing 2026 — Finout](https://www.finout.io/blog/claude-pricing-in-2026-for-individuals-organizations-and-developers)
- [Claude Pro vs Max 2026 — Lorka AI](https://www.lorka.ai/knowledge-hub/claude-pro-vs-max)
- [Anthropic: Introducing computer use](https://www.anthropic.com/news/3-5-models-and-computer-use)
- [Google Gemini Personal Intelligence global rollout — Android Authority](https://www.androidauthority.com/google-gemini-personal-intelligence-rollout-3632287/)
- [Google Gemini becomes personal assistant — Android Central](https://www.androidcentral.com/apps-software/google-gemini-is-finally-becoming-the-personal-assistant-we-were-promised/)
- [Google AI updates March 2026 — Google Blog](https://blog.google/innovation-and-ai/technology/ai/google-ai-updates-march-2026/)
- [Gemini Pricing 2026 — Finout](https://www.finout.io/blog/gemini-pricing-in-2026)
- [Apple Intelligence — Apple](https://www.apple.com/apple-intelligence/)
- [Apple Intelligence & Siri in 2026 — Medium](https://medium.com/@taoufiq.moutaouakil/apple-intelligence-siri-in-2026-fe509d8813fd)
- [Apple's all-new Siri: standalone app, chatbot, always-on agent — MacDailyNews](https://macdailynews.com/2026/05/12/apples-all-new-siri-to-get-standalone-app-chatbot-interface-and-always-on-agent-powers/)
- [Apple reveals AI behind Siri's 2026 upgrade — Information Age](https://ia.acs.org.au/article/2026/apple-reveals-the-ai-behind-siri-s-big-2026-upgrade.html)
- [Integrating App Intents with Siri and Apple Intelligence — Apple Developer Docs](https://developer.apple.com/documentation/appintents/integrating-actions-with-siri-and-apple-intelligence)
- [Microsoft Copilot Cowork — Microsoft 365 Blog](https://www.microsoft.com/en-us/microsoft-365/blog/2026/05/05/copilot-cowork-from-conversation-to-action-across-skills-integrations-and-devices/)
- [Microsoft Copilot Tasks — Cloud Wars](https://cloudwars.com/ai/microsoft-copilot-tasks-microsoft-pushes-copilot-from-chatbot-to-personal-ai-agent/)
- [Microsoft Copilot Pricing 2026 — TechJackSolutions](https://techjacksolutions.com/ai-tools/microsoft-copilot-pricing/)
- [Agents, Actions, and Connectors in M365 — Microsoft Learn](https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/ecosystem)
- [GitHub: OpenHands/OpenHands](https://github.com/OpenHands/OpenHands)
- [GitHub: openinterpreter](https://github.com/openinterpreter)
- [GitHub: letta-ai/letta](https://github.com/letta-ai/letta)
- [MemGPT is now Letta — Letta Blog](https://www.letta.com/blog/memgpt-and-letta)
- [Rearchitecting Letta's Agent Loop — Letta Blog](https://www.letta.com/blog/letta-v1-agent)
- [GitHub: letta-ai/lettabot](https://github.com/letta-ai/lettabot)
- [GitHub: khoj-ai/khoj](https://github.com/khoj-ai/khoj)
- [Khoj docs](https://docs.khoj.dev/)
- [GitHub: leon-ai/leon](https://github.com/leon-ai/leon)
- [GitHub: kortix-ai/suna](https://github.com/kortix-ai/suna)
- [LangGraph vs CrewAI vs AutoGPT 2026 — AgixTech](https://agixtech.com/insights/langgraph-vs-crewai-vs-autogpt/)
- [CrewAI vs LangGraph vs AutoGen vs OpenAgents — OpenAgents Blog](https://openagents.org/blog/posts/2026-02-23-open-source-ai-agent-frameworks-compared)
- [Personal AI Assistant Market Report 2026 — Research and Markets](https://www.researchandmarkets.com/reports/6226037/personal-ai-assistant-market-report)
- [State of AI trust in 2026 — McKinsey](https://www.mckinsey.com/capabilities/tech-and-ai/our-insights/tech-forward/state-of-ai-trust-in-2026-shifting-to-the-agentic-era)
- [Best Personal AI Assistants 2026 — Vellum Blog](https://www.vellum.ai/blog/best-personal-ai-assistants-2026)
- [AutoGPT — Significant-Gravitas/AutoGPT](https://github.com/Significant-Gravitas/AutoGPT)
