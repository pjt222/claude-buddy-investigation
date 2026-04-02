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
