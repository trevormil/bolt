---
id: 2
title: Local-first, terminal-native agent runtime (OpenClaw-class)
status: accepted
date: 2026-05-27
---

## Context

Vellum to date is a **frontend wrapper**: a local web server + Telegram bot over
`@vellum/engine`, with the chain layer on the Meridian devnet. That's a valid
milestone (shipped in !21), but it under-delivers on the spec's actual target —
rivalling **OpenClaw**, which is a *terminal-native, local-first* personal agent:
it runs on your machine, reads/writes your filesystem, schedules its own work,
and is installed in seconds.

Trevor's direction (2026-05-27): the end goal is **"the full OpenClaw experience"
in the terminal** — filesystem access, agent-settable cron jobs, local skills —
with the web app as a *nice entrypoint* (eventually an installable PWA / native
shell). Crucially: **everything runs locally on the user's machine. Nothing is
hosted.** Local DBs, local filesystem, local scheduler. The only outbound call is
to **OpenRouter** for the LLM. The whole thing is set up through a polished
**install / onboarding** experience — which the spec treats as first-class.

## Decision

Reposition Vellum as a **local-first, terminal-native personal agent** whose
differentiator is the payment-first, compartmentalized BitBadges layer. Concretely:

1. **Local-only deployment. No hosting.** The runtime is a process on the user's
   machine. All state — sqlite DBs, persona memory, wallet index, scheduled
   tasks, logs — lives under a local app data dir (`~/.vellum`, XDG-aware). The
   only remote dependency is OpenRouter (LLM). This **reverses the cloud-deploy
   plan** (ticket #31, DO/k8s) — explicitly rejected.

2. **Terminal (CLI/TUI) is the primary surface.** An OpenClaw-class interactive
   agent in the terminal, driving the same `@vellum/engine` core. The **web app
   becomes a local entrypoint** (and an installable **PWA**); **Telegram** stays
   as an optional remote channel (long-polling — still local-first, no inbound
   hosting). The engine is already surface-agnostic; the CLI is a new thin client.

3. **OpenClaw-parity capabilities, all local + permissioned:**
   - **Filesystem tools** — the agent reads/writes the local FS, scoped to granted
     roots, with human approval for writes and sensitive paths.
   - **Agent-settable scheduled tasks (local cron)** — generalizes the check-in
     scheduler (#18) so the agent (or user) defines arbitrary recurring tasks that
     run agent work locally.
   - **Skills / MCP tools** — local tool registry + MCP client (the OpenClaw
     "skills" analog).

4. **A capability / permission model is the trust spine.** Filesystem + cron + a
   long-running local daemon is a far larger blast radius than a web wrapper.
   Trust-first (fail-closed, scoped grants, approval gates, everything in the
   proof-of-action ledger) becomes load-bearing, not aspirational.

5. **Install + onboarding is a headline feature, not a footnote.** One command:
   install the runtime, create `~/.vellum`, collect the OpenRouter key, generate
   or import the agent signer wallet, create the first persona, set permission
   defaults, and register a **local background daemon** (scheduler + Telegram +
   web) that autostarts. A wizard (terminal + web) drives it.

## Consequences

- **New surface + capability areas** to build: CLI/TUI, filesystem tools, local
  cron, capability/permission model, PWA, local data dir/config, local daemon +
  autostart. Tracked as tickets #34–#39; #19 (install) is elevated to a full
  onboarding wizard and #31 is repurposed from cloud-deploy to local daemon.
- **Security surface grows materially.** FS/cron/daemon need the capability model
  (#37) before they're safe to ship; folds into pre-mainnet hardening (#24).
- **What carries over unchanged:** `@vellum/engine` (already the shared core),
  per-persona compartments, BitBadges payment layer, the local sqlite stack
  (already local), OpenRouter routing, the proof-of-action ledger. The pivot is
  additive — new surfaces + capabilities + packaging — not a rewrite.
- **!21 still ships as-is** (the web/Telegram milestone); the local-first work is
  forward iteration on top of it.
- **Supersedes** the "skip native/terminal" stance in ARCHITECTURE §1/§9 and the
  cloud-hosting assumption in §8.
