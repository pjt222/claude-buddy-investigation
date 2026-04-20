# MemPalace Integration for Shingle

Persist Shingle's reactions across sessions using [MemPalace](https://github.com/mila-jovovich/mempalace), a local-first AI memory system. Reactions are filed as structured drawers in a palace, making them searchable by trigger type, date, or content.

## Why

Shingle's reactions are ephemeral — the inline bubble auto-dismisses after 10 seconds (7s visible + 3s fade), the ring buffer holds 3 entries, and everything resets between sessions. MemPalace stores reactions permanently in a searchable, structured format without any cloud dependency.

## Architecture

```
┌─────────────────────┐    JSONL     ┌──────────────────┐    CLI    ┌──────────────────┐
│  shingle-capture    │ ──────────►  │  mempalace-sync  │ ───────► │    MemPalace     │
│  (hook / scrape)    │              │  (tools/*.mjs)   │          │  (~/.shingle-    │
└─────────────────────┘              └──────────────────┘          │     palace/)     │
                                                                   ├──────────────────┤
                                                                   │ Wing: shingle    │
                                                                   │ ├─ reactions     │
                                                                   │ ├─ debugging     │
                                                                   │ ├─ affection     │
                                                                   │ ├─ milestones    │
                                                                   │ ├─ code-review   │
                                                                   │ └─ ambient       │
                                                                   └──────────────────┘
```

Capture logs (JSONL) → `mempalace-sync.mjs` → MemPalace drawers + knowledge graph triples.

## Setup

### 1. Install MemPalace

```bash
pip install mempalace
```

Requires Python 3.9+. No API keys needed.

### 2. Initialize the palace

```bash
mempalace init ~/.shingle-palace
```

### 3. Register MCP server (optional)

If you want Claude Code itself to query Shingle's memory:

```bash
claude mcp add mempalace -- python -m mempalace.mcp_server --palace-dir ~/.shingle-palace
```

This exposes 19 tools (search, knowledge graph, diary) to Claude Code sessions.

### 4. Run a capture session

See `tools/shingle-capture/` for the full capture setup. Quick version:

```bash
source tools/capture-setup.sh
bash tools/shingle-capture/launch.sh
# ... use Claude Code normally ...
source tools/capture-teardown.sh
```

### 5. Sync reactions into the palace

```bash
node tools/mempalace-sync.mjs
```

Options:

| Flag | Default | Description |
|------|---------|-------------|
| `--palace-dir <path>` | `~/.shingle-palace` | Palace directory |
| `--dry-run` | off | Preview without writing |
| `[capture-log]` | `~/.claude/shingle-capture.jsonl` | Input log path |

## Palace Structure

Reactions are filed into the `shingle` wing with rooms mapped from trigger types:

| Trigger | Room | Content |
|---------|------|---------|
| `turn` | `reactions` | Standard per-turn reactions |
| `pet` | `affection` | Responses to `/buddy pet` |
| `hatch` | `milestones` | Session lifecycle events |
| `test-fail`, `error` | `debugging` | Error/failure commentary |
| `large-diff` | `code-review` | Reactions to big diffs |
| `complete` | `milestones` | (not currently active — kept for forward compat) |
| `idle`, `silence` | `ambient` | (not currently active — kept for forward compat) |

Each drawer stores the reaction text in a structured markdown format (heading, blockquoted reaction, metadata: timestamp, trigger type, capture strategy, and API latency if available).

Knowledge graph triples are also recorded:

```
(Shingle, reacted-turn, "Hoo! That's a curious refactor...")
(Shingle, reacted-error, "*ruffles feathers nervously*")
```

Note: Timestamps are not explicitly passed to the KG — MemPalace records its own ingestion timestamp.

## Querying

### CLI

```bash
# Search across all reactions
mempalace search "what did Shingle say about the test failure?"

# List rooms in the shingle wing
mempalace list-rooms --wing shingle

# Knowledge graph timeline
mempalace kg timeline --entity Shingle
```

### MCP (from Claude Code)

If you registered the MCP server (step 3), Claude Code can query the palace directly during sessions. Ask naturally:

> "What has Shingle said about debugging this week?"

The AI will call `mempalace_search` or `mempalace_kg_timeline` automatically.

### Python API

```python
from mempalace import Palace

palace = Palace("~/.shingle-palace")
results = palace.search("Shingle error reaction", wing="shingle")
for r in results:
    print(r.content, r.similarity)
```

## Automation

### Post-session hook

Add to `.claude/settings.json` to auto-sync after every session:

```json
{
  "hooks": {
    "PostSession": [
      {
        "command": "node tools/mempalace-sync.mjs",
        "timeout": 30000
      }
    ]
  }
}
```

### Cron (daily batch)

```bash
# Sync any accumulated capture logs daily
0 2 * * * cd /path/to/claude-buddy-investigation && node tools/mempalace-sync.mjs
```

## Companion MCP Servers

You can run both MCP servers simultaneously — they serve different purposes:

| Server | Purpose | Tools |
|--------|---------|-------|
| `shingle-mcp` | Trigger live reactions via `buddy_react` API | `ask_shingle`, `get_shingle_info` |
| `mempalace` | Search past reactions + knowledge graph | 19 tools (search, kg, diary, etc.) |

```bash
# Both at once
claude mcp add shingle -- node tools/shingle-mcp/server.js
claude mcp add mempalace -- python -m mempalace.mcp_server --palace-dir ~/.shingle-palace
```
