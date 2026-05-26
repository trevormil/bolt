---
id: 6
title: "Persona/compartment core — hard-walled memory + SOUL"
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
The core primitive: a persona with its own SOUL identity, hard-walled memory
(markdown + vector), zero cross-persona visibility, and a thin global layer.

## Acceptance criteria
- Create a persona; it has isolated memory
- Persona A cannot read Persona B's memory (test-enforced)
- Thin global layer holds only shared essentials
