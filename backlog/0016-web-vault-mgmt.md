---
id: 16
title: "Web: vault management + manager signing"
status: closed
priority: high
type: feature
source: planning
created: 2026-05-26
updated: 2026-05-28
prs: []
refs: ["ARCHITECTURE.md"]
---

## Description
View/create vaults, see rules, and request rule changes (human-manager signs).

## Acceptance criteria
- List a persona's vaults + their rules
- Create a vault from the UI (agent-assisted)
- Manager rule-change requires human signature

---

**Closed 2026-05-28 — delivered by #45 (vault revamp) + #27 (Keplr human signing).**
List with gating badges, adaptive create form, and escrow display shipped in #45
slices 1–2; human-signed manager authority (drain + forceful revoke via Keplr)
shipped in #45 slice 4. The original `!20` link was superseded in the stack squash.
"Rule editing" specifically (MsgUniversalUpdateCollection) was a separate concern —
see #28, which is itself superseded by the manager drain-and-recreate design.
