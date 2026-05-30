---
id: 116
title: "Engine surface polish: re-export hygiene, EngineOptions split, settings registry watchlist"
status: icebox
priority: low
type: refactor
source: audit-2026-05-29
created: 2026-05-29
refs: ["0113-dead-code-purge.md"]
---

## Description
Three architecture findings about `@vellum/engine`'s public surface that are
nice-to-have rather than blocking. Bundle as one ticket so the engine API
becomes more honest about what's production vs test.

### 1. `@vellum/engine/index.ts` re-exports 9 unrelated packages (MEDIUM)
- Where: `packages/engine/src/index.ts:19-79` — `isBb1Address`/`TxRejectedError`
  from `@vellum/tx`, `GLOBAL` from `@vellum/settings`, `mergeObservability` +
  friends from `@vellum/observability`, `renderPersonaCard` /
  `DEFAULT_PERSONA_INSTRUCTIONS` from `@vellum/persona`,
  `grantDefaultCapabilities` + `Approver` from `@vellum/capabilities`.
- Justification was "avoid direct deps" but web / cli / telegram already
  depend on those packages directly (`web/package.json` etc.). The cost: a
  reader can't tell which exports are engine logic vs pass-throughs, and
  breaking changes in tx/observability/persona look like engine breakages.
- Fix: drop the pass-through re-exports; let consumers import from the source
  packages. Keep only re-exports of things engine *composes* (`Engine`,
  `Conversations`, vault types, `Model`, `BudgetLimits`, `mcp*`, `chat`,
  `combineTools`).

### 2. `EngineOptions` mixes production + test seams (INFO)
- Where: `packages/engine/src/engine.ts:57-75`. Of the 10 options, 7 are
  explicitly labeled "test seam" (`runLoop`, `getBalances`, `txChain`,
  `claimFaucet`, `mnemonic`, `vault`, `approve`, `mcpConnect`).
- Fix: split into `EngineOptions` (prod-facing: `dbPath`, `embedder`,
  `approve`) + `EngineTestOptions`; `createEngine(opts: EngineOptions &
  Partial<EngineTestOptions>)`. No behavior change; the production surface
  becomes honest about what callers should pass.

### 3. Settings system — watchlist, not action (INFO)
- Where: `packages/engine/src/{model-setting,budget-setting,mcp-setting}.ts`.
- Three typed settings today, all hand-wired (engine barrel + web GET/PUT
  pair + client `api.ts` + Settings panel). The system clearly designs for
  more settings (`defineSetting<T>`, generic store, cascade). If a 4th + 5th
  setting are imminent, introduce a `SettingRegistry` + a generic
  `/api/personas/:id/settings/:key` GET/PUT pair. Today's three is fine —
  this is a watch-list item.

## Acceptance criteria
- Engine barrel exports only engine-composed surface; web/cli/telegram update
  their imports to the source packages. Bun test stays green.
- `EngineOptions` / `EngineTestOptions` split; production callers only see
  prod options.
- Decision documented: whether to introduce a SettingRegistry now, defer to
  next-setting trigger, or formally close as won't-do.

## Notes
Architecture findings #3, #4, #6, maintainability #24. The engine refactor is
low-risk but touches every consumer — schedule when no other engine work is
in flight.


## Status (2026-05-30) — iceboxed
Audit-cut for the hiring-partner submission frame. Pure organizational
refactor / cleanliness work with **no behavior change**; reviewer reads
the code linearly, not the file tree. Real wins for the codebase
long-term, but the submission frame says ship #99–#104 (real demo-path
bugs) and defer this. Revisit post-submission.
