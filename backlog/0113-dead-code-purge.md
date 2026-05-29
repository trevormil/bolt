---
id: 113
title: "Dead-code purge: env vars, exports, deps, and interface-for-single-impl across packages"
status: open
priority: low
type: refactor
source: audit-2026-05-29
created: 2026-05-29
refs: ["0105-server-split-and-dead-routes.md"]
---

## Description
Surfaces flagged orphaned exports / declarations / dependencies. Single ticket
because each is one-line and they're all the same pattern.

### Confirmed unused (delete)
- `AGENT_SIGNER_PRIVKEY_HEX` — declared in `packages/shared/src/env.ts:17`, zero
  references repo-wide. ADR-0007 supersedes per-key hex storage.
- `openAiEmbedder` — exported from `packages/persona/src/embedder.ts:47-79`,
  never instantiated in production (the `Embedder` interface has only
  `hashEmbedder()` reachable). Either wire via env knob OR delete (per §2,
  delete by default).
- `listPersonaDocs`, `personaDir`, `scanForInjection`, `PERSONA_MD_WARN_CHARS`
  — exported from `packages/persona/src/index.ts:8-16`, only used inside the
  package itself, never imported externally. `PERSONA_MD_WARN_CHARS` is even
  re-exported a second time through `@vellum/engine/index.ts:70`.
- Internal types `TxStatus` / `TxKind` / `SpendInput` / `TxManagerOptions`
  exported from `@vellum/tx/index.ts:8-12`, no external importer — drop from
  the barrel.
- `@vellum/web/package.json:15-22` — declared `@vellum/agent`,
  `@vellum/ledger`, `@vellum/persona` as deps; grep finds zero imports under
  `packages/web/`.
- `AuthLedger` and `AuthEventSink` interfaces exported from
  `@vellum/capabilities/index.ts:16-17` — the interfaces enable decoupling
  (good, keep internal) but no external implementor exists, so drop from
  the public barrel.
- Duplicate `isBb1Address` in `packages/engine/src/vaults.ts:73-75` (the
  canonical one lives in `@vellum/tx`). Same module also redefines
  `assertPositiveMicro` at `:81-86` — use `isPositiveMicroAmount` from
  `@vellum/tx`.

### Conditional (review then act)
- The `SecretBackend` interface (1 prod impl + nullBackend) — speculative per
  ADR-0007's "Deferred." If headless backends aren't imminent, inline the two
  callers; reintroduce when a second backend lands.
- The `Approver` injection seam — `defaults.ts:43-51` grants everything as
  `allow`, so the "ask" branch never fires in prod. Keep `decide()`'s ask path
  in the store (honest auth model), but remove `Approver` from the public
  surface of `@vellum/engine` until a UI wires real approval prompts.

## Acceptance criteria
- Every confirmed-unused export deleted; grep against the repo confirms no
  importers; `bun run typecheck` clean.
- Unused workspace deps removed from `@vellum/web`.
- Decision on `SecretBackend` + `Approver` captured in the MR description; if
  kept, a comment names the future caller; if removed, the migration is
  noted.

## Notes
Maintainability findings #4, #5, #7, #9, #10, #11, #12; architecture #15, #16,
#17. All trivial deletions individually; bundling keeps the cleanup focused.
