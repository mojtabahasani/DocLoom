#!/bin/bash
# DataSave server installer (macOS LaunchAgent). Run it yourself, once:   bash server/install.sh
#   --dry-run PLIST_PATH   write the plist to PLIST_PATH and print what would happen; changes nothing else.
set -euo pipefail

LABEL="ir.computer123.datasave"
LEGACY_LABEL="ir.computer123.md2html"   # the agent installed before the app was renamed
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/.." && pwd)"
# The library's home. An explicit setting wins; otherwise ~/Documents/DataSave — unless that does
# not exist yet and the old ~/Documents/MD2Html does, in which case the user's existing documents
# are already there and must stay there. Installing must never point the server at an empty folder.
# Mirrors defaultDataDir() in server/lib/env.js.
DATA="${DATASAVE_DATA:-${MD2HTML_DATA:-}}"
if [ -z "$DATA" ]; then
  if [ ! -d "$HOME/Documents/DataSave" ] && [ -d "$HOME/Documents/MD2Html" ]; then
    DATA="$HOME/Documents/MD2Html"
  else
    DATA="$HOME/Documents/DataSave"
  fi
fi
PORT="${DATASAVE_PORT:-${MD2HTML_PORT:-7123}}"
BIN_DIR="$HOME/.local/bin"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
SERVICES_DIR="$HOME/Library/Services"
WORKFLOWS=("DataSave Open.workflow" "DataSave PDF.workflow")
DRY=0

if [ "${1:-}" = "--dry-run" ]; then
  DRY=1
  PLIST="${2:?usage: install.sh --dry-run PLIST_PATH}"
fi

NODE="$(command -v node || true)"
[ -n "$NODE" ] || { echo "node was not found in PATH." >&2; exit 1; }
NODE="$(cd "$(dirname "$NODE")" && pwd -P)/$(basename "$NODE")"
MAJOR="$("$NODE" -p 'process.versions.node.split(".")[0]')"
[ "$MAJOR" -ge 18 ] || { echo "Node 18 or newer is required (found $MAJOR)." >&2; exit 1; }

xml() { printf '%s' "$1" | sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g'; }

write_plist() {
  mkdir -p "$(dirname "$PLIST")"
  cat > "$PLIST" <<PLISTEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$(xml "$NODE")</string>
    <string>$(xml "$REPO/server/index.js")</string>
  </array>
  <key>WorkingDirectory</key><string>$(xml "$REPO")</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>5</integer>
  <key>EnvironmentVariables</key>
  <dict>
    <key>DATASAVE_DATA</key><string>$(xml "$DATA")</string>
    <key>DATASAVE_PORT</key><string>$PORT</string>
    <key>PATH</key><string>/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin:/usr/local/bin</string>
  </dict>
  <key>StandardOutPath</key><string>$(xml "$DATA/logs/launchd.out.log")</string>
  <key>StandardErrorPath</key><string>$(xml "$DATA/logs/launchd.err.log")</string>
</dict>
</plist>
PLISTEOF
}

if [ "$DRY" = 1 ]; then
  write_plist
  echo "[dry-run] node:        $NODE"
  echo "[dry-run] repo:        $REPO"
  echo "[dry-run] data dir:    $DATA"
  echo "[dry-run] plist written to $PLIST"
  echo "[dry-run] would run:   mkdir -p $DATA/logs"
  echo "[dry-run] would run:   (build dist/pwa if missing)"
  echo "[dry-run] would run:   launchctl bootout gui/$(id -u)/$LEGACY_LABEL (the pre-rename agent, ignore errors)"
  echo "[dry-run] would run:   rm -f $HOME/Library/LaunchAgents/$LEGACY_LABEL.plist"
  echo "[dry-run] would run:   launchctl bootout gui/$(id -u)/$LABEL (ignore errors)"
  echo "[dry-run] would run:   launchctl bootstrap gui/$(id -u) $PLIST"
  echo "[dry-run] would run:   ln -sf $HERE/cli/datasave $BIN_DIR/datasave"
  for w in "${WORKFLOWS[@]}"; do echo "[dry-run] would copy:  $HERE/finder/$w -> $SERVICES_DIR/$w"; done
  echo "[dry-run] would print: first-run PIN from $DATA/logs/server.log"
  exit 0
fi

mkdir -p "$DATA/logs" "$BIN_DIR"
[ -f "$REPO/dist/pwa/index.html" ] || (cd "$REPO" && "$NODE" build.mjs)
chmod +x "$HERE/cli/datasave"

write_plist
# Stop the agent installed under the old name first: it holds the same port, so leaving it loaded
# would make the new one fail to bind and the server would look broken.
launchctl bootout "gui/$(id -u)/$LEGACY_LABEL" 2>/dev/null || true
rm -f "$HOME/Library/LaunchAgents/$LEGACY_LABEL.plist"
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
launchctl kickstart -k "gui/$(id -u)/$LABEL" 2>/dev/null || true
ln -sf "$HERE/cli/datasave" "$BIN_DIR/datasave"

# Finder Quick Actions (right-click > Quick Actions)
mkdir -p "$SERVICES_DIR"
for w in "${WORKFLOWS[@]}"; do
  rm -rf "$SERVICES_DIR/$w"
  cp -R "$HERE/finder/$w" "$SERVICES_DIR/$w"
  [ "$PORT" = "7123" ] || sed -i '' "s/^PORT=7123\$/PORT=$PORT/" "$SERVICES_DIR/$w/Contents/document.wflow"
done

echo "DataSave server installed and started on port $PORT."
echo "  App:       http://localhost:$PORT"
echo "  Data:      $DATA"
echo "  Command:   $BIN_DIR/datasave  (status | open | pdf | html | pin | logs | restart | start | stop)"
echo "  Finder:    Quick Actions \"DataSave: باز کن\" and \"DataSave: PDF بساز\" (right-click a file > Quick Actions)"
case ":$PATH:" in *":$BIN_DIR:"*) ;; *) echo "  Note: add $BIN_DIR to your PATH to use the datasave command." ;; esac

for _ in $(seq 1 20); do
  if grep -q "FIRST-RUN PIN" "$DATA/logs/server.log" 2>/dev/null; then
    echo
    grep "FIRST-RUN PIN" "$DATA/logs/server.log" | tail -1 | sed 's|^.*FIRST-RUN PIN: *\([0-9]*\).*$|  PIN for phones on the LAN (6 digits): \1|'
    exit 0
  fi
  sleep 0.5
done
echo
echo "  The PIN was created on an earlier run. Run 'datasave pin' to set and show a new one."
