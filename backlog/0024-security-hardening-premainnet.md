---
id: 24
title: "Security hardening (pre-mainnet, deferred)"
status: open
priority: medium
type: security
source: audit
created: 2026-05-26
updated: 2026-05-26
prs: []
refs: ["ARCHITECTURE.md", "research/audit/00-summary.md"]
---

## Description
Tracked bundle of hardening that gates REAL value, not the devnet demo (audit §02).
Devnet uses worthless tokens, so deferred from MVP — but required before mainnet.

## Acceptance criteria (each a sub-item)
- Memory provenance tags + document-ingest scanning for override-style instructions (T-02)
- Second-channel confirmation for high-value spends (Telegram-takeover, T-06)
- Langfuse trace scrubbing (redact bb1 addrs/keys/PII) + rotate off shared AF key (T-10)
- Web sign-page CSRF + clickjacking headers + SameSite cookies (T-11)
- MCP tool responses treated as untrusted (labeled in prompt; OAuth where available) (T-12)
- Proactive runs read-only by default unless explicitly armed (T-13)
- Hot keys off bare env (encrypted keyring / secret store) for mainnet (T-05)
- Prod RPC redundancy + retry-with-jitter (F-05)

## Phase
Deferred — pre-mainnet

## Progress 2026-05-28 (partial — stays open)
Merged in !40: **T-11** (clickjacking/nosniff/referrer/frame-ancestors headers
+ the Content-Type/nosniff blank-page fix) and **T-13** (read-only proactive
runs; armed-task opt-in, and read-only runs cannot arm). Also added a
cross-site + DNS-rebind guard on the /api auth boundary (CSRF).
Still open: T-02 memory provenance, T-06 second-channel confirm, T-10 Langfuse
trace scrubbing, T-12 untrusted MCP responses (pairs with #46), T-05 keyring,
F-05 RPC redundancy.
