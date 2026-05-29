---
id: 105
title: "Split server.ts (1472 lines) + untangle auth middleware + remove dead /api/personas/:id/ledger route"
status: open
priority: high
type: refactor
source: audit-2026-05-29
created: 2026-05-29
refs: []
---

## Description
`packages/web/src/server.ts` owns the entire HTTP surface in one
`buildApp()` closure: 1472 lines, ~50 routes, 8+ concerns
(setup/persona/wallet/vaults/payments/deposits/conversations/chat/SPA).
Touching any route requires reading the whole file to confirm which guards
apply.

### 1. Split into route modules
Natural lines exist:
- `src/routes/setup.ts` (370-664)
- `src/routes/personas.ts` (666-725)
- `src/routes/wallet.ts` (727-870)
- `src/routes/mcp.ts` + `src/routes/spend.ts` (871-947)
- `src/routes/vaults.ts` (948-1090)
- `src/routes/payment-requests.ts` (1108-1213)
- `src/routes/deposit-requests.ts` (1220-1289)
- `src/routes/conversations.ts` + `src/routes/chat.ts` (1305-1402)
- `src/routes/agent.ts` (seed export, MCP servers)
- `src/routes/static.ts` (SPA serving, 1413-1444)

`buildApp` becomes ~80 lines (middleware + mount + 404). Each route module
exports `register(app, deps)`.

### 2. Replace 5-positional buildApp signature with options object
- Where: current signature is `buildApp(engine, paymentRequests?, depositRequests?, auth?, setup?)`.
- Args 2-3 are shadowed-by-default from `engine` and never overridden in
  production — only in tests. Replace with `BuildAppOptions` so the test
  override pattern is named, not positional.

### 3. Untangle auth middleware
- Where: `server.ts:328-364` — security headers + DNS-rebinding/CSRF + bearer/cookie
  auth all in one anonymous middleware. The four trust dimensions (public-vs-
  private, loopback-vs-exposed, token-set-vs-not, browser-vs-CLI) are computed
  inline at every request.
- Fix: split into three named middlewares chained on `/api/*`:
  `securityHeaders`, `crossSiteGuard`, `authGate`. Move `isPublicRoute` to live
  with `authGate`. Loopback-only routes (`/api/setup`, `/api/agent/mnemonic`,
  `/api/settings/*`) annotate themselves via a `loopbackOnly()` middleware
  instead of the four hand-rolled `if (!isLoopback) return 403` checks.

### 4. Delete the dead `/api/personas/:id/ledger` route
- Where: `server.ts:1291-1303`. The Ledger SPA tab was retired in #95 (commit
  `8c49f94`); no client method calls this route; nothing renders the response.
- Fix: delete the route handler and remove tests targeting it. The same data
  is available via `mergeObservability` on the Activity feed.

## Acceptance criteria
- `server.ts` is ≤ 200 lines (just buildApp + middleware composition); each
  route module is ≤ 250 lines.
- All existing tests pass without modification (route shapes unchanged).
- `BuildAppOptions` object replaces the positional signature; tests use named
  fields.
- Three named middleware functions (security/cross-site/auth) and a
  `loopbackOnly()` helper that the few loopback-only routes consume.
- `/api/personas/:id/ledger` removed; no client/test references remain.

## Notes
Joint findings: architecture #1 + #12, maintainability #1 + #6. Largest
quality-of-life refactor in the audit — every future route change benefits.
