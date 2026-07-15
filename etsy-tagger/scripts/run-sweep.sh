#!/bin/bash
# Wrapper launchd invokes. launchd doesn't inherit your shell PATH, so we resolve
# node ourselves and cd into the project. Edit APP_DIR if you move the folder.
set -euo pipefail

APP_DIR="$HOME/Documents/etsy-tagger"

# Find node: prefer Homebrew locations, fall back to whatever's on PATH.
for candidate in /opt/homebrew/bin/node /usr/local/bin/node "$(command -v node || true)"; do
  if [ -x "$candidate" ]; then NODE="$candidate"; break; fi
done
: "${NODE:?node not found — install Node 18+ or edit run-sweep.sh}"

cd "$APP_DIR"
exec "$NODE" run.js --apply
