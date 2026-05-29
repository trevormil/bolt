---
id: 110
title: "Seed export route hardening: visible ledger event + recent-reauth + rate limit"
status: open
priority: medium
type: security
source: audit-2026-05-29
created: 2026-05-29
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
