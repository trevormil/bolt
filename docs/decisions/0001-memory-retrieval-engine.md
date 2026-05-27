---
id: 0001
title: Memory retrieval engine — FTS5 BM25 + brute-force cosine, not sqlite-vec (yet)
status: accepted
date: 2026-05-27
---

## Context

ARCHITECTURE.md §8 / §13 names `bun:sqlite` + **`sqlite-vec`** as the per-compartment
retrieval index for the hard-walled persona memory (ticket 0006). At build time:

- `sqlite-vec` has **no stable release** — only `0.1.10-alpha.*` pre-releases exist.
- It is a **native extension** (`.dylib`/`.so` loaded via `loadExtension`), which adds
  cross-platform loading fragility on top of the single laptop CI runner.
- The MVP corpus is tiny: a persona's memory is tens–to-low-hundreds of chunks.
  Brute-force cosine over that is sub-millisecond.

Global CLAUDE.md §10 also discourages adopting alpha/native deps without a real need,
and §2 (simplicity) discourages a native index we don't yet need at this scale.

## Decision

For 0006, implement hybrid retrieval **without** sqlite-vec:

- **BM25 (lexical):** SQLite **FTS5** virtual table (compiled into `bun:sqlite`).
- **Dense (semantic):** embeddings stored as `Float32` BLOBs in a normal table;
  cosine computed in JS over the **active persona's rows only**.
- **Fusion:** Reciprocal Rank Fusion (RRF, K=60) over the two ranked lists.

Persona scoping is enforced **inside** both retrieval paths (`WHERE persona_id = ?`),
not just at the API boundary — defense in depth for the hard-wall invariant.

Embeddings come from an injectable `Embedder` (default: OpenAI `text-embedding-3-small`
via `OPENAI_API_KEY`; a deterministic local embedder is used in tests and as an
offline fallback). With no embedder available, retrieval degrades to BM25-only.

## Consequences

- Zero new runtime dependencies; no native extension to load; hermetic tests.
- Linear-scan dense search is fine at MVP scale but is **not** how we'd serve large
  corpora. The dense path is isolated behind one private method on `PersonaStore`, so
  swapping in `sqlite-vec` (once it has a stable release) is a localized change with no
  caller impact.
- Revisit when a single persona's corpus exceeds ~10k chunks or query latency is felt.
