# @vellum/evals

Budget-aware eval harness for the agent (ticket 0022). A golden case pairs a
`(persona, message)` with success criteria:

- **Deterministic oracles** — exact, free checks. Preferred wherever the
  condition is exact: cost under budget, a tx of some kind fired, a substring
  that must (or must not) appear. See `oracle.*` in `evals.ts`.
- **LLM-as-judge** — the fallback for genuinely open-ended output (tone,
  in-character-ness). Returns a 0–100 score; a case passes only at/above the
  threshold (default 70).

A case passes when **every** oracle passes **and** the judge (if any) clears the
threshold.

## Running

Real runs hit the live LLM (and, for vault cases, the chain), so they cost
money. Run from the **repo root** so the root `.env` (OpenRouter key + signer
mnemonic) is loaded:

```bash
bun packages/evals/src/cli.ts                       # list cases + usage
bun packages/evals/src/cli.ts single-budget-bounded # one case (cheap iteration)
bun packages/evals/src/cli.ts --all                 # full gated suite
```

The CLI exits non-zero if any case fails, so CI can gate on it.

## CI

`.gitlab-ci.yml` runs the harness's own unit tests (fake LLM, free) on every
push via the `quality` job. The real-LLM suite (`evals` job) is **manual** — the
budget guardrail: the full suite is never run on every commit. Trigger it from
the pipeline view when ready. It needs `OPENROUTER_API_KEY` and
`AGENT_SIGNER_MNEMONIC` as masked CI/CD variables.

## Adding a case

Append to `goldenSet` in `golden.ts`. Reach for a deterministic oracle first;
add a `judge` rubric only for output a check can't pin down. Tag the
`category` (`single-step` / `multi-step` / `long-horizon`) so the suite tracks
pass-rate by horizon.
