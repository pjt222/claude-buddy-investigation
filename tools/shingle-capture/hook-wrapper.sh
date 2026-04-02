#!/bin/bash
# hook-wrapper.sh — Dual-hook entry point for Shingle bubble capture
#
# Handles two hook events:
#   UserPromptSubmit — user just hit enter, bubble likely still visible → scrape strategy
#   Stop            — Claude finished responding → replay strategy (parallel API call)
#
# Reads the hook JSON payload from stdin, branches on hook_event_name,
# and runs capture.mjs with the appropriate strategy.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PAYLOAD_DUMP="/tmp/shingle-hook-payload.json"

# Read stdin (hook payload) — must happen before backgrounding
PAYLOAD="$(cat)"

# Dump raw payload for debugging (overwrite each time)
echo "$PAYLOAD" > "$PAYLOAD_DUMP"

# Determine which hook event fired
HOOK_EVENT=$(echo "$PAYLOAD" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    print(data.get('hook_event_name', 'unknown'))
except:
    print('unknown')
" 2>/dev/null)

if [ "$HOOK_EVENT" = "UserPromptSubmit" ]; then
  # Bubble is likely still visible — scrape the terminal
  SHINGLE_CAPTURE_STRATEGY="scrape" \
  SHINGLE_LAST_CONTEXT="(scrape-only, no context needed)" \
    node "$SCRIPT_DIR/capture.mjs" &

elif [ "$HOOK_EVENT" = "Stop" ]; then
  # Claude finished responding — replay via API with conversation context
  CONTEXT=$(echo "$PAYLOAD" | python3 -c "
import sys, json, os
try:
    data = json.load(sys.stdin)

    parts = []

    # Read last few turns from the transcript file for full context
    tp = data.get('transcript_path', '')
    if tp and os.path.isfile(tp):
        with open(tp) as f:
            lines = f.readlines()
        # Get last 10 transcript entries (user + assistant turns)
        recent = []
        for line in lines[-10:]:
            try:
                entry = json.loads(line)
                msg = entry.get('message', {})
                role = msg.get('role', '')
                content = msg.get('content', '')
                if isinstance(content, list):
                    content = ' '.join(
                        c.get('text', '') for c in content
                        if isinstance(c, dict) and c.get('type') == 'text'
                    )
                if role and content:
                    recent.append(f'{role}: {content[:300]}')
            except (json.JSONDecodeError, AttributeError):
                pass
        if recent:
            parts.extend(recent[-6:])  # last 6 turns max

    # Fallback: use last_assistant_message if transcript wasn't available
    if not parts:
        msg = data.get('last_assistant_message', '')
        if msg:
            parts.append(f'assistant: {msg[:1000]}')

    print('\n'.join(parts) if parts else '(no context extracted)')
except Exception as e:
    print(f'(payload parse error: {e})')
" 2>/dev/null)

  SHINGLE_CAPTURE_STRATEGY="replay" \
  SHINGLE_LAST_CONTEXT="${CONTEXT:-"(no context extracted)"}" \
    node "$SCRIPT_DIR/capture.mjs" &

else
  echo "shingle-capture: unknown hook event '$HOOK_EVENT'" >&2
fi
