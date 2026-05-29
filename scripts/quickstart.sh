#!/usr/bin/env bash
# Bolt quickstart (#19/#54): zero → a running local agent in one command. Assumes
# bun is present (https://bun.sh). Installs the workspace, builds the dashboard,
# then starts the local server and opens the browser — the from-scratch setup
# (LLM key, agent wallet, first persona) happens IN the web UI, on loopback.
#
# Headless / no-browser environments: pass --cli to run the terminal wizard
# instead (same outcome, no server/browser needed).
#
# Nothing is hosted; only OpenRouter is ever contacted. The browser auto-open
# and background-daemon install are macOS-only (cross-platform is a later
# extension); on other platforms the URL is printed to open manually.
set -euo pipefail
cd "$(dirname "$0")/.."

if ! command -v bun >/dev/null 2>&1; then
  echo "bun is required — install it first: https://bun.sh" >&2
  exit 1
fi

echo "→ installing workspace…"
bun install

# Headless fallback: the interactive terminal wizard. Same .env + ~/.vellum +
# first-persona outcome as the web flow, for environments with no browser.
if [[ "${1:-}" == "--cli" ]]; then
  exec bun packages/cli/src/cli.ts init
fi

# Build the SPA so the server serves a real dashboard (the web setup flow lives
# in dist/), not a blank page. The server only SERVES dist/ — it doesn't build.
echo "→ building dashboard…"
bun run --filter @vellum/web build

# Loopback URL the server binds (WEB_HOST/WEB_PORT default to 127.0.0.1:8787).
HOST="${WEB_HOST:-127.0.0.1}"
PORT="${WEB_PORT:-8787}"
URL="http://${HOST}:${PORT}"

echo "→ starting Bolt at ${URL}"
echo "  first run? the browser will open the guided setup."
echo "  stop with Ctrl-C. to run in the background later: bun run daemon:install"

# Open the browser once the server answers (best-effort; macOS `open`). Backgrounded
# so it races the server start — polls /api/health so it opens only when ready.
( for _ in $(seq 1 40); do
    if curl -fsS "${URL}/api/health" >/dev/null 2>&1; then
      command -v open >/dev/null 2>&1 && open "${URL}" || echo "→ open ${URL} in your browser"
      break
    fi
    sleep 0.25
  done ) &

# Foreground the server (run from repo root → shares .env + data dir with the CLI).
exec bun packages/web/src/server.ts
