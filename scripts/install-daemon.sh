#!/usr/bin/env bash
# Install / uninstall / status for the Vellum local daemon autostart (#31).
# Thin wrapper over packages/daemon/src/install.ts (the cross-platform logic).
#
#   scripts/install-daemon.sh            # install + start at login
#   scripts/install-daemon.sh uninstall  # remove the autostart unit
#   scripts/install-daemon.sh status     # show service state
#
# Local-only: the daemon binds loopback; the only outbound call is OpenRouter.
set -euo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec bun "$REPO/packages/daemon/src/install.ts" "${1:-install}"
