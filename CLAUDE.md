# CLAUDE.md — vellum-project

A personal assistant built from scratch to rival OpenClaw (Vellum hiring-partner
project). See [`README.md`](./README.md) for the spec.

**Status:** research + direction done; **pre-build**. Still planning /
brainstorming — don't scaffold the app or seed build tickets until the direction
is finalized.

## How we work here (the approach moving forward)

**In-repo ticketing is the tracker.** Work is tracked as markdown tickets under
[`backlog/`](./backlog/), managed by the self-contained [`/ticket`
skill](./.claude/skills/ticket/) (copied from the Helios repo). No external
service, no dashboard — tickets are versioned with the code.

- File / list / update: `/ticket` (or `.claude/skills/ticket/bin/tickets [status] [priority]`).
- Allocate ids atomically with `.claude/skills/ticket/bin/next-ticket-id` — never
  hand-edit `backlog/.next-id`.
- Schema: [`.claude/skills/ticket/EXAMPLE.md`](./.claude/skills/ticket/EXAMPLE.md).
  Tickets are `NNNN-kebab-slug.md`; prose lives **after** the closing `---`.

**Flow:** ticket → feature branch → implement → push → open MR via `glab` → link
the MR into the ticket's `prs:` → human merges → set ticket `status: closed`.
Forge is GitLab (`labs.gauntletai.com`, use `glab`, say "MR"). Final merge to
`main` is human-only.

## Key context (don't re-derive)

- **Direction:** payment-first, compartmentalized personal agent — see
  [`research/differentiators.md`](./research/differentiators.md). Unified
  compartment = persona with its own hard-walled memory + skills + budget/vault.
- **Substrate: BitBadges** (the founder's L1). Mapping + feasibility in
  [`research/bitbadges-integration.md`](./research/bitbadges-integration.md).
- **Chain env: the Meridian devnet** (`bitbadges-1`). Access, endpoints, and the
  funded `alice` signer in
  [`docs/runbooks/meridian-devnet.md`](./docs/runbooks/meridian-devnet.md).
  Connect via `bin/meridian-ssh`. **The droplet also runs the live Meridian app —
  shared box, don't disrupt it.**
- **Research library:** [`research/PRIMER.md`](./research/PRIMER.md) is the quick
  reference; `research/` has the full competitive + landscape + agent-networks
  research.

## Conventions

- Tooling: prefer `bun` / `bunx`. Pin deps; commit the lockfile.
- Don't commit secrets (the Meridian SSH private key lives at `~/.meridian-ssh/`,
  outside the repo; any exported signer key goes in env, never committed).
