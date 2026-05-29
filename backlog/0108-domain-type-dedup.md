---
id: 108
title: "Domain type dedup: VaultGating / PaymentRequest / DepositRequest / Vault single-source between server and SPA"
status: open
priority: medium
type: refactor
source: audit-2026-05-29
created: 2026-05-29
refs: ["0103-address-and-gating-validation.md"]
---

## Description
The SPA's `packages/web/src/app/api.ts` redeclares ~12 interfaces that already
exist canonically in `@vellum/tokenization`, `@vellum/engine`, and
`@vellum/observability`:

- `VaultGating` / `GatingPeriod` / `Vault` — canonical in
  `packages/tokenization/src/vault.ts:14-30` and `packages/engine/src/vaults.ts:16-26`.
- `PaymentRequest` — canonical in `packages/engine/src/payment-requests.ts`.
- `DepositRequest` — canonical in `packages/engine/src/deposit-requests.ts`.
- `BudgetLimits` / `BudgetWindow` / `Resolved<T>` — canonical in
  `packages/engine/src/budget-setting.ts` and `@vellum/settings`.
- `UnifiedRow` / `ObservabilitySource` — canonical in
  `packages/observability/src/merge.ts`.

The SPA's copies are hand-maintained mirrors with no compiler link. A server-
side field addition silently doesn't appear on the client until a human notices.
The `api.ts:1` comment ("thin typed client mirrors the server shapes") is
honest about the drift risk — that risk has materialized.

Also: the engine has `VaultRecord` and the client has `Vault` — identical
shapes, different names. Pick one.

## Acceptance criteria
- The SPA's `api.ts` replaces the 12+ duplicate interfaces with `import type`
  re-exports from the canonical packages.
- `Vault` vs `VaultRecord` naming reconciled to a single name.
- A TS test (or a tsc-only assertion) confirms server response types are
  compatible with the SPA's expected types — drift is caught at compile time.
- No runtime/code behavior change.

## Notes
Architecture finding #2 + #10, maintainability #8. Low-risk refactor; pays for
itself on every future field addition.
