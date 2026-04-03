# Tools

Utilities for managing, capturing, and analyzing Claude Code's companion system.

## Overview

| Tool | Purpose |
|------|---------|
| `buddy-config.mjs` | CLI to read/modify companion config |
| `capture-timing.mjs` | Post-session timing analysis |
| `bubble-tracking.md` | Complete bubble tracking guide |
| `shingle-capture/` | Dual-strategy reaction capture system |
| `shingle-mcp/` | MCP server for programmatic API access |
| `capture-setup.sh` | Set debug environment for capture |
| `capture-teardown.sh` | Clean up debug environment |
| `capture-monitor.sh` | Real-time colored log tail |
| `test-protocol.md` | Empirical test protocol (Q2/Q3) |

---

## Bubble Capture Quick Start

```bash
# 1. Set up capture environment
source tools/capture-setup.sh

# 2. Launch Claude Code in tmux
bash tools/shingle-capture/launch.sh

# 3. Monitor in another terminal
bash tools/capture-monitor.sh

# 4. Chat (use companion name to bypass 30s cooldown)
#    "Shingle, what do you think?"

# 5. Analyze timing after session
node tools/capture-timing.mjs

# 6. Cleanup
source tools/capture-teardown.sh
```

See `bubble-tracking.md` for the full guide including lifecycle timing, all three capture strategies, edge cases, and log format.

---

## Timing Analysis

```bash
# Analyze default capture log (/tmp/shingle-capture.jsonl)
node tools/capture-timing.mjs

# Analyze specific log file
node tools/capture-timing.mjs /path/to/capture.jsonl
```

Outputs:
- **API latency** — min/median/mean/max/p95, by trigger type and strategy
- **Inter-reaction gaps** — cooldown compliance, bypass detection
- **Bubble visibility windows** — estimated TTL from scrape/replay pairs
- **Timeout events** — requests that exceeded the 10s AbortSignal cutoff
- **Session metrics** — span, reaction rate

---

# buddy-config

CLI utility to read and modify Claude Code's companion config.

## Requirements

- Node.js 18+ (uses `readline/promises`)
- Zero dependencies (built-in modules only)

## Usage

```bash
node tools/buddy-config.mjs <command> [options]
```

### Commands

| Command | Description |
|---------|-------------|
| `show` | Show current companion state (name, personality, hatched, muted) |
| `rename <name>` | Change companion name (1-14 chars, single word) |
| `personality <text>` | Change companion personality (max 200 chars) |
| `mute` | Mute companion — stops all network calls and UI display |
| `unmute` | Unmute companion |
| `backup` | Create a manual backup of the config |
| `restore [timestamp]` | Restore companion from backup (latest if no timestamp) |
| `list-backups` | List available backups with timestamps |

### Options

| Option | Description |
|--------|-------------|
| `--no-backup` | Skip automatic backup before write operations |
| `--force` | Skip confirmation prompts |
| `--config-dir <path>` | Override config directory (default: `~/.claude`) |
| `--json` | Output in JSON format (for scripting) |
| `--help`, `-h` | Show help |

## What Can Be Changed

The companion config stores only 3 fields plus a mute flag:

| Field | Modifiable | Command |
|-------|-----------|---------|
| `name` | Yes | `rename` |
| `personality` | Yes | `personality` |
| `hatchedAt` | No | Set once at hatch |
| `companionMuted` | Yes | `mute` / `unmute` |

## What Cannot Be Changed

Species, rarity, stats, eyes, hat, and shiny status are **deterministically derived** from your account ID hash each session. They are not stored in the config file and cannot be modified by any tool.

## Examples

```bash
# View current companion
node tools/buddy-config.mjs show

# JSON output (for scripting)
node tools/buddy-config.mjs show --json

# Rename companion
node tools/buddy-config.mjs rename Pebble

# Change personality
node tools/buddy-config.mjs personality "A stoic owl who only speaks in haiku"

# Mute (stops all buddy network traffic)
node tools/buddy-config.mjs mute

# List available backups
node tools/buddy-config.mjs list-backups

# Restore from latest backup
node tools/buddy-config.mjs restore

# Restore from specific backup
node tools/buddy-config.mjs restore 1775136604541
```

## Safety

- Every write operation automatically creates a backup first (use `--no-backup` to skip)
- Backups follow Claude Code's naming convention: `.claude.json.backup.<timestamp>`
- Restore only overwrites `companion` and `companionMuted` keys — other config keys are preserved
- Writes are atomic (temp file + rename) to prevent corruption
- If the primary config file doesn't exist, the tool reads from the most recent backup
