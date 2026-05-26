---
id: 3
title: "Telegram bot skeleton (grammY)"
status: open
priority: critical
type: feature
source: planning
created: 2026-05-26
updated: 2026-05-26
prs: []
refs: ["ARCHITECTURE.md"]
---

## Description
Primary surface. Inbound message handling, outbound replies, inline buttons, and
link-sending (for sign/approve flows).

## Acceptance criteria
- Bot receives a message and replies
- Inline keyboard buttons round-trip a callback
- Can send a tappable link
