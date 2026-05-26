# Backlog

In-repo tickets — one markdown file per ticket, versioned with the code. No
external service, no dashboard.

- **Create / list / update:** the `/ticket` skill (`.claude/skills/ticket/`).
- **Schema:** [`.claude/skills/ticket/EXAMPLE.md`](../.claude/skills/ticket/EXAMPLE.md).
- **List from the shell:** `.claude/skills/ticket/bin/tickets [status] [priority]`.
- **Next id:** `.claude/skills/ticket/bin/next-ticket-id` (atomic; never edit `.next-id` by hand).

Filenames are `NNNN-kebab-slug.md`. `.next-id` (the counter) is committed;
`.next-id.lock` is transient and gitignored. Files starting with a capital
letter (this README) are not tickets.
