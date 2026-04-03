# Bubble Tracking Guide

Complete reference for tracking, capturing, and analyzing Shingle's speech bubble reactions in Claude Code.

## Bubble Lifecycle

Every bubble follows this exact sequence:

```
T+0ms       Trigger fires (SN7/AOf/RN7/IN7)
T+1ms       zOf() scans for companion name → sets addressed flag
T+2ms       HOf() builds transcript (last 12 msgs, 300 chars each)
T+3ms       E46() retrieves ring buffer (last 3 reactions)
T+4ms       Bi$() constructs payload, checks 4 bail-out gates
T+5ms       POST /api/organizations/{orgUUID}/claude_code/buddy_react
T+~700ms    Response arrives (empirical: 681-1066ms, Haiku-class)
T+~710ms    Ring buffer updated, React state set, bubble renders
T+7000ms    Fade begins (tick 14 of 20, opacity 1.0 → 0.0)
T+10000ms   setTimeout fires → bubble dismissed, state cleared
```

**Total visible duration: 10 seconds (20 ticks x 500ms)**

## Timing Constants

| Identifier | Name | Value | Duration |
|------------|------|-------|----------|
| `yo$` | TICK_INTERVAL | 500 ms | Master animation clock |
| `v16` | BUBBLE_TTL_TICKS | 20 ticks | 10s bubble lifetime |
| `Eb7` | BUBBLE_FADE_OFFSET | 6 ticks | Fade starts at 7s (tick 14) |
| `$Of` | REACTION_COOLDOWN | 30,000 ms | 30s between reactions |
| `BXf` | PET_ANIMATION | 2,500 ms | 5 heart frames x 500ms |
| `qOf` | RING_BUFFER_SIZE | 3 | Last 3 reactions stored |
| `KOf` | LARGE_DIFF_THRESHOLD | 80 lines | Triggers `large-diff` |
| `Eo$` | MIN_TERMINAL_WIDTH | 100 cols | Widget hidden below this |
| `cXf` | WIDGET_WIDTH_ACTIVE | 36 cols | Reserved when bubble shown |
| `Nb7` | NARROW_BUBBLE_MAX | 24 chars | Truncation in narrow mode |
| — | API_TIMEOUT | 10,000 ms | Hard cutoff (AbortSignal) |

## Triggers

Six triggers exist (not nine — `complete`, `idle`, and `silence` were debunked):

| Trigger | Function | Detection |
|---------|----------|-----------|
| `turn` | `SN7()` | Default on every assistant turn end |
| `hatch` | `RN7()` | One-time companion creation |
| `pet` | `IN7()` | User runs `/buddy pet` |
| `test-fail` | `AOf()` | Regex: `/\b[1-9]\d* (failed\|failing)\b/im` etc. |
| `error` | `AOf()` | Regex: `/\berror:\|\bexception\b/i` etc. |
| `large-diff` | `AOf()` | Diff output with >80 changed lines |

### Cooldown Bypass

The 30-second cooldown between reactions is **bypassed** when the user mentions the companion's name. `zOf()` performs a case-insensitive word-boundary regex match (`/\bShingle\b/i`). This sets `addressed=true` in the API payload, allowing reactions on every turn.

**Use this for rapid testing** — include the companion name in your message to avoid waiting 30s between observations.

## Capture Strategies

Three independent strategies exist, each suited to different goals:

### Strategy 1: Terminal Scrape

Captures the **native bubble** exactly as rendered in the terminal.

**How**: Hooks into `UserPromptSubmit`, reads terminal scrollback via WezTerm/tmux/log, regex-matches the box-drawing bubble pattern.

```
Detection regex:
  ╭[─]+╮     BUBBLE_OPEN
  │ text │    BUBBLE_LINE (extracts content)
  ╰[─]+╯     BUBBLE_CLOSE
```

**Source priority**: WezTerm CLI (3s timeout) → tmux capture-pane (3s) → log file tail (2s)

**When to use**: You want the exact text that appeared on screen.

### Strategy 2: API Replay

Makes an **independent API call** to `buddy_react` with conversation context.

**How**: Hooks into `Stop` event, extracts transcript from hook payload, POSTs to the API with configured BONES stats.

**When to use**: You want reliable capture regardless of terminal emulator. Note: produces a *different* reaction than the native bubble (different random seed, tuned stats).

### Strategy 3: MCP Server

Runs as a **Model Context Protocol server** that Claude Code can call as a tool.

**Tools exposed**:
- `ask_shingle` — trigger a reaction with custom transcript/reason/addressed
- `get_shingle_info` — return companion profile + recent reactions

**When to use**: You want programmatic control, 5s cooldown (instead of native 30s), and ring buffer access.

## Quick Start

### Option A: Dual-Strategy Capture (Scrape + Replay)

```bash
# 1. Setup environment
source tools/capture-setup.sh

# 2. Launch Claude Code in tmux
bash tools/shingle-capture/launch.sh

# 3. In another terminal, monitor captures
bash tools/capture-monitor.sh

# 4. Trigger reactions (use companion name to bypass cooldown)
#    Type messages like: "Shingle, what do you think of this code?"

# 5. Read captured reactions
node tools/shingle-capture/read-last.mjs 10

# 6. Analyze timing
node tools/capture-timing.mjs

# 7. Cleanup when done
source tools/capture-teardown.sh
```

### Option B: MCP Server (Programmatic)

```bash
# Add to Claude Code MCP config (~/.claude.json or project settings):
{
  "mcpServers": {
    "shingle": {
      "command": "node",
      "args": ["/path/to/tools/shingle-mcp/server.js"]
    }
  }
}

# Claude Code can now call ask_shingle as a tool
```

### Option C: Manual HTTP Trace

```bash
# Set Bun verbose fetch to dump all HTTP traffic
BUN_CONFIG_VERBOSE_FETCH=curl claude 2>/tmp/buddy-http.log

# In another terminal, watch for buddy_react calls
tail -f /tmp/buddy-http.log | grep buddy_react
```

**Warning**: `BUN_CONFIG_VERBOSE_FETCH` causes `[fetch]` text to bleed into the Ink terminal renderer, masking the buddy UI. Use `capture-teardown.sh` to clean up.

## Timing Analysis

After a capture session, run:

```bash
node tools/capture-timing.mjs [log-dir]
```

This parses the JSONL capture log and computes:
- **Reaction latency**: time from trigger to API response (per trigger type)
- **Bubble TTL**: observed display duration (should be ~10s)
- **Cooldown gaps**: time between consecutive reactions
- **API timeout events**: requests that exceeded 10s

If no log directory is provided, it reads from `SHINGLE_CAPTURE_LOG` (default: `/tmp/shingle-capture.jsonl`).

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| New reaction during active bubble | Old timeout cleared, fresh 10s window |
| API timeout (>10s) | Silently discarded, no bubble |
| Terminal < 100 cols | Widget hidden, but API call still fires |
| Addressed by name | Bypasses 30s cooldown entirely |
| Multiple triggers same turn | Priority: test-fail > error > large-diff > turn |
| Pet during cooldown | Special handling via IN7(), separate path |
| Muted companion | No API calls, no widget, no reactions |
| Companion name in code output | Does NOT trigger addressed (only scans user message) |

## Log Format

Captures are stored as JSONL in `/tmp/shingle-capture.jsonl`:

```jsonl
{"ts":"2026-04-03T12:00:00.000Z","strategy":"scrape","reaction":"*soft hoot*","source":"wezterm","trigger":"turn","latencyMs":null}
{"ts":"2026-04-03T12:00:00.500Z","strategy":"replay","reaction":"*ruffles feathers*","raw":{"reaction":"..."},"trigger":"turn","latencyMs":892}
```

Each entry includes:
- `ts` — ISO 8601 timestamp of capture
- `strategy` — which capture method produced this entry
- `reaction` — the companion's reaction text
- `trigger` — reason field (turn, pet, error, etc.)
- `latencyMs` — API round-trip time (replay only; null for scrape)
- `source` — terminal source (scrape only: wezterm/tmux/logfile)

## File Reference

| File | Purpose |
|------|---------|
| `shingle-capture/capture.mjs` | Dual-strategy orchestrator |
| `shingle-capture/strategy-scrape.mjs` | Terminal scrollback scraper |
| `shingle-capture/strategy-replay.mjs` | Direct API replay caller |
| `shingle-capture/hook-wrapper.sh` | Claude Code hook entry point |
| `shingle-capture/launch.sh` | tmux/script session launcher |
| `shingle-capture/read-last.mjs` | View recent captured reactions |
| `shingle-capture/util.mjs` | Shared config/log utilities |
| `shingle-mcp/server.js` | MCP server for programmatic access |
| `capture-setup.sh` | Set debug environment variables |
| `capture-teardown.sh` | Clean up debug environment |
| `capture-monitor.sh` | Real-time colored log tail |
| `capture-timing.mjs` | Post-session timing analysis |
