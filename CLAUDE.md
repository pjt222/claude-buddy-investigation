# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Purpose

Research repository documenting findings about Claude Code's built-in "Buddy" companion system and the newer "Advisor Strategy" system. The companion UI was removed in v2.1.97, but the server-side reaction API is still alive. The advisor system (tool name `advisor_20260301`) was code-complete in v2.1.96, coexisting with the full buddy, and is dark-launched behind an advisor feature gate. Our workspace and MCP tools call the buddy API directly — multi-buddy reactions work on any version.

## Repository Structure

- `digest.md` — comprehensive investigation findings from 21+ agents across 4 waves
- `architecture.md` — companion technical deep-dive: function reference, data flow diagrams, API protocol, security boundary
- `advisor-architecture.md` — advisor system spec: tool lifecycle, system prompt, feature flags, telemetry, buddy comparison
- `config-excerpt.json` — companion config extracted from `~/.claude/backups/` state files
- `links.md` — 20 reference sources organized by category (official docs, source analysis, reverse engineering, prior art, competitors)
- `SECURITY-AUDIT.md` — 14-finding security audit (1 CRITICAL, 3 HIGH, 5 MEDIUM, 3 LOW, 1 OBSERVATION)
- `README.md` — project overview
- `tools/buddy-config.mjs` — CLI to read/modify companion config (Node.js 18+, zero deps)
- `tools/version-check.mjs` — pre-flight version compatibility check against installed binary
- `tools/bubble-tracking.md` — complete bubble tracking guide (lifecycle, capture strategies, timing constants)
- `tools/capture-timing.mjs` — post-session timing analysis (latency, cooldown gaps, TTL estimation)
- `tools/shared/bones.mjs` — deterministic companion trait derivation (FNV-1a + Mulberry32 PRNG)
- `tools/shared/config.mjs` — unified Shingle config reader (`~/.claude/shingle.json`)
- `tools/shingle-capture/` — dual-strategy capture (terminal scrape + API replay) with Claude Code hooks
- `tools/shingle-mcp/` — MCP server for programmatic buddy reaction access
- `tools/mempalace-sync.mjs` — sync captured reactions into MemPalace (cross-session memory)
- `tools/mempalace-setup.md` — integration guide: palace structure, MCP registration, automation
- `tools/sessions/` — multi-buddy session presets (deep-focus, debug-squad, dream-lab, full-crew)
- `workspace/tools/workspace-mcp/` — MCP server for reading workspace transcript and status
- `tools/test-protocol.md` — empirical test protocols for bubble TTL and narrow terminal behavior
- `docs/` — GitHub Pages visualization (Three.js, Viridis dark theme)

## Key Context

- The buddy system is a first-party Claude Code feature (v2.1.89+, Pro/Max plan), launched April 1, 2026
- Companion identity is deterministic: Bun.hash (wyhash) of user ID with a fixed salt string, feeding a Mulberry32 PRNG (FNV-1a is the Node.js dev fallback only)
- Only 3 fields persisted in `~/.claude/.claude.json`: name, personality, hatchedAt. All other traits re-derived from hash each session.
- Shingle is architecturally separate from the main Claude Code agent — strictly unidirectional (observes but cannot write back)
- 6 reaction triggers: turn, hatch, pet, test-fail, error, large-diff (complete, idle, silence were debunked)
- Binary at `~/.local/share/claude/versions/` (v2.1.90 analyzed, v2.1.92 verified compatible, v2.1.96-v2.1.100 advisor-analyzed, v2.1.101/v2.1.104 loop-system-analyzed, v2.1.105/v2.1.107/v2.1.109/v2.1.110 binary-probed — current = v2.1.110 build 2026-04-15T19:37:30Z)
- Date gate bug: a date-based gate covering Jan–Mar each year disables the companion during those months on any year from 2026 onward

## Advisor System Context

- The advisor (tool name `advisor_20260301`) is a server-side Messages API tool — NOT a separate endpoint like the buddy reaction API
- Valid advisor models: `["opus", "sonnet"]` (resolves to `opus-4-6`, `sonnet-4-6`)
- Feature gate: composed of a `<feature-disable-env-var>` check, a first-party auth check, and an advisor feature flag
- CLI flag: `--advisor <model>` (hidden until flag rolls out)
- Slash command: `/advisor [opus|sonnet|off]` (hidden until flag rolls out)
- Key binary functions (paraphrased by role): a feature-gate predicate, two input validators, two cost-tracking helpers, and two system-prompt assembly variables
- 5 telemetry events: advisor command, dialog shown, tool call, tool interrupted, tool token usage
- Coexisted with buddy in v2.1.96 — was NOT built as a replacement

## Kairos Loop System Context

- The Kairos loop (v2.1.101+) provides autonomous self-continuation via the `ScheduleWakeup` tool and `/loop` slash command
- `ScheduleWakeup(delaySeconds, prompt, reason)` — runtime clamps delay to `[60, 3600]` seconds; dynamic loops use `CronCreate(kind: "loop")` internally
- Four prompt sentinels: `<<autonomous-loop>>`, `<<autonomous-loop-dynamic>>`, `<<loop.md>>`, `<<loop.md-dynamic>>`
- Feature gates: a loop scheduler gate (tool), a slash-command gate, and a sentinel-resolution gate
- Loop ages out at 7 days (`recurringMaxAgeMs: 604800000`, configurable up to 30 days)
- Key binary functions (v2.1.101, paraphrased by role): a wakeup scheduler, a default-sentinel resolver, and a file-sentinel resolver
- 2 telemetry events: loop-dynamic wakeup scheduled, loop-dynamic wakeup aged out; `/loop` invocation is also telemetered
- Full technical spec: `loop-architecture.md`

## Workspace Transcript Access

When the Buddy Workspace is running (`cd workspace && pnpm dev`), the transcript is persisted to `workspace/.transcript/current.jsonl`. Use the `workspace-mcp` tools to read buddy reactions and workspace state:

- **`read_transcript`** — Read recent transcript entries from user, Claude, and buddies. Use when you want to see what buddies (Shingle, Ponder, Gust, etc.) have said. Supports `source` and `buddyName` filters.
- **`search_transcript`** — Search transcript entries by keyword.
- **`get_workspace_status`** — Get active session preset, buddy roster, skills, and cooldown timers.

## Dependencies

### agent-almanac (optional, recommended)

The workspace's PTY Claude benefits from agent-almanac skills, agents, and teams. Currently available via global symlinks (`~/.claude/skills/`, `~/.claude/agents/`) pointing to a local clone.

**Local development**: No action needed — global symlinks are sufficient.

**Deployment elsewhere**: Clone agent-almanac and run its discovery installer, or add project-local symlinks:
```bash
# Option A: global install (recommended)
git clone https://github.com/pjt222/agent-almanac.git /path/to/agent-almanac
cd /path/to/agent-almanac && claude /install-almanac-content

# Option B: project-local (fallback)
mkdir -p .claude/agents .claude/skills
ln -s /path/to/agent-almanac/agents/*.md .claude/agents/
ln -s /path/to/agent-almanac/skills/* .claude/skills/
```
