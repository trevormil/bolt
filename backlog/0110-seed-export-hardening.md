---
id: 110
title: "Seed export route hardening: visible ledger event + recent-reauth + rate limit"
status: closed
priority: medium
type: security
source: audit-2026-05-29
created: 2026-05-29
closed: 2026-06-04
refs: ["0096-agent-key-at-rest-keychain.md"]
---

## Description
`/api/agent/mnemonic` is loopback-only behind the cross-site guard + token
auth — good. Once authenticated, one GET returns the 24-word seed in JSON.
Three improvements raise the bar:

### 1. No audit trail for a reveal
- A stolen `VELLUM_API_TOKEN` (e.g. `.env` exfil per #0109's risk class) or a
  compromised browser session = one-shot game-over with nothing observable.
- Fix: emit a high-visibility ledger entry (`kind: "security"` or similar) AND
  an observability event on every seed reveal. The user sees it in the
  Activity feed the next time they open the dashboard.

### 2. No recent-reauth requirement
- A long-lived cookie can reveal the seed without a fresh login. The session
  cookie is fine for `/api/personas`; the seed-export deserves a step-up.
- Fix: require the auth proof be < N seconds old (a `lastLogin` timestamp on
  the session, refreshed by an explicit re-auth step the route triggers via
  401 + `WWW-Authenticate: reauth-required`).

### 3. No rate limit
- Multiple revealers per minute is suspicious behavior with no defense.
- Fix: in-process rate limit (e.g. ≤3 reveals/min/persona) is sufficient on a
  single-process daemon.

## Acceptance criteria
- On every successful reveal, a ledger entry + observability event records
  who/when (no value!). A unit test asserts the event fires.
- The route returns 401 with a re-auth marker if the session is older than the
  reveal-window threshold. A test asserts the threshold is enforced.
- Rate limit enforced; test asserts the 4th reveal in a minute is rejected.

## Notes
Security finding #5. Pairs with #0109 (Telegram token hardening) — both
contribute to the "no single secret-token leak is one-shot game-over" posture.

## Status (2026-05-30) — slim version shipped via MR-5
- §1 visible ledger event → **shipped**. Every successful reveal records a
  `kind: "security"` ledger entry + observability event (per persona) with the
  summary "agent seed phrase exported"; the phrase is never logged. The
  Activity feed surfaces it on the next dashboard open.
- §2 recent-reauth requirement → **cut for submission**. Single-user
  loopback-only app — the step-up adds UX friction without a matching threat
  model. Revisit if the app moves to multi-user / network-bound.
- §3 in-process rate limit → **shipped**. 3 reveals per rolling 60s per
  daemon process; the 4th returns 429.

Tests in `packages/web/src/server.test.ts`: ledger+event emission, no phrase
leakage in event meta, and the 4th-reveal 429.

## 2026-06-04 — Closed
§1 + §3 live in production; §2 stays deferred per the submission-scope
rationale above (single-user loopback-only — step-up adds friction without a
matching threat model). If the app moves to multi-user / network-bound, file a
fresh ticket for step-up reauth rather than re-opening this one.
