#!/bin/bash
# Install (or reinstall) the launchd schedule on your Mac.
#   ./scripts/install-schedule.sh          # install / reload
#   ./scripts/install-schedule.sh remove   # uninstall
set -euo pipefail

LABEL="com.payrespects.etsy-tagger"
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
AGENTS_DIR="$HOME/Library/LaunchAgents"
PLIST="$AGENTS_DIR/$LABEL.plist"

if [ "${1:-}" = "remove" ]; then
  launchctl unload "$PLIST" 2>/dev/null || true
  rm -f "$PLIST"
  echo "Removed $LABEL"
  exit 0
fi

mkdir -p "$AGENTS_DIR" "$APP_DIR/logs"
chmod +x "$APP_DIR/scripts/run-sweep.sh"

# Fill the real app dir into the template and install.
sed "s#__APP_DIR__#$APP_DIR#g" "$APP_DIR/scripts/$LABEL.plist" > "$PLIST"

launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"
echo "Installed $LABEL → runs every 30 min."
echo "Logs: $APP_DIR/logs/  (sweep-*.log, launchd.*.log)"
echo "Check it's loaded:  launchctl list | grep etsy-tagger"
