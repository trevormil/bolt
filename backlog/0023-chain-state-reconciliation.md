---
id: 23
title: "Chain-state reconciliation + tx lifecycle (the trust invariant)"
status: open
priority: critical
type: feature
source: audit
created: 2026-05-26
updated: 2026-05-26
prs: []
refs: ["ARCHITECTURE.md", "research/audit/00-summary.md"]
---

## Description
THE core trust invariant (audit M1/M6, fail F-01/F-02/F-07/F-12). Ledger entries
for on-chain actions are written ONLY from chain-confirmed state, never the LLM's
claim. See ARCHITECTURE.md §13 for the full contract.

## Acceptance criteria
- Before broadcast: fetch fresh sequence (LCD), re-query vault/budget from chain
  (no cache), simulate tx (reject pre-flight on sim failure)
- Persist {pending_tx_hash, persona, action, amount} to durable storage BEFORE
  returning control to the LLM
- Async confirmation poller (out of LLM path): poll hash -> CONFIRMED (height+hash)
  or FAILED; the LLM never writes a "confirmed" ledger entry
- Per-persona tx mutex: no 2nd tx until the 1st confirms/fails
- On restart: reconcile all PENDING entries against chain before new work
- Idempotent: query chain before any re-broadcast

## Phase
MVP — cross-cutting, required before vault/payment tickets are trustworthy
