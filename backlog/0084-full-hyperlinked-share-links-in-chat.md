---
id: 84
title: "Generated share links (pay/vote/deposit) must be full https URLs, hyperlinked in chat — not bare /paths"
status: closed
priority: medium
type: ux
source: trevor
created: 2026-05-29
updated: 2026-05-29
prs: ["https://labs.gauntletai.com/trevormiller/vellum-project/-/merge_requests/71"]
refs: ["0067-agent-request-tools.md", "0063-vault-deposit-requests.md", "0014-payment-requests.md"]
---

## Description
When the agent mints a shareable link (pay / vote / deposit sign pages via the
`request_*` tools, #67), it sometimes emits just a relative `/path` instead of
a full URL. Per `env.ts`, `VELLUM_PUBLIC_URL` controls this: set → absolute
URLs; unset → a bare relative path. Trevor wants the agent to **always post the
full `https://…` link in chat and hyperlink it**, not show `/vote/abc`.

## Acceptance criteria
- Generated share links render as **full `https://…` URLs** in chat output, on
  both surfaces:
  - Web chat — a clickable markdown hyperlink (Chat.tsx already renders
    markdown links; ensure the tool emits `[label](https://…)` or a bare full
    URL that auto-links).
  - Telegram — the complete `https://…` URL (so it's tappable), not a relative
    path.
- Resolve the absolute base reliably: default `VELLUM_PUBLIC_URL` sensibly (or
  derive from the request host / configured public URL) so links work without
  manual env tuning for the common case; keep the loopback-honest behavior
  documented for purely-local daemons.
- The `request_*` tools return absolute URLs end-to-end (tool output → agent
  message → rendered link).
- Coverage: a test asserting a minted pay/vote link is an absolute `https` URL
  and renders as a hyperlink in chat.

## Notes
Today a bare `/path` is "honest" for a loopback-only daemon, but it's not
clickable/shareable, which defeats the purpose of a share link. Decide the base
URL resolution strategy (explicit `VELLUM_PUBLIC_URL` vs. request-derived) —
that's the main design call here.
