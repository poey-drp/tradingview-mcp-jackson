#!/bin/bash
# Launch TradingView Desktop on macOS with Chrome DevTools Protocol enabled
# Usage: ./scripts/launch_tv_debug_mac.sh [port]

PORT="${1:-9222}"

# Validate port is a number in the valid range
if ! [[ "$PORT" =~ ^[0-9]+$ ]] || [ "$PORT" -lt 1 ] || [ "$PORT" -gt 65535 ]; then
  echo "Error: invalid port '$PORT' (must be 1-65535)"
  exit 1
fi

# Auto-detect TradingView install location
APP=""
LOCATIONS=(
  "/Applications/TradingView.app/Contents/MacOS/TradingView"
  "$HOME/Applications/TradingView.app/Contents/MacOS/TradingView"
)

for loc in "${LOCATIONS[@]}"; do
  if [ -f "$loc" ]; then
    APP="$loc"
    break
  fi
done

# Fallback: search with mdfind (Spotlight) by verified bundle identifier
if [ -z "$APP" ]; then
  BUNDLE=$(mdfind "kMDItemCFBundleIdentifier == 'com.tradingview.tradingviewapp.desktop'" 2>/dev/null | head -1)
  if [ -n "$BUNDLE" ]; then
    APP="$BUNDLE/Contents/MacOS/TradingView"
  fi
fi

# Fallback: find any TradingView.app by name
if [ -z "$APP" ] || [ ! -f "$APP" ]; then
  BUNDLE=$(mdfind "kMDItemFSName == 'TradingView.app'" 2>/dev/null | head -1)
  if [ -n "$BUNDLE" ]; then
    APP="$BUNDLE/Contents/MacOS/TradingView"
  fi
fi

# Last resort: filesystem search
if [ -z "$APP" ] || [ ! -f "$APP" ]; then
  BUNDLE=$(find /Applications "$HOME/Applications" -maxdepth 2 -name "TradingView.app" 2>/dev/null | head -1)
  if [ -n "$BUNDLE" ]; then
    APP="$BUNDLE/Contents/MacOS/TradingView"
  fi
fi

if [ -z "$APP" ] || [ ! -x "$APP" ]; then
  echo "Error: TradingView not found."
  echo "Checked: /Applications/TradingView.app, ~/Applications/TradingView.app"
  echo ""
  echo "If installed elsewhere, run manually:"
  echo "  /path/to/TradingView.app/Contents/MacOS/TradingView --remote-debugging-port=$PORT"
  exit 1
fi

# If CDP is already up on this port, don't relaunch
if curl -s "http://localhost:$PORT/json/version" > /dev/null 2>&1; then
  echo "CDP already running at http://localhost:$PORT — nothing to do."
  curl -s "http://localhost:$PORT/json/version"
  exit 0
fi

# Kill any existing TradingView (match the exact executable path, not just the word)
pkill -f "TradingView.app/Contents/MacOS/TradingView" 2>/dev/null && sleep 1

echo "Found TradingView at: $APP"
echo "Launching with --remote-debugging-port=$PORT and optimization flags..."
"$APP" --remote-debugging-port=$PORT \
  --force-device-scale-factor=2 \
  --window-size=1920,1080 \
  --disable-background-timer-throttling \
  --disable-backgrounding-occluded-windows \
  --disable-renderer-backgrounding &
TV_PID=$!
echo "PID: $TV_PID"

# Confirm the process actually stayed up (a bad flag can make it exit immediately)
sleep 1
if ! kill -0 "$TV_PID" 2>/dev/null; then
  echo "Error: TradingView exited immediately after launch (check the flags above)."
  exit 1
fi

# Wait for CDP to be ready
echo "Waiting for CDP..."
for i in $(seq 1 15); do
  if curl -s "http://localhost:$PORT/json/version" > /dev/null 2>&1; then
    echo "CDP ready at http://localhost:$PORT"
    curl -s "http://localhost:$PORT/json/version" | python3 -m json.tool 2>/dev/null || curl -s "http://localhost:$PORT/json/version"
    exit 0
  fi
  sleep 1
done

echo "Warning: CDP not responding after 15s. TradingView may still be loading."
echo "Check manually: curl http://localhost:$PORT/json/version"
