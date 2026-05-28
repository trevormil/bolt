---
id: 30
title: "Optional semantic embeddings for memory retrieval"
status: open
priority: low
type: performance
source: planning
created: 2026-05-27
updated: 2026-05-27
prs: []
refs: ["0006-persona-compartment-core.md"]
---

## Description
Memory retrieval currently defaults to the built-in network-free **hash embedder**
(lexical) — chosen so the system needs only an OpenRouter key (OpenRouter has no
embeddings endpoint). Recall is therefore lexical (hash + BM25), not semantic.

Optionally wire a real semantic embedder for higher-quality recall. `openAiEmbedder`
already exists as an opt-in; a local embedding model (no extra provider) is also an
option. Pass `embedder` to `createEngine` to enable.

## Acceptance criteria
- Pick a semantic embedder (OpenAI vs local model) + document the tradeoff
- Configurable via env; default stays the key-free local embedder
- Measure recall improvement on the eval suite (#22) before/after
