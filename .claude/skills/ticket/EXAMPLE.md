---
id: 0
title: "Example ticket — copy this format for new tickets"
status: open
priority: medium
type: feature
source: manual
created: 2026-05-26
updated: 2026-05-26
prs: []
refs: []
---

Canonical schema reference for in-repo tickets. This file is **not** a real
ticket (the `bin/tickets` lister only matches `backlog/NNNN-*.md`, and a `0`
id makes it inert). Real tickets live at `backlog/NNNN-kebab-slug.md`.

## Frontmatter fields

- `id` — integer, matches the numeric prefix in the filename (`0042-...`).
- `title` — short, action-oriented, one line.
- `status` — `open` | `in-progress` | `closed` | `stuck` | `icebox`
- `priority` — `critical` | `high` | `medium` | `low`
- `type` — `bug` | `feature` | `security` | `docs` | `dx` | `testing` | `ux` | `performance`
- `source` — where it came from: `manual`, `audit`, `feedback`, an agent name, or a ref.
- `created` / `updated` — ISO dates (`YYYY-MM-DD`).
- `prs` — array of MR/PR URLs that implement/fix this ticket. Name kept as
  `prs` for tooling stability; GitLab MRs and GitHub PRs both parse. Populated
  when an MR is opened, not at creation.
- `refs` — optional array of in-repo links: plan unit IDs (`U10`), ADRs
  (`ADR-0002`), or doc paths. Ties a ticket to the design artifacts it advances.

## Filename convention

`backlog/NNNN-kebab-case-title.md`, e.g. `backlog/0042-rate-limit-join.md`.
Allocate the next id atomically with `.claude/skills/ticket/bin/next-ticket-id`.

## Body

Freeform markdown. Suggested sections: Description, Acceptance criteria,
Design notes, Repro (bugs only). Keep prose **after** the closing `---` of the
frontmatter, never inside the delimiters.
