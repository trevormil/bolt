#!/usr/bin/env bash
# Vellum quickstart (#19): zero → a running local agent in one command. Assumes
# bun is present (https://bun.sh). Installs the workspace, then runs the
# interactive setup wizard (LLM key, agent wallet, first persona, optional
# background daemon). The wizard prints exactly how to start once it's done.
#
# Nothing is hosted; only OpenRouter is ever contacted. macOS-only for the
# background-daemon step (cross-platform autostart is a later extension).
set -euo pipefail
cd "$(dirname "$0")/.."

if ! command -v bun >/dev/null 2>&1; then
  echo "bun is required — install it first: https://bun.sh" >&2
  exit 1
fi

echo "→ installing workspace…"
bun install

# The wizard writes secrets into ./.env (the file Bun auto-loads at startup),
# creates ~/.vellum, and sets up the first persona. Run from the repo root so it
# targets the right .env and shares the same data dir as the daemon + web.
exec bun packages/cli/src/cli.ts init
