---
id: 6
title: "Persona/compartment core — hard-walled memory + SOUL"
status: in-progress
priority: critical
type: feature
source: planning
created: 2026-05-26
updated: 2026-05-27
prs: []
refs: ["ARCHITECTURE.md"]
---

## Description
The core primitive: a persona with its own SOUL identity, hard-walled memory,
zero cross-persona visibility, and a thin global layer. Memory IS the
**retrieval/RAG engine** (markdown working files + embeddings + hybrid BM25+dense
recall) — RAG is this layer, not a separate system. Optional per-compartment
document ingestion for grounding.

## Acceptance criteria
- Create a persona; it has isolated memory
- Persona A cannot read Persona B's memory (test-enforced)
- Hybrid retrieval (BM25 + dense) returns relevant memory into context
- Thin global layer holds only shared essentials
- (Optional) ingest a document into a persona's walled corpus and retrieve from it
