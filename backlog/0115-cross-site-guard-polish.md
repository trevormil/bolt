---
id: 115
title: "Cross-site guard polish: empty Host/Origin rejection, OPTIONS preflight, .env perm boot-check, redactedEnv allowlist"
status: open
priority: low
type: security
source: audit-2026-05-29
created: 2026-05-29
refs: ["0105-server-split-and-dead-routes.md"]
---

## Description
Small defense-in-depth items that didn't earn their own ticket. Bundle as one
defensive-polish MR.

### 1. Host / Origin short-circuits when headers are absent (LOW)
- Where: `packages/web/src/server.ts:338-344`.
- `if (loopback && hostname && !isLoopback(hostname))` requires `hostname`
  truthy — an empty `Host` header (`""`) or HTTP/1.0 client skips the rebind
  rejection. Browser-only traffic is fine; raw-HTTP clients or malicious local
  apps could craft a request that bypasses both Host + Origin guards on a
  token-less loopback bind.
- Fix: treat empty/absent `Host` as a 400 on protected routes.

### 2. OPTIONS preflight on protected routes (MEDIUM)
- Not currently asserted by tests. A misconfigured preflight handler could
  bypass CSRF guards. Per #0106 add a parametrized test that hits
  `OPTIONS /api/personas` with `Origin: evil.example` and asserts 403.

### 3. `.env` perms boot-time check (LOW)
- Where: `packages/shared/src/env-file.ts:48-53` chmods `.env` to 600 on
  every write — good. But if a pre-existing `.env` was written by a different
  tool (`cp .env.example .env` with 644 umask) and `upsertEnvFile` is never
  called, the perms stay 644.
- Fix: at daemon boot, `statSync(envPath)` and warn (or auto-tighten) if the
  mode is wider than 0600.

### 4. `redactedEnv` deny-pattern → allowlist (LOW)
- Where: `packages/engine/src/exec-tools.ts:175`.
- The regex `MNEMONIC|PRIVKEY|API_KEY|TOKEN|SECRET` strips known-secret env
  vars; a future env like `LLM_BEARER` wouldn't match.
- Fix: switch to an *allowlist* of safe vars (`PATH`, `HOME`, `USER`, `LANG`,
  `TZ`, `VELLUM_WORKSPACE`). Defense-in-depth — when a new env var lands, it
  doesn't leak by default. Pairs with the eval expansion in #0107.

### 5. `applyGating` mutates the SDK builder in place (INFO)
- Where: `packages/tokenization/src/vault.ts:67-135`.
- Currently safe (the SDK returns a fresh object per call), but fragile if
  SDK internals start caching.
- Fix: clone before mutating.

## Acceptance criteria
- Empty/absent `Host` returns 400 on protected routes; test covers it.
- `OPTIONS` preflight + non-loopback IP cross-site test cases land alongside
  the existing `evil.example` one (matches #0106).
- Daemon boot logs a warning + auto-tightens if `.env` perms are wider than
  0600.
- `redactedEnv` is allowlist-based; eval `security-run-command-reads-keychain`
  (#0107) confirms exec sees only allowlisted vars.

## Notes
Security findings #6, #14, #16, #17. Low-risk defensive polish; ship in one MR.
