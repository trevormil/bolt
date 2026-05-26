# CLAUDE.md — vellum-project

A personal assistant built from scratch to rival OpenClaw (Vellum hiring-partner
project). See [`README.md`](./README.md) for the spec.

**Status:** design done + **plan-audited** — [`ARCHITECTURE.md`](./ARCHITECTURE.md)
is the E2E reference (see §13 for the audit-hardening invariants + the ~10-ticket
**MVP slice**), backlog seeded (`backlog/0001–0025`), audit findings in
[`research/audit/`](./research/audit/) (start at `00-summary.md`). **Ready to
build.** Order: 0001 scaffold → **0002 signer→devnet (CRITICAL, validate a real tx
day 1)** → the MVP slice. The reconciliation invariant (**0023**) is non-negotiable
before vault/payment tickets are trustworthy. Pick up via `/ticket list`.

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
  **BitBadges-SDK reference implementation: the Meridian repo**
  (`~/CompSci/gauntlet/meridian` — `apps/web/lib/chain/` LCD/broadcast/signing,
  `apps/web/lib/prediction-market/` collection-create + approvals + transfers/intents,
  `apps/aggregator/src/chain/` LCD client + approval/event parsers). The 3 audited
  BitBadges items (USDC→vault funding, atomic manager handoff, sign-page plain-English
  decode) are **confirmed feasible** by Trevor. **Rule: when you reach one of these at
  build time, reference Meridian first, then ASK TREVOR for the exact implementation
  pattern — do not guess the chain logic.**
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
