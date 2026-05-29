---
id: 69
title: "Render markdown in chat bubbles (code snippets, lists, links) — XSS-safe"
status: closed
prs: ["https://labs.gauntletai.com/trevormiller/vellum-project/-/merge_requests/65"]
priority: low
type: ux
source: trevor
created: 2026-05-28
updated: 2026-05-28
refs: ["0047-frontend-surfaces.md", "0053-frontend-design-revamp.md"]
---

## Description
Chat bubbles render the agent's reply as plain text
(`<div className="whitespace-pre-wrap">{m.text}</div>` in `Chat.tsx`). Agents
routinely return markdown — code snippets, bullet lists, links — which currently
shows as raw asterisks/backticks. Render markdown so replies read well,
especially fenced code blocks.

## Acceptance criteria
- Render assistant message markdown: fenced code blocks (mono, Aurum-styled),
  inline code, lists, bold/italic, links.
- **XSS-safe:** no raw HTML passthrough (react-markdown defaults are safe;
  do NOT enable `rehype-raw`). Links open with `rel="noopener noreferrer"`.
- Aurum theme: code blocks use the surface/border tokens; not a jarring white box.
- User messages can stay plain text (they're the human's literal input) — or
  render too, decide during impl.
- Keep it lightweight: `react-markdown` (pin an exact version ≥ 3 days old per
  dep-hygiene) + minimal plugins (`remark-gfm` for tables/strikethrough if wanted).

## Notes
GREENLIT (2026-05-28) — Trevor confirmed in the test-pass list ("markdown in chat
(we should already have it)"). Build it. Defaults: render assistant bubbles
(user bubbles stay plain), include `remark-gfm` for tables/code, no raw HTML.
