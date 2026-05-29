---
id: 78
title: "Sync Telegram chats with the web chat sessions — unified conversation store, resume either way"
status: closed
priority: medium
type: feature
source: trevor
created: 2026-05-29
updated: 2026-05-29
prs: ["https://labs.gauntletai.com/trevormiller/vellum-project/-/merge_requests/73"]
refs: ["0072-multiple-chats-per-persona.md", "0074-telegram-seamless-onboarding-commands.md", "0049-telegram-full-surface.md", "0073-keplr-address-in-agent-context.md"]
---

## Description
Telegram and the web UI keep **two separate conversation stores**:
- Web chat sessions (#72) persist to `engine.conversations` (SQLite
  `conversations` + `conversation_messages`, scoped per persona, with the
  session rail in `Chat.tsx`).
- Telegram has its **own** `Sessions` store
  (`packages/telegram/src/sessions.ts`) that tracks the active persona +
  thread per chat id, NOT backed by `engine.conversations`.

So a conversation started in Telegram is invisible in the web session rail,
and a web conversation can't be resumed from Telegram. Trevor wants them
**synced**: Telegram chats viewable in the web UX, and ideally resume a web
chat from Telegram (bidirectional).

## Acceptance criteria
- Telegram message turns persist as `engine.conversations` records (per
  persona, respecting the memory wall) so they appear in the web session rail
  alongside web chats — clearly labeled as originating from Telegram.
- `/new` in Telegram creates a new conversation in the shared store; `/switch`
  semantics stay coherent across surfaces.
- A web conversation is resumable from Telegram (select / continue an existing
  thread), or — if full bidirectional resume is too large — at minimum the
  Telegram thread maps to a real `engine.conversations` row so history is one
  source of truth.
- The `humanAddress` / "my wallet" context (#73) keeps working on the Telegram
  side if a principal address is known.
- Unit + e2e coverage: a Telegram-originated turn shows up via the
  conversations API; a web conversation's transcript is reachable from the
  Telegram session mapping.

## Notes
The crux is collapsing `telegram/Sessions` onto `engine.conversations` rather
than maintaining a parallel model. Watch the per-persona memory wall — a
Telegram chat must not leak across personas. Decide the display treatment for
provenance (web vs Telegram) in the session rail. Pairs with #79 (TG reply
formatting) and #80 (drop the chat-id field).
