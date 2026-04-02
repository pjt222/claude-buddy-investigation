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
# DEBUG=1 activates the debug writer; LOGS_DIR sets the output file path; LOG_LEVEL filters severity
# Note: CLAUDE_CODE_DEBUG_LOGS_DIR is used as the file path directly, not a directory
export DEBUG=1
export CLAUDE_CODE_DEBUG_LOGS_DIR="${LOG_DIR}/buddy-capture.txt"
export CLAUDE_CODE_DEBUG_LOG_LEVEL="debug"

# Enable HTTP-level request logging (captures buddy_react API calls)
# Bi$() has NO success logging — only a catch block logs "[buddy] api failed:"
# These env vars intercept at the transport layer instead:
#
# ⚠ WARNING: These vars cause visible side effects in the terminal!
#   - NODE_DEBUG=http,https prints HTTP trace lines to stderr
#   - BUN_CONFIG_VERBOSE_FETCH=curl prints "[fetch] POST ..." to stderr
#   Both bleed into Ink's terminal rendering, showing "[fetch]" text where
#   the buddy UI should be. Run `source tools/capture-teardown.sh` to undo.
export NODE_DEBUG=http,https             # Node.js built-in HTTP tracing
export BUN_CONFIG_VERBOSE_FETCH=curl     # Bun HTTP tracing (binary is Bun v1.3.11)

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
