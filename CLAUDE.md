# CLAUDE.md — vellum-project

A personal assistant built from scratch to rival OpenClaw (Vellum hiring-partner
project). User-facing brand is **Bolt**; `vellum-*` package names + `VELLUM_*`
env vars + `~/.vellum/` data dir are stable infra identifiers — don't churn
them. See [`README.md`](./README.md) for the product spec.

**Status:** post-MVP, post-audit hardening. The MVP slice + all six audit
sub-trees (`backlog/0099–0115`) have shipped or are in flight as stacked MRs.
The 22-package monorepo runs three surfaces (CLI / Web / Telegram) over one
engine; 562 unit + 15 Playwright e2e specs + real-LLM eval gate are green.
[`ARCHITECTURE.md`](./ARCHITECTURE.md) remains the E2E reference; the
audit-hardening invariants are §13. Current work: tightening
correctness/security via the audit follow-ups — pick up via `/ticket list`
(`status:open priority:high|critical` first), and prefer **stacked MRs** so
review throughput stays the bottleneck rather than per-MR overhead. Final
merge to `main` is always human-only.

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
