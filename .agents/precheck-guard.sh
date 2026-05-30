#!/usr/bin/env bash
# precheck-guard — scheduled "green keeper" for vellum-project.
#
# Two cheap deterministic prechecks run first; the LLM is only paid for when
# something is actually red:
#   1. Meridian LCD reachability (curl lcd.meridian.trevormil.com).
#      On non-200 → spin up a claude agent INSIDE the meridian repo to open an
#      MR fixing it (or file a HITL if it's an ops/infra problem, not code).
#   2. Repo health: tsc --noEmit, bun test, prettier --check.
#      On failure → escalate to claude (default haiku) for a small surgical fix
#      + PR, else a backlog ticket.
#
# Runner env (set by TerMinal before exec):
#   TERMINAL_REPO  TERMINAL_RUN_ID  TERMINAL_BRANCH  TERMINAL_WORKTREE
#   TERMINAL_ENGINE  TERMINAL_MODEL
# Helpers on PATH (~/.config/TerMinal/bin/terminal-cli):
#   terminal-cli ticket|hitl|activity|notify ...
#
# NOTE: merge to main/master is human-only — never `glab mr merge` / `gh pr merge`.

set -uo pipefail

cd "${TERMINAL_WORKTREE:-$TERMINAL_REPO}" || exit 1

model=${TERMINAL_MODEL:-haiku}
LCD_URL="${LCD_URL:-https://lcd.meridian.trevormil.com}"
MERIDIAN_DIR="${MERIDIAN_DIR:-$HOME/CompSci/gauntlet/meridian}"

# Final exit status: 0 means "handled" (green, or remediation dispatched);
# non-zero only when an escalation we tried to run actually failed to launch.
rc=0

# ---------------------------------------------------------------------------
# Precheck 1 — Meridian LCD reachability (cheap, no LLM).
# ---------------------------------------------------------------------------
lcd_code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$LCD_URL" 2>/dev/null || echo "000")

if [ "$lcd_code" = "200" ]; then
  terminal-cli activity check "Meridian LCD" "$LCD_URL → 200 OK"
else
  terminal-cli activity check "Meridian LCD" "$LCD_URL → $lcd_code (degraded)"

  if [ ! -d "$MERIDIAN_DIR/.git" ]; then
    terminal-cli hitl "Meridian LCD down ($lcd_code)" \
      "$LCD_URL returned $lcd_code but the meridian repo is not at $MERIDIAN_DIR — clone it or set MERIDIAN_DIR so precheck-guard can open a fix MR."
    rc=1
  else
    # Run claude from within the meridian checkout so its branch/MR land there.
    # GitLab repo → glab + MR terminology. It must work on a feature branch.
    if ( cd "$MERIDIAN_DIR" && claude -p "The Meridian LCD endpoint $LCD_URL is returning HTTP $lcd_code instead of 200. The devnet/runbook context lives in vellum-project at docs/runbooks/meridian-devnet.md (chain id bitbadges-1).

You are running inside the meridian repo at $MERIDIAN_DIR (GitLab — use \`glab\`, say MR).

1. Diagnose why the LCD endpoint is unhealthy.
2. If the cause is a code/config issue you can fix in THIS repo: create a feature branch (never commit to main/master), apply the minimal surgical fix, push, and open an MR via \`glab mr create\`. Do NOT merge — merge to main is human-only. If the diff is docs/config-only, add the \`auto-mergeable\` label.
3. If it is an ops/infra problem (droplet down, DNS, TLS cert, service not running) that a repo change cannot fix, do NOT open an MR — file a HITL via \`terminal-cli hitl\` describing what an operator must do, referencing the devnet runbook.
4. If a fix is real but too large/risky for an autonomous pass, file a backlog ticket via \`terminal-cli ticket\` instead." \
        --dangerously-skip-permissions \
        --model "$model" ); then
      terminal-cli activity fix "Meridian LCD escalation" "claude dispatched in $MERIDIAN_DIR for $lcd_code"
    else
      terminal-cli hitl "Meridian LCD escalation failed" \
        "claude exited non-zero while trying to fix $LCD_URL ($lcd_code) in $MERIDIAN_DIR — investigate manually."
      rc=1
    fi
  fi
fi

# ---------------------------------------------------------------------------
# Precheck 2 — repo health (cheap, no LLM). Spend tokens only if red.
# ---------------------------------------------------------------------------
precheck_log=$(mktemp)
trap 'rm -f "$precheck_log"' EXIT

probe_ok=true
probes=()

run_probe() {
  local name=$1 ; shift
  if "$@" >>"$precheck_log" 2>&1; then
    probes+=("✔ $name")
  else
    probes+=("✘ $name")
    probe_ok=false
  fi
}

[ -f tsconfig.json ] && run_probe "tsc"   bunx tsc --noEmit -p tsconfig.json
[ -f package.json ]  && run_probe "tests" bun test
[ -f package.json ]  && run_probe "lint"  bunx prettier --check .

summary=$(IFS=' ' ; echo "${probes[*]}")
terminal-cli activity check "Repo health" "${summary:-no probes ran}"

if "$probe_ok"; then
  echo "Repo healthy — no LLM run needed. ($summary)"
  exit "$rc"
fi

# ---------------------------------------------------------------------------
# Escalate repo-health failures — default to the cheap model (haiku).
# ---------------------------------------------------------------------------
if claude -p "The repo health precheck failed for $TERMINAL_REPO (branch: ${TERMINAL_BRANCH:-?}).

Probe results:
$summary

Precheck output:
$(cat "$precheck_log")

Diagnose the failures. If you can apply a surgical, scope-respecting fix that
keeps tsc + the test suite + prettier green, do it: commit on this worktree's
branch and open a PR/MR per the project's pr-creation conventions (merge is
human-only — never merge). If the diff is docs/markdown/tickets/reports only,
add the \`auto-mergeable\` label per .agents/forge.md. If the fix is non-trivial
or risks scope creep, file a backlog ticket via \`terminal-cli ticket\` instead.
If you're blocked (missing credentials, ambiguous requirements), file a HITL via
\`terminal-cli hitl\`." \
  --dangerously-skip-permissions \
  --model "$model"; then
  terminal-cli activity fix "Repo health escalation" "claude dispatched for: $summary"
else
  terminal-cli hitl "Repo health escalation failed" \
    "claude exited non-zero diagnosing precheck failures in $TERMINAL_REPO ($summary) — investigate manually."
  rc=1
fi

exit "$rc"
