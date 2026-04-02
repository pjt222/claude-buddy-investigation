#!/bin/bash
# hook-wrapper.sh — Stop hook entry point
#
# Reads the hook JSON payload from stdin, extracts conversation context,
# and runs capture.mjs with it. Dumps raw payload for debugging on first runs.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PAYLOAD_DUMP="/tmp/shingle-hook-payload.json"
STRATEGY="${SHINGLE_CAPTURE_STRATEGY:-both}"

# Read stdin (hook payload) — must happen before backgrounding
PAYLOAD="$(cat)"

# Dump raw payload for debugging (overwrite each time)
echo "$PAYLOAD" > "$PAYLOAD_DUMP"

# Extract conversation context from the hook payload
# Stop hook provides: session_id, transcript_path, last_assistant_message, cwd
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

# Run capture with extracted context
SHINGLE_CAPTURE_STRATEGY="$STRATEGY" \
SHINGLE_LAST_CONTEXT="${CONTEXT:-"(no context extracted)"}" \
  node "$SCRIPT_DIR/capture.mjs" &
