#!/bin/bash
# launch.sh — Start Claude Code with terminal capture for Shingle bubble scraping
#
# Usage:
#   bash tools/shingle-capture/launch.sh          # tmux mode (default)
#   bash tools/shingle-capture/launch.sh script    # script mode (fallback)
#
# tmux mode:  Runs Claude Code in a tmux session named "claude".
#             The scrape strategy uses `tmux capture-pane` to read the scrollback.
#
# script mode: Uses `script` to log raw terminal output to a file.
#              Messier (ANSI escapes) but works without tmux.

MODE="${1:-tmux}"
TERMINAL_LOG="/tmp/shingle-terminal.log"
TMUX_SESSION="claude"

case "$MODE" in
  tmux)
    if tmux has-session -t "$TMUX_SESSION" 2>/dev/null; then
      echo "tmux session '$TMUX_SESSION' already exists. Attaching..."
      tmux attach -t "$TMUX_SESSION"
    else
      echo "Starting Claude Code in tmux session '$TMUX_SESSION'..."
      echo "Scrape strategy will use: tmux capture-pane -t $TMUX_SESSION"
      echo ""
      # Set scrollback high enough to capture bubbles between turns
      tmux new-session -s "$TMUX_SESSION" -x "$(tput cols)" -y "$(tput lines)" \
        "SHINGLE_TMUX_PANE=$TMUX_SESSION claude"
    fi
    ;;

  script)
    echo "Starting Claude Code with terminal logging..."
    echo "Log file: $TERMINAL_LOG"
    echo "Scrape strategy will read: $TERMINAL_LOG"
    echo ""
    # Truncate old log
    > "$TERMINAL_LOG"
    SHINGLE_TERMINAL_LOG="$TERMINAL_LOG" script -q "$TERMINAL_LOG" -c "claude"
    ;;

  *)
    echo "Usage: $0 [tmux|script]"
    exit 1
    ;;
esac
