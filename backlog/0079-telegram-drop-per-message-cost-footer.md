---
id: 79
title: "Drop the per-message cost/token footer from Telegram chat replies"
status: closed
priority: low
type: ux
source: trevor
created: 2026-05-29
updated: 2026-05-29
prs: ["https://labs.gauntletai.com/trevormiller/vellum-project/-/merge_requests/71"]
refs: ["0049-telegram-full-surface.md", "0074-telegram-seamless-onboarding-commands.md"]
---

## Description
Every Telegram chat reply appends a cost receipt footer —
`packages/telegram/src/handlers.ts:119-123`:

```ts
// Plain-English reply + a light cost receipt (proof-of-action), unless refused.
const footer = ... : `\n\n· $${r.costUsd.toFixed(4)} · ${r.tokens} tok`;
await ctx.reply(r.reply + footer);
```

So each message ends with e.g. `· $0.0028 · 2673 tok`. Trevor wants this
**removed** — it's noise on a chat surface and the cost data already lives in
the ledger.

## Acceptance criteria
- Telegram chat replies (`onText`) no longer append the
  `· $X · N tok` footer — just the agent's plain-English reply.
- The `/ledger` command keeps its cost/token totals
  (`handlers.ts:150`) — that's the intentional place for spend reporting; this
  change is only the per-message chat footer.
- Update / add a handler test asserting the chat reply has no cost footer.

## Notes
Tiny, surgical change in `handlers.ts`. Cost is still recorded server-side in
the ledger (the footer was redundant "proof-of-action"). Bundle with other
small Telegram polish (#78/#80) into one MR to save a review cycle.
