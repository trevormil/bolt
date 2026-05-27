---
id: 31
title: "Production deployment (DO/k8s) for web + Telegram"
status: open
priority: medium
type: dx
source: planning
created: 2026-05-27
updated: 2026-05-27
prs: []
refs: ["ARCHITECTURE.md"]
---

## Description
The app runs locally only (`bun run start` / `bun run --filter @vellum/telegram dev`).
Stand up a hosted deployment so the web app + Telegram bot run continuously.

Per the labs hosting constraints: GitLab Pages and shared runners are unavailable,
so public hosting = DigitalOcean / k8s (same pattern as Meridian). Secrets
(OpenRouter key, signer mnemonic, Telegram token) via the platform's secret store,
never committed.

## Acceptance criteria
- Containerized web server + Telegram bot
- Hosted (DO droplet or k8s); persistent volume for `vellum.db`
- Secrets injected from the platform, not `.env` in the image
- Reachable URL; bot online
