---
name: ticket
description: "Create and manage in-repo backlog tickets (markdown files with YAML frontmatter under backlog/). Allocates an id atomically, writes a properly-structured backlog/NNNN-slug.md, and lists/updates/closes tickets. Self-bootstrapping and portable — drop this folder into any repo. Use when the user says /ticket, asks to file/list/close a ticket, or describes work that should be tracked."
---

# /ticket — In-repo backlog tickets

A dependency-free, in-repo ticketing system. Tickets are markdown files with
YAML frontmatter under `backlog/` at the repo root — versioned with the code,
no external service, no dashboard. This skill is **self-contained**: it carries
its own helper scripts and bootstraps `backlog/` on first use.

## Where tickets live

`<repo-root>/backlog/NNNN-kebab-slug.md` — one file per ticket. Canonical schema:
[`EXAMPLE.md`](./EXAMPLE.md) (next to this skill). The counter lives in
`backlog/.next-id`.

## Helper scripts (carried by this skill)

Resolve paths via the repo root so they work from anywhere:

```bash
ROOT="$(git rev-parse --show-toplevel)"
SKILL="$ROOT/.claude/skills/ticket"

"$SKILL/bin/next-ticket-id"     # atomically allocate + print the next id (e.g. 0042)
"$SKILL/bin/tickets"            # list all tickets
"$SKILL/bin/tickets open"       # filter by status
"$SKILL/bin/tickets open high"  # filter by status + priority
```

`next-ticket-id` uses a `mkdir` lock (portable, parallel-safe, no `flock`) and
creates `backlog/` + `.next-id` if missing. Both scripts must be executable
(`chmod +x`).

## Routing

Pick the operation from what the user asked:

- **Create** ("file a ticket", "/ticket <desc>", describes trackable work) → §Create
- **List** ("what's open", "show tickets", "/ticket list") → run `bin/tickets [status] [priority]`
- **Update / close** ("close #42", "mark 0042 in-progress", "link the MR") → §Update

---

## Create a ticket

### 1. Gather the facts

Infer from context; ask once only if genuinely unclear:

- **Title** — short, action-oriented ("Add rate limit to signaling join", not "Rate limiting").
- **Type** — `bug` | `feature` | `security` | `docs` | `dx` | `testing` | `ux` | `performance`.
- **Priority** — `critical` | `high` | `medium` | `low`. Don't guess silently; `medium` is a fine default but say so.
- **Source** — `manual`, `audit`, `feedback`, an agent name, or a ref.
- **Refs** (optional) — plan unit IDs (`U10`), ADRs (`ADR-0002`), or doc paths this ticket advances.

### 2. Allocate an id

```bash
id=$("$(git rev-parse --show-toplevel)/.claude/skills/ticket/bin/next-ticket-id")
```

Never edit `.next-id` by hand — always use the script (parallel-safe).

### 3. Write the file

Path: `backlog/<id>-<kebab-slug>.md` (slug = kebab title, ≤ 6 words).

```yaml
---
id: <int, matches filename prefix>
title: "<title>"
status: open
priority: <critical|high|medium|low>
type: <bug|feature|security|docs|dx|testing|ux|performance>
source: <where it came from>
created: <YYYY-MM-DD>
updated: <YYYY-MM-DD>
prs: []
refs: []
---
```

Body (suggested; prose goes **after** the closing `---`):

```markdown
## Description
<2–4 sentences: what's the problem/feature, why it matters.>

## Acceptance criteria
- <Concrete, testable bullet>
- ...

## Design notes
<Optional: approach, constraints, gotchas. Skip if straightforward.>

## Repro
<Bugs only: steps to reproduce.>
```

### 4. Confirm and stop

Show the created path. Don't auto-start the work unless asked.

---

## Update / close a ticket

Edit the ticket file directly:

- Change `status:` (`open` → `in-progress` → `closed`; or `stuck` / `icebox`).
- Bump `updated:` to today.
- When an MR/PR is opened, add its URL to `prs:`. When it merges, set
  `status: closed`.
- Keep prose strictly **after** the closing `---` — never inside the frontmatter
  delimiters.

`bin/tickets [status]` to verify the resulting state.

---

## Quality bar

- **Acceptance criteria are testable.** "Looks good" is not a criterion;
  "POST /join returns 429 after 100 req/min" is.
- **One ticket = one piece of work.** Two unrelated things → two tickets.
- **No speculative tickets.** "Maybe we should..." is not a ticket — that's a
  doc/learning. Tickets are committed work.

## What NOT to do

- Don't allocate ids by hand-editing `.next-id` — use `bin/next-ticket-id`.
- Don't file tickets for already-done work (document it instead).
- Don't populate `prs:` at creation — that's set when an MR opens.
- Don't put prose inside the frontmatter `---` delimiters.

---

## Porting to a new repo (composability)

The entire system is this one folder. To add it to another repo:

1. Copy `.claude/skills/ticket/` into the target repo (scripts included).
2. Ensure the scripts are executable: `chmod +x .claude/skills/ticket/bin/*`.
3. Add `backlog/.next-id.lock` to that repo's `.gitignore`.

That's it. The first `/ticket` (or any `bin/next-ticket-id` call) bootstraps
`backlog/` + `.next-id` at the new repo's root. No external service, no
dashboard, no `flock`, no per-repo config. Commit `backlog/` (tickets +
`.next-id`) so the tracker travels with the code.
