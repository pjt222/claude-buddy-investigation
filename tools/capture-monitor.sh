#!/bin/bash
# capture-monitor.sh — Real-time monitor for buddy debug logs
#
# Usage: Run in a separate terminal while Claude Code is running
#   bash tools/capture-monitor.sh
#
# This tails the most recent capture log directory and filters for
# buddy-related entries, timing data, and API calls.

CAPTURE_DIR="${CAPTURE_DIR:-./capture}"

# Find the most recent log directory
LOG_DIR=$(ls -dt "$CAPTURE_DIR"/logs_* 2>/dev/null | head -1)

if [ -z "$LOG_DIR" ]; then
  echo "No capture logs found in $CAPTURE_DIR"
  echo "Run 'source tools/capture-setup.sh' first, then launch Claude Code."
  exit 1
fi

echo ""
echo "=== Buddy Capture Monitor ==="
echo "  Watching: $LOG_DIR"
echo "  Filter:   buddy, companion, react, soul, muted"
echo "  Press Ctrl+C to stop"
echo ""
echo "--- Live feed ---"

# Tail all log/txt files in the directory, filter for buddy-related content
# Debug output is a single .txt file (session UUID), not .log files
tail -F "$LOG_DIR"/*.txt "$LOG_DIR"/*.log 2>/dev/null | \
  grep --line-buffered -iE '(buddy|companion|react|soul|muted|shingle|addressed|reason|transcript|buddy_react|organizations.*claude_code|NODE_DEBUG|FETCH)' | \
  while IFS= read -r line; do
    # Colorize output
    timestamp=$(date '+%H:%M:%S.%3N')
    if echo "$line" | grep -qi "error\|failed"; then
      echo -e "\033[31m[$timestamp] $line\033[0m"  # Red for errors
    elif echo "$line" | grep -qi "soul\|personality\|hatch"; then
      echo -e "\033[35m[$timestamp] $line\033[0m"  # Magenta for soul/hatch
    elif echo "$line" | grep -qi "react\|reason\|addressed"; then
      echo -e "\033[36m[$timestamp] $line\033[0m"  # Cyan for reactions
    elif echo "$line" | grep -qi "muted\|companion"; then
      echo -e "\033[33m[$timestamp] $line\033[0m"  # Yellow for state changes
    else
      echo "[$timestamp] $line"
    fi
  done
