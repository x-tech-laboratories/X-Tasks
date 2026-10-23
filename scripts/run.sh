#!/usr/bin/env bash
# Builds the app if needed and launches it with the nixpkgs Electron.
set -euo pipefail

# VSCode's terminal exports this, which makes Electron run as bare node and die on the ESM main.
unset ELECTRON_RUN_AS_NODE

cd "$(dirname "$0")/.."

electron_binary="${ELECTRON_EXEC:-$(command -v electron || true)}"
if [[ -z "$electron_binary" ]]; then
  electron_binary=$(ls -d /nix/store/*-electron-43.*/bin/electron 2>/dev/null | head -1)
fi
[[ -n "$electron_binary" ]] || { echo "no electron found; run inside 'nix develop'" >&2; exit 1; }

[[ -f out/main/index.js ]] || npx electron-vite build

exec "$electron_binary" . "$@"
