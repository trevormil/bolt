---
title: Known transitive `elliptic` advisory (accepted)
date: 2026-05-28
tags: [security, dependencies, audit]
---

## What

`bun audit` reports a **low**-severity advisory against `elliptic` (around
`bun.lock:770`). It surfaced on every `/code-review` of the local-first build
and is the single remaining (non-blocking) finding on the merged MR !40.

## Why it's there

`elliptic` is **not a direct dependency**. It's pulled in transitively through
the chain stack — the `bitbadges` SDK + `@cosmjs/*` use it for secp256k1
signing. We don't import or call it directly anywhere in Vellum.

## Why it's accepted (for now)

- **Low severity**, transitive, and on the client-signing path — not a remotely
  reachable surface in the local-first deployment (the app binds loopback; the
  only outbound call is OpenRouter).
- It **can't be fixed from our side** without the upstream (`@cosmjs` /
  `bitbadges`) bumping their `elliptic` constraint. Forcing a resolution
  override risks breaking signing for a low-severity issue.
- It does **not** block the merge bar (verdict `approve` + 0 medium+ + tests);
  it's informational.

## When to revisit

- When `@cosmjs` / `bitbadges` ship a release that bumps `elliptic` past the
  advisory — bump the chain deps and re-run `bun audit` to clear it.
- Before any **non-loopback / hosted** exposure (it's part of the #24
  pre-mainnet hardening surface), re-evaluate severity in that context.

## How to check current state

```bash
bun audit                 # see if the advisory is still present
bun pm ls elliptic        # trace which dep pulls it in
```
