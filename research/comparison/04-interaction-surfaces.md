---
title: "Interaction Surfaces & Channels"
dimension: interaction-surfaces
date: 2026-05-26
status: comparison
note: >
  Point-in-time research (late May 2026). All figures sourced; uncertain claims
  flagged inline. No product decision is made or implied here — this document
  maps the landscape only.
---

# Interaction Surfaces & Channels

## At a glance

| Surface | OpenClaw | Hermes | Vellum |
|---|---|---|---|
| **Messaging channels** | 22+ (bundled adapters) | 22 (v0.14.0) | ~6 (Telegram, Slack, email, web, CLI, Chrome) |
| **Voice** | Yes — wake word ("Hey OpenClaw"), Talk Mode (full-duplex), ElevenLabs TTS | Yes — via messaging (voice memo transcription, Whisper + Edge TTS); no dedicated native voice surface | No dedicated voice surface documented |
| **Interactive UI / Canvas** | Yes — Canvas (port 18793, A2UI declarative protocol, rendered via WKWebView/WebView/browser) | Community web UIs only (hermes-webui, 3.1k stars); no official Canvas equivalent | No Canvas equivalent; Chrome Extension bridges assistant to live tabs |
| **Native macOS** | Yes — menu bar app (Swift, WKWebView), LaunchAgent | CLI/TUI only; no native macOS app | Yes — macOS app (Swift, 20.2% of codebase), menu bar |
| **iOS** | Yes — native SwiftUI wrapper (official) + community apps (QuickClaw, GoClaw) | No official iOS app; accessible via Telegram/Slack bridge; Termux/Android only for on-device | Yes — iPhone app (App Store), listed as supported at launch |
| **Android** | Yes — WebView node + GoClaw community app | Yes — Termux on-device CLI; community hermes-android bridge; F-Droid APK | Roadmap (not yet shipped) |
| **CLI** | Yes (first-class, included in install) | Yes — TUI is the recommended interactive surface; `hermes` CLI + `hermes gateway` + slash-command autocomplete | Yes — CLI is a listed channel |
| **Web chat** | Yes — WebChat built into Gateway (WebSocket, no external dependencies) | Yes — official `hermes web-dashboard` + community hermes-webui (browser-embedded TUI via xterm.js) | Yes — web app at assistant.vellum.ai (managed) or self-hosted |
| **Chrome extension** | Community extensions exist (browser relay); not first-party | Not documented | Yes — official Vellum Assistant extension on Chrome Web Store; bridges assistant to live tabs via DevTools Protocol |
| **Proactivity / initiative** | HEARTBEAT.md — configurable schedule (default every 30 min), active-hours filter, proactive notifications across connected channels | Cron scheduler + HEARTBEAT heartbeat jobs (GitHub issue #15400, April 2026); per-job config; ticks every 60s; delivers to any platform | Hourly self-check-in engine; reviews notes/threads/deadlines; sends proactive messages unprompted across connected channels |
| **Assistant identity on platforms** | Agent gets its own session/credentials per channel; no dedicated email/GitHub/Slack persona documented | No dedicated entity identity documented | Yes — assistant has its own email address, GitHub account, and Slack handle; recipients know they are talking to the assistant, not the creator |

---

## OpenClaw

### Messaging channel breadth

OpenClaw ships the largest bundled channel set of any product in this comparison. As of May 2026, the documented list is:

**Western platforms:** WhatsApp (via Baileys unofficial library), Telegram (grammY), Slack, Discord (discord.js), Signal, iMessage (requires macOS host), IRC, Microsoft Teams, Matrix, Mattermost, Nextcloud Talk, Twitch, Nostr, Tlon, WebChat (built-in)

**Asian platforms:** Feishu/Lark, LINE, Zalo, WeChat, QQ

**Plus:** macOS node, iOS node, Android node — making 22+ distinct adapters (count varies slightly by source; the official docs list 22 text-based channels plus the three native platform nodes)

Each adapter follows a four-responsibility contract: (1) authentication, (2) inbound parsing (text, media, reactions, threads), (3) access-control enforcement (allowlists, DM pairing, group mention rules), and (4) outbound formatting (markdown conversion, chunking, media uploads, presence). This normalization means the agent core never speaks platform idioms — it speaks the adapter interface.

The routing layer is deterministic: `peer > parentPeer > guildId+roles > guildId > teamId > accountId > channel > default`. Practical consequence: one WhatsApp number can serve different DM contacts with different agents at different model tiers (e.g., WhatsApp → fast Sonnet, Telegram → deeper Opus), all from a single Gateway process.

Authentication approaches vary: WhatsApp uses QR-code pairing (Baileys); Telegram uses a bot token (grammY library); Discord uses discord.js OAuth; iMessage requires the macOS host to have Messages.app accessible. The breadth creates correspondingly varied setup friction.

**Known risk:** Approximately one in four updates reportedly breaks response delivery on at least one channel — the cost of maintaining 22+ adapters against upstream platform API changes at high release velocity.

### Voice

Voice is a macOS/iOS/Android-native feature, not a channel adapter:

- **Voice Wake:** "Hey OpenClaw" (or a custom phrase) is always-on on macOS, iOS, and Android — no button press required.
- **Talk Mode:** Full-duplex conversation mode (speech-to-text → agent processing → TTS). Interruption detection is supported — speaking mid-response halts the current output.
- **TTS:** ElevenLabs streaming API. macOS/iOS default to PCM 44,100 Hz; Android uses PCM 24,000 Hz. A system TTS fallback is documented.
- Voice operates inside the main session context, so the agent can invoke tools and retain memory during a voice conversation — not a stripped-down mode.

### Canvas / A2UI interactive UI

Canvas is a second server process alongside the Gateway, bound to port 18793. Agents send HTML containing `a2ui-*` declarative attributes to describe interactive components:

```html
<button a2ui-action="complete" a2ui-param-id="123">Mark Done</button>
```

User interactions on the Canvas send events back to the Canvas server, which relays them to the agent as tool invocations, which can update state and trigger a browser refresh. The agent side is declarative — it does not run arbitrary JavaScript in the browser. Canvas renders via WKWebView (macOS), SwiftUI + WKWebView (iOS), WebView (Android), and any standard browser. Only one Canvas panel is visible at a time; it remembers size and position per session; it auto-reloads on local file changes. The separation from the Gateway means a Canvas crash does not affect message routing.

This is the only feature in this comparison space that provides an agent-driven, stateful interactive UI surface as a first-class primitive.

### Native and mobile

- **macOS:** Official Swift menu bar app. Manages and attaches to the local Gateway. Owns system permissions: Notifications, Accessibility, Screen Recording, Microphone, Speech Recognition. Provides quick-access to the agent without an app switch.
- **iOS:** Official SwiftUI wrapper (first-party). Community alternatives: QuickClaw ("cleanest native iOS interface"), GoClaw (management-oriented, cross-platform).
- **Android:** WebView node (first-party, officially supported). GoClaw also available on Android.
- **Windows/Linux:** Gateway fully supported; companion apps planned but not shipped.

### CLI and WebChat

The CLI is bundled with the install and is the primary setup/debug surface. `openclaw onboard` uses it for the initial wizard. WebChat is built into the Gateway (no install, no external service) — connects via the same WebSocket the other adapters use, with full session/memory/routing parity. It is explicitly documented as a first-verification surface ("check the agent works before connecting external channels") and not marketed as a primary UX.

### Proactivity: HEARTBEAT.md

HEARTBEAT.md is the proactivity primitive. It is a human-readable task checklist the agent evaluates on a configurable schedule (default every 30 minutes). During each tick the agent loads fresh context (connected APIs, email, calendar), evaluates the checklist, and acts or notifies — or sends a `HEARTBEAT_OK` signal when nothing needs attention (preventing notification spam). An active-hours filter prevents off-hours interruptions for non-urgent items. Because heartbeat runs inside the main session context, the agent remembers what it has already surfaced and avoids duplicate alerts. This is a Markdown-file-driven primitive — operators add tasks to HEARTBEAT.md the same way they configure SOUL.md or MEMORY.md.

---

## Hermes

### Messaging channel breadth

Hermes matches OpenClaw's count at 22 platforms as of v0.14.0 (May 16, 2026). The full documented list:

Telegram, Discord, Slack, WhatsApp, Signal, SMS, Email, Home Assistant, Mattermost, Matrix, DingTalk, Feishu/Lark, WeCom (Enterprise WeChat), Weixin/WeChat (personal), BlueBubbles (iMessage bridge), QQBot, Microsoft Teams (added v0.14.0), Google Chat, LINE (added v0.14.0), SimpleX Chat (added v0.14.0), Tencent Yuanbao, and a generic Webhook adapter.

The Gateway runs as a single long-lived daemon. All 22 adapters load into it simultaneously. Operators use the `/platform` slash command from any connected session (CLI or messaging) to inspect and steer individual adapters without restarting the whole process. Each adapter is wrapped in a circuit breaker: repeated retryable failures auto-pause that adapter and send an operator notification to a configured "home channel" on another live platform — a resilience pattern OpenClaw does not document.

Several platforms are notable: Email as a channel means Hermes can receive and send email natively. The generic Webhook adapter means any system that can POST an HTTP request can trigger the agent. SimpleX Chat (added v0.14.0) is an end-to-end encrypted, server-less messaging protocol — unusual to see at this level.

### Voice

Hermes does not ship a dedicated voice wake or talk-mode surface. Voice input is handled at the channel level via voice memo transcription: voice messages sent via Telegram, Discord, or WhatsApp are transcribed (faster-whisper, local) before entering the agent loop. Output TTS is available via Edge TTS (zero paid-API path) or configured TTS providers. The GitHub issue #314 ("Voice Mode — Speech Input/Output for CLI and Gateway Platforms") tracks a dedicated voice feature but its status is open as of May 2026. This is a meaningful gap vs. OpenClaw's always-on wake word.

### Web UI

There is no official Hermes "Canvas" or interactive UI primitive. However, the official `hermes web-dashboard` command launches a browser-accessible interface that embeds the full TUI via xterm.js (WebGL renderer) for pixel-perfect parity with the terminal. Community has filled the gap further — hermes-webui (3.1k stars, 164 releases) is the most popular third-party dashboard and adds tabs not in the official TUI: Memory, Skills, Sessions, Replay, Health, Providers, Gateway, Model, Plugins, plus per-model token/cost analytics.

The TUI itself is documented as the recommended interactive surface: multiline editing, slash-command autocomplete, conversation history, interrupt-and-redirect, streaming tool output.

### Native and mobile

- **macOS:** No native macOS app. The CLI and TUI run on macOS natively. No menu bar companion.
- **iOS:** No official iOS app. The supported targets listed in documentation are Linux, macOS, WSL2, and Android/Termux. iOS users access Hermes via messaging bridges (Telegram, Discord, Slack) to a hosted instance.
- **Android:** Hermes runs natively on Android via Termux (on-device CLI). An F-Droid APK is available. The community hermes-android project provides remote Android device control (WebSocket bridge between the phone and a Hermes server). This is notably more capable on Android than iOS.
- **Windows:** Early beta as of v0.14.0; ~40 known platform-specific issues; PowerShell installer.

### CLI

The CLI is first-class: it is the primary install entrypoint and the default interactive surface. Commands: `hermes` (interactive TUI), `hermes model` (provider picker), `hermes gateway` (start messaging daemon), `hermes tools` (curses-based toolset manager), `hermes skills install <name>`, `hermes proxy` (OpenAI-compatible local proxy, v0.14.0). The CLI is documented as the canonical way to run Hermes; graphical surfaces (web-dashboard, community UIs) are supplements.

### Proactivity: cron + heartbeat jobs

Hermes has two proactivity primitives:

1. **Cron scheduler** — the gateway ticks every 60 seconds. Jobs are specified in natural language or config and can deliver to any connected platform. Covers daily reports, reminders, nightly backups. Cron sessions pass `skip_memory=True` by default.

2. **HEARTBEAT jobs** (GitHub issue #15400, April 2026 feature proposal; status: in-progress) — a more sophisticated primitive: recurring scheduled wake-ups where the agent receives full project context and tools, evaluates current state, decides whether a bounded action is warranted, executes it, and emits a structured summary (inspected-state / action-taken / verification / blocker / next-step). Distinct from blind cron: the agent re-evaluates the world and makes a conservative decision rather than executing a fixed script.

Hermes does not have a documented concept of the assistant contacting external parties (email, GitHub, Slack) under its own identity.

---

## Vellum

### Messaging channels

Vellum ships a focused set of channels rather than aiming for platform breadth: macOS (native Swift app), Telegram, Slack, web app (assistant.vellum.ai), CLI, and Chrome Extension. Email is supported as part of the assistant's own identity (the assistant has and uses its own email address). iPhone was listed as supported at launch (May 7, 2026); Android is on the roadmap but not yet shipped.

The channel list is narrower than OpenClaw or Hermes by design — the product positioning is "a few surfaces done deeply" rather than "every surface." Memory is shared across all connected channels; picking up a conversation on iPhone continues seamlessly from macOS.

### Voice

No dedicated voice wake word or talk-mode surface is documented for Vellum as of May 2026. This is a gap compared to OpenClaw.

### Chrome Extension: Browser Relay

Vellum ships an official Chrome Extension ("Vellum Assistant") on the Chrome Web Store. This is the unique surface in this comparison. The extension acts as a "Browser Relay" — once the user clicks Connect, the assistant can:

- Observe page content on the active tab
- Navigate between pages
- Click elements and fill forms
- Extract structured information

All via Chrome's built-in DevTools Protocol (CDP). The extension communicates with the local Vellum desktop app via Chrome native messaging, and with Vellum's servers (api.vellum.ai). It does not inject scripts into page content or collect browsing data. One-click connect, auto-reconnect on transient disconnects, pause/resume without losing credentials, multi-assistant switching.

Neither OpenClaw nor Hermes ship an official first-party browser extension. OpenClaw has community browser relay extensions (the design is analogous), but they are third-party.

### Native and mobile

- **macOS:** Official Swift app (20.2% of the codebase). Menu bar. The macOS client is the primary development target.
- **iOS:** Official iPhone app on the App Store at launch. The GitHub description reads "across macOS, Telegram, and Slack" without calling out iPhone separately, but the App Store listing and search results confirm it.
- **Android:** On roadmap; not shipped as of May 2026.
- **Windows:** Not documented.

### Web app

The managed deployment serves a web app at assistant.vellum.ai. The self-hosted deployment exposes equivalent functionality on a configured local port. The web app provides full assistant access without the desktop client installed — useful for other devices.

### Proactivity: hourly self-check-in

Vellum's proactivity model is the most opinionated of the three. The assistant does not wait for the user to prompt it:

- **Hourly check-in engine** — every hour, the assistant reviews its own notes (threads.md for open commitments, recent.md for immediate context, the knowledge graph for upcoming deadlines) and decides if anything needs attention.
- **Proactive outreach** — if something warrants attention, it sends a message across connected channels (desktop notification, Slack message, iOS push — whichever makes sense) without the user initiating the conversation.
- **Memory consolidation as a forcing function** — the 4-hour memory consolidation cycle (analogous to sleep-based consolidation, per the docs) means the assistant's hourly reviews are informed by a continuously updated knowledge graph, not just a static task list.

The framing in Vellum's design vocabulary is that the assistant is its own entity that takes initiative — not a tool that responds. The GLOSSARY definition reinforces this: the assistant "acts as their own entity, not as the creator."

### Assistant identity on external platforms

This is Vellum's most distinctive interaction-surface feature: the assistant has first-class accounts on external services under its own name:

- **Own email address** — when the assistant emails someone, recipients see the assistant's identity, not the creator's. It reads and drafts email independently.
- **Own GitHub account** — can open issues, submit PRs, leave comments under its own handle.
- **Own Slack handle** — participates in channels as a distinct Slack member.

The framing is explicit: recipients know they are talking to an assistant, not to the human creator. This creates a novel interaction model where the assistant is an entity that humans outside the creator's network can communicate with. Neither OpenClaw nor Hermes document this pattern; in those systems, the agent acts on behalf of the user's accounts, not its own.

---

## Head-to-head

### "Message me anywhere" breadth vs. focused surfaces

OpenClaw and Hermes are in a statistical tie on messaging-channel count (both at ~22) and each reached that number independently and quickly. For a user whose primary criterion is "reach me wherever I already am," either product satisfies the requirement today. The difference is execution texture: OpenClaw's adapter system is more documented (the four-responsibility contract, the routing specificity cascade), while Hermes adds circuit-breaker resilience and the `/platform` live control command. OpenClaw's breadth comes with the documented cost of frequent per-channel regressions at high release velocity.

Vellum deliberately narrows to six or so surfaces. That is not a gap in ambition — it is an explicit design position: the product page positions this as "a few surfaces done deeply" with cross-channel memory continuity as the value, not platform count.

### Proactivity — three different implementation philosophies

The three products implement proactivity at different architectural levels:

- **OpenClaw's HEARTBEAT.md** is operator-authored: the human writes a task checklist in Markdown, the agent follows it. Active-hours filtering prevents spam. It is predictable and inspectable because the checklist is human-readable and version-controllable.
- **Hermes's cron + heartbeat jobs** is configuration-driven: natural-language cron specs, per-job toolset selection, structured summary schema. The forthcoming HEARTBEAT jobs primitive adds agent decision-making at each tick (evaluate world state → take conservative action) rather than blindly executing a fixed script.
- **Vellum's hourly self-check-in** is the most agent-native: no checklist, no cron spec. The assistant reads its own memory state and decides whether to act. It is less predictable by design — the point is that the assistant applies judgment, not a rule set. The tradeoff is auditability: it is harder to know in advance what the assistant will decide to send.

### The entity-identity angle

Vellum's "the assistant has its own email/GitHub/Slack" feature is qualitatively different from anything in OpenClaw or Hermes. It shifts the assistant from a tool that impersonates the user to an entity with its own accounts that other humans can address directly. This has UX, trust, and potentially legal implications (who is responsible for what the assistant does under its own account?) that the other two products sidestep by keeping the agent in the user's seat.

### Voice and Canvas: OpenClaw's moat

OpenClaw is the only product in this comparison with a production voice interface (wake word, full-duplex, ElevenLabs TTS, interruption detection) and an interactive canvas UI (Canvas/A2UI, port 18793, cross-platform render). These are not easily replicated features — they involve native OS audio capture, wake-word detection models, and a custom declarative UI protocol with native rendering on four platforms. Hermes's voice feature is channel-mediated (transcribe voice memos) rather than native. Vellum has no voice surface documented. For use cases where voice or rich interactive UI matter, the gap is significant.

### "Great vibes" / UX angle

The dossier comparison notes "great vibes" as a PRD metric. On interaction surfaces specifically:
- OpenClaw's Canvas is the only feature that goes beyond "chat box" UX — agents can render rich interactive panels, task boards, dashboards. The visual experience is meaningfully different.
- Vellum's Chrome Extension is the only feature that turns the web browser itself into an agentic workspace — not just a UI skin, but the assistant observing and acting on live web content. That is a qualitatively different interaction feel.
- Hermes's TUI (embedded via xterm.js in the web dashboard) is technically impressive (pixel-perfect WebGL rendering of a terminal) but is not a "vibes" differentiator for non-technical users.

---

## Design considerations for a from-scratch build

These are observations about the surface landscape, not recommendations.

**Channel breadth is table stakes only for one persona.** 22-channel breadth matters if the user genuinely uses 22 channels. For most users, 3–4 channels (the messaging apps and email they actually use) cover the real-world case. A from-scratch build that gets Telegram + Slack + email + web right may cover as much practical surface as 22 adapters maintained unevenly.

**The adapter pattern is well-understood but carries maintenance debt.** Each of the two dominant products independently implemented the same normalized adapter interface. The architecture is sound; the operational cost is tracking upstream platform API changes across 22 surfaces. A narrower channel set trades breadth for maintenance simplicity.

**Voice requires native OS integration.** OpenClaw's voice stack (wake word, full-duplex, ElevenLabs streaming, interruption detection, native audio on macOS/iOS/Android) is not a weekend integration. It requires platform-specific audio session management, a wake-word detection model, streaming TTS, and careful handling of interruption. The channel-mediated approach (Hermes: transcribe voice memos) is substantially simpler but not the same UX.

**Canvas/A2UI solves a real problem** — chat-only interfaces are limiting for structured tasks (task lists, approvals, form fills). The A2UI approach (declarative HTML attributes, no arbitrary JS) is a reasonable security-conscious design. The alternative is browser automation (Playwright) or a dedicated UI framework; both have different tradeoffs.

**The "assistant as entity" framing** (Vellum's own email/GitHub/Slack) changes the security and accountability model. If the assistant has accounts, it needs credentials, those credentials need protection, and actions taken under that identity need audit trails. It is architecturally more complex than impersonation. Whether the UX benefit justifies the complexity is a design decision.

**Proactivity via Markdown checklist vs. via agent judgment** represent different developer ergonomics and user trust levels. The checklist approach (HEARTBEAT.md) is auditable and predictable; the judgment approach (Vellum hourly self-check-in) is more capable but less predictable. A from-scratch build might offer both: a structured schedule layer (inspectable, version-controllable) and an agent-native judgment layer (opt-in, with an audit log of what triggered each outreach).

**The Chrome Extension surface is underutilized by OpenClaw and absent in Hermes.** A browser-relay extension that connects the assistant to live web sessions (CDP access, observe/click/fill/extract) opens use cases (web research, form automation, context awareness from the current page) that messaging-channel adapters cannot serve. Vellum's first-party extension is relatively new and its feature parity with the messaging channels is not fully documented.

---

## Sources

### New (researched for this document)

- [OpenClaw WebChat documentation](https://docs.openclaw.ai/web/webchat) — WebSocket-native built-in web interface; sessions/routing/memory parity with messaging channels
- [OpenClaw Canvas documentation](https://docs.openclaw.ai/platforms/mac/canvas) — Port 18793, A2UI protocol, WKWebView rendering
- [OpenClaw Voice Overlay documentation](https://docs.openclaw.ai/platforms/mac/voice-overlay) — Voice Wake, Talk Mode, ElevenLabs TTS, PCM specs
- [OpenClaw macOS platform documentation](https://docs.openclaw.ai/platforms/macos) — Menu bar app, system permissions, LaunchAgent
- [OpenClaw channels overview](https://docs.openclaw.ai/channels) — Full channel list
- [OpenClaw channel comparison — Telegram vs WhatsApp vs Signal vs Discord (Zen van Riel)](https://zenvanriel.com/ai-engineer-blog/openclaw-channel-comparison-telegram-whatsapp-signal/) — Per-adapter auth and setup notes
- [OpenClaw Canvas deep dive (Skywork AI)](https://skywork.ai/skypage/en/openclaw-canvas-agent-driven-uis/2037091160993644544) — A2UI declarative flow, Canvas isolation from Gateway
- [OpenClaw HEARTBEAT.md guide (openclawplaybook.ai)](https://www.openclawplaybook.ai/guides/openclaw-heartbeat-md-guide/) — 30-min default schedule, active-hours filter, HEARTBEAT_OK signal
- [Hermes Agent Messaging Gateway documentation](https://hermes-agent.nousresearch.com/docs/user-guide/messaging/) — 22-platform list, circuit breaker, /platform command
- [Hermes Agent Messaging Gateway (DeepWiki)](https://deepwiki.com/NousResearch/hermes-agent/7-messaging-gateway) — Gateway daemon architecture, adapter resilience
- [Hermes multi-platform gateway tutorial (hermes-tutorials.dev)](https://hermes-tutorials.dev/blog/gateway-setup/) — Per-adapter operational notes
- [Hermes cron documentation](https://hermes-agent.nousresearch.com/docs/user-guide/features/cron) — Cron scheduler, 60-second tick, platform delivery
- [Hermes HEARTBEAT jobs feature (GitHub issue #15400)](https://github.com/NousResearch/hermes-agent/issues/15400) — Heartbeat jobs proposal; structured summary schema; state-evaluate-then-act design
- [Hermes TUI documentation](https://hermes-agent.nousresearch.com/docs/user-guide/tui) — TUI as recommended interactive surface; slash-command autocomplete; streaming tool output
- [Hermes web-dashboard documentation](https://hermes-agent.nousresearch.com/docs/user-guide/features/web-dashboard) — Browser-embedded TUI via xterm.js; WebGL renderer
- [hermes-webui (GitHub — nesquena)](https://github.com/nesquena/hermes-webui) — Community web dashboard; 3.1k stars; 164 releases; Memory/Skills/Sessions/Cost tabs
- [Hermes Android/Termux documentation](https://hermes-agent.nousresearch.com/docs/getting-started/termux) — On-device CLI on Android
- [hermes-android community project (GitHub — raulvidis)](https://github.com/raulvidis/hermes-android) — Remote Android device control via WebSocket bridge
- [Hermes voice feature request (GitHub issue #314)](https://github.com/NousResearch/hermes-agent/issues/314) — Open feature request for native voice mode; status open as of May 2026
- [Run Hermes on iPhone — The iOS Path Hermes Doesn't Ship (onepilotapp.com)](https://onepilotapp.com/agents/hermes) — iOS gap documentation; bridge-via-Telegram/Slack workaround
- [Hermes Agent on F-Droid](https://f-droid.org/en/packages/com.nousresearch.hermesagent/) — F-Droid APK for Android
- [Vellum Assistant Chrome Web Store listing](https://chromewebstore.google.com/detail/vellum-assistant/hphbdmpffeigpcdjkckleobjmhhokpne) — Official first-party Chrome extension
- [Browser Relay security analysis (boringappsec.com)](https://www.boringappsec.com/p/browser-relay-when-your-ai-assistant) — CDP-based browser access; privacy/security scope
- [Vellum Assistant — App Store (Apple)](https://apps.apple.com/us/app/vellum-assistant/id6759934423) — iOS App Store listing confirming iPhone app at launch
- [Vellum product page](https://www.vellum.ai/product) — Channel list, proactivity description
- [Vellum Assistant page](https://www.vellum.ai/assistant) — Identity, email/GitHub/Slack persona features

### From dossiers (previously sourced)

- [ppaolo.substack.com: "OpenClaw System Architecture"](https://ppaolo.substack.com/p/openclaw-system-architecture-overview) — Gateway, Canvas/A2UI, plugin system internals
- [docs.openclaw.ai/platforms/mac/canvas](https://docs.openclaw.ai/platforms/mac/canvas) — Canvas technical details (same URL, confirmed)
- [docs.openclaw.ai/platforms/mac/voice-overlay](https://docs.openclaw.ai/platforms/mac/voice-overlay) — Voice Wake, Talk Mode
- [GitHub: openclaw/openclaw](https://github.com/openclaw/openclaw) — Platform node documentation, channel list
- [GitHub: NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent) — AGENTS.md; gateway architecture; v0.14.0 release notes
- [GitHub: vellum-ai/vellum-assistant README](https://github.com/vellum-ai/vellum-assistant/blob/main/README.md) — Channel list, proactivity model, memory files
- [GitHub: vellum-ai/vellum-assistant GLOSSARY.md](https://github.com/vellum-ai/vellum-assistant/blob/main/GLOSSARY.md) — Assistant/Creator/Trust Rules vocabulary
- [Hermes Agent Messaging Gateway (NousResearch docs)](https://hermes-agent.nousresearch.com/docs/user-guide/messaging/) — 22 platform list, circuit breaker pattern
- [Hermes release v0.14.0](https://github.com/NousResearch/hermes-agent/releases/tag/v2026.5.16) — Teams, LINE, SimpleX Chat additions
- [Introducing Vellum: Your own Personal Intelligence — Vellum Blog (May 7, 2026)](https://www.vellum.ai/blog/introducing-vellum) — Launch post; proactivity framing; "Inviting/Yours/Distinct/Trust-seeking" principles
