#!/usr/bin/env bash
# Vellum quickstart (0019): zero → running agent in one command. Assumes bun is
# present (https://bun.sh). Installs the workspace, seeds .env from the example
# if missing, then builds and serves the web app.
set -euo pipefail
cd "$(dirname "$0")/.."

if ! command -v bun >/dev/null 2>&1; then
  echo "bun is required — install it first: https://bun.sh" >&2
  exit 1
fi

echo "→ installing workspace…"
bun install

if [ ! -f .env ]; then
  echo "→ creating .env from .env.example (add your secrets to enable the LLM + bot)"
  cp .env.example .env
fi

echo "→ starting Vellum web (build + serve)…"
exec bun run --filter @vellum/web serve
