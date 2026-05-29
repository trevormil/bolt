---
id: 72
title: "Multiple chat sessions per persona (spin up as many conversations as needed)"
status: closed
priority: medium
type: feature
source: trevor
created: 2026-05-28
updated: 2026-05-28
prs: ["https://labs.gauntletai.com/trevormiller/vellum-project/-/merge_requests/68"]
refs: ["0047-frontend-surfaces.md"]
---

## Description
Today a persona has effectively one chat thread in the web UI. We want **named
conversations/sessions per persona** — start a new convo, switch between them,
keep history per session — like a normal chat app (ChatGPT-style session list).

The engine already keys conversations by `conversationId` (the orchestrator's
`resolve(conversationId, …)` + the chat flow), so the backbone exists; this is
mostly surfacing it: a session list + create/switch/rename/delete, persisted per
persona, with the active session's history rendered.

## Acceptance criteria
- Create N conversations under a persona; each has its own message history.
- A session list (sidebar/dropdown) to switch the active conversation; new-chat
  button; rename + delete.
- History persists per `conversationId` (survives reload) and is scoped to the
  persona (no cross-persona bleed — respect the persona memory wall).
- Telegram maps a chat to a session sensibly (out of scope to fully unify, but
  don't regress the per-chat `tg_sessions` behavior).

## Notes
Check what the orchestrator/store already persist per conversationId before
adding storage — likely just need a sessions index + the UI. Keep the memory
hard-wall intact (per-persona retrieval, not per-session leakage unless intended).
