#!/bin/bash
# Reverses install.sh: stops the LaunchAgent, removes the plist and the md2html command. Your data folder is NOT touched.
#   --dry-run   only print what would happen.
set -euo pipefail
LABEL="ir.computer123.md2html"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LINK="$HOME/.local/bin/md2html"
SERVICES_DIR="$HOME/Library/Services"
WORKFLOWS=("MD2Html Open.workflow" "MD2Html PDF.workflow")
DATA="${MD2HTML_DATA:-$HOME/Documents/MD2Html}"

if [ "${1:-}" = "--dry-run" ]; then
  echo "[dry-run] would run: launchctl bootout gui/$(id -u)/$LABEL"
  echo "[dry-run] would remove: $PLIST"
  echo "[dry-run] would remove (if it points here): $LINK"
  for w in "${WORKFLOWS[@]}"; do echo "[dry-run] would remove: $SERVICES_DIR/$w"; done
  echo "[dry-run] would keep: $DATA"
  exit 0
fi

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
rm -f "$PLIST"
if [ -L "$LINK" ] && [ "$(readlink "$LINK")" = "$HERE/cli/md2html" ]; then rm -f "$LINK"; fi
for w in "${WORKFLOWS[@]}"; do rm -rf "${SERVICES_DIR:?}/$w"; done
echo "MD2Html server removed. Your data is still in: $DATA"
