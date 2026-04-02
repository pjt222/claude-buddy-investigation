#!/bin/bash
# capture-setup.sh — Set up environment to capture buddy_react API traffic
#
# Usage: Source this file before launching Claude Code, then run the monitor.
#
#   source tools/capture-setup.sh
#   claude   # launch Claude Code with debug logging enabled
#
# In another terminal:
#   tools/capture-monitor.sh   # tail the debug logs in real-time

CAPTURE_DIR="/mnt/d/dev/p/claude-buddy-investigation/capture"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
LOG_DIR="${CAPTURE_DIR}/logs_${TIMESTAMP}"

mkdir -p "$LOG_DIR"

# Enable Claude Code debug logging
export CLAUDE_CODE_DEBUG_LOGS_DIR="$LOG_DIR"
export CLAUDE_CODE_DEBUG_LOG_LEVEL="debug"

echo ""
echo "=== Buddy Capture Environment ==="
echo ""
echo "  Debug logs:  $LOG_DIR"
echo "  Log level:   debug"
echo ""
echo "  These env vars are now set:"
echo "    CLAUDE_CODE_DEBUG_LOGS_DIR=$LOG_DIR"
echo "    CLAUDE_CODE_DEBUG_LOG_LEVEL=debug"
echo ""
echo "  Next steps:"
echo "    1. Run 'claude' to launch Claude Code with logging"
echo "    2. Run '/buddy' or '/buddy on' to activate your companion"
echo "    3. In another terminal: bash tools/capture-monitor.sh"
echo "    4. Trigger reactions (code, cause errors, pet, address by name)"
echo "    5. Check $LOG_DIR for captured debug output"
echo ""
echo "  Look for lines containing:"
echo "    [buddy] api failed    — reaction API errors"
echo "    [buddy] soul response — personality generation at hatch"
echo "    buddy_react           — API call details"
echo ""
