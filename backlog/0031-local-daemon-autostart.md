---
id: 31
title: "Local background daemon + autostart (no hosting)"
status: closed
priority: medium
type: dx
source: planning
created: 2026-05-27
updated: 2026-05-27
refs: ["ARCHITECTURE.md", "docs/decisions/0002-local-first-terminal-native.md"]
---

## Description
**Supersedes the earlier cloud-deploy plan — hosting is explicitly rejected
(ADR-0002).** Vellum runs entirely on the user's machine; the only remote call is
OpenRouter. This ticket is the local **background daemon** that keeps the
scheduler (#36 cron, #18 check-ins), the Telegram long-poller, and the web/PWA
server running continuously, plus autostart at login.

Mirror the autopilot-harness launchd pattern (macOS) and add a systemd unit for
Linux. The CLI (#34) is an interactive client to the same engine + `~/.vellum`
state, so the daemon and CLI coordinate over one local DB.

## Acceptance criteria
- A long-running local daemon hosting scheduler + Telegram + web, reading/writing
  `~/.vellum` (#39)
- Autostart at login: launchd LaunchAgent (macOS) + systemd user unit (Linux),
  installed by the wizard (#19)
- Start/stop/status controls; logs to `~/.vellum/logs`
- Loopback bind by default; exposing beyond loopback requires VELLUM_API_TOKEN
  (already enforced)
- No container, no cloud, no hosted URL

## Closed 2026-05-28
Delivered in the squashed local-first build, merged to `main` via MR !40 (superseded per-ticket MRs !26–!39).
