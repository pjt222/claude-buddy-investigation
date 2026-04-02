#!/bin/bash
# capture-teardown.sh — Remove capture environment variables to restore normal buddy rendering
#
# Usage: Source this file to undo capture-setup.sh:
#
#   source tools/capture-teardown.sh
#
# This unsets all env vars that capture-setup.sh exported.
# Run this BEFORE launching Claude Code if you want the buddy UI back.
#
# Root cause: BUN_CONFIG_VERBOSE_FETCH=curl causes Bun's HTTP layer to write
# "[fetch] POST ..." to stderr for every API call, which Ink renders as visible
# "[fetch]" text in the terminal — masking the buddy companion UI entirely.

# Remove debug logging vars
unset DEBUG
unset CLAUDE_CODE_DEBUG_LOGS_DIR
unset CLAUDE_CODE_DEBUG_LOG_LEVEL

# Remove HTTP tracing vars (these cause "[fetch]" text leak)
unset NODE_DEBUG
unset BUN_CONFIG_VERBOSE_FETCH

echo ""
echo "=== Capture Environment Cleared ==="
echo ""
echo "  Removed:"
echo "    DEBUG"
echo "    CLAUDE_CODE_DEBUG_LOGS_DIR"
echo "    CLAUDE_CODE_DEBUG_LOG_LEVEL"
echo "    NODE_DEBUG                     ← was causing HTTP trace noise"
echo "    BUN_CONFIG_VERBOSE_FETCH       ← was causing [fetch] text leak"
echo ""
echo "  Buddy UI should render normally on next Claude Code launch."
echo "  Tip: Terminal width must be >= 100 columns for full sprite + bubble."
echo "        Current width: $(tput cols) columns"
echo ""
