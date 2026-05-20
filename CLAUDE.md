# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Purpose

Research repository documenting findings about Claude Code's built-in "Buddy" companion system, the "Advisor Strategy" system, and — since v2.1.118 — the wider Claude Code harness (hooks, background daemon, MCP channels, server-controlled config channels). The companion UI was removed in v2.1.97, but the server-side reaction API is still alive. The advisor system (tool name `advisor_20260301`) was code-complete in v2.1.96, coexisting with the full buddy, and is dark-launched behind an advisor feature gate. Our workspace and MCP tools call the buddy API directly — multi-buddy reactions work on any version. From v2.1.118 onward the investigation has broadened into a rolling per-version security audit of the harness; the current focus is the server-to-client config/control channel and its wire-confirmed injection primitives.

## Repository Structure

- `digest.md` — comprehensive investigation findings from 21+ agents across 4 waves
- `architecture.md` — companion technical deep-dive: function reference, data flow diagrams, API protocol, security boundary
- `advisor-architecture.md` — advisor system spec: tool lifecycle, system prompt, feature flags, telemetry, buddy comparison
- `config-excerpt.json` — companion config extracted from `~/.claude/backups/` state files
- `links.md` — 20 reference sources organized by category (official docs, source analysis, reverse engineering, prior art, competitors)
- `SECURITY-AUDIT.md` — original 14-finding tooling audit (1 CRITICAL, 3 HIGH, 5 MEDIUM, 3 LOW, 1 OBSERVATION). The live security tally has since grown well beyond this: `docs/counts.js` tracks an audit-baseline lineage and a live re-derivation of 12 critical / 30 high / 46 medium / 8 low across 135 repo issues (derived 2026-05-20). `docs/counts.js` is authoritative — do not contradict it.
- `README.md` — project overview and per-version status timeline
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
- `tools/probe-sandbox/` — containerized MITM probe harness (two-service docker compose: a proxy + claude-code on an isolated bridge network; filesystem/process-isolated from the host's live REPL). Used for runtime wire-confirmation of server-controlled-channel findings.
- `tools/probe-sandbox/probes/lib/tui-driver.exp` — `expect`-based PTY keystroke automation that drives a real interactive Claude Code TUI past login + theme picker. Required for any finding gated behind the Ink React tree (`claude --print` short-circuits before it mounts).
- `tools/mitm-harness/` — host-side MITM (simpler, no filesystem isolation; use when a probe must mutate `~/.claude/*` or run alongside live host sessions)
- `workspace/tools/workspace-mcp/` — MCP server for reading workspace transcript and status
- `tools/test-protocol.md` — empirical test protocols for bubble TTL and narrow terminal behavior
- `results/` — per-session probe writeups (round-1 flag deltas, runtime probes, gap analyses) — the long-form source of truth behind every claim summarized in `README.md`
- `docs/` — GitHub Pages visualization (Three.js, Viridis dark theme); `docs/counts.js` is the single source of truth for every displayed count

## Key Context

- The buddy system is a first-party Claude Code feature (v2.1.89+, Pro/Max plan), launched April 1, 2026
- Companion identity is deterministic: Bun.hash (wyhash) of user ID with a fixed salt string, feeding a Mulberry32 PRNG (FNV-1a is the Node.js dev fallback only)
- Only 3 fields persisted in `~/.claude/.claude.json`: name, personality, hatchedAt. All other traits re-derived from hash each session.
- Shingle is architecturally separate from the main Claude Code agent — strictly unidirectional (observes but cannot write back)
- 6 reaction triggers: turn, hatch, pet, test-fail, error, large-diff (complete, idle, silence were debunked)
- Binary at `~/.local/share/claude/versions/`. Version chain probed: v2.1.90/v2.1.92 (companion), v2.1.96–v2.1.100 (advisor), v2.1.101/v2.1.104 (loop system), v2.1.105–v2.1.114 (harness/gate-surface), v2.1.116–v2.1.145 rolling per-version flag-diff (skips: v2.1.120/122/124/125/127/130/134/135/136/137/139). **Current = v2.1.145** (npm `latest`, BUILD 2026-05-19). All 21 priority-finding literals byte-stable v143→v145, no remediation observed.
- Date gate bug: a date-based gate covering Jan–Mar each year disables the companion during those months on any year from 2026 onward

## Advisor System Context

- The advisor (tool name `advisor_20260301`) is a server-side Messages API tool — NOT a separate endpoint like the buddy reaction API
- Valid advisor models: `["opus", "sonnet"]` — `"sonnet"` resolves to `claude-sonnet-4-6`; `"opus"` resolves to `claude-opus-4-7` for tier-eligible accounts, `claude-opus-4-6` fallback otherwise. See `advisor-architecture.md` §3.
- Feature gate: composed of a feature-disable env-var check, a first-party auth check, and an advisor feature flag
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

## Server-Controlled Channels Context (post-v2.1.118)

From v2.1.118 onward the investigation's primary focus is the **server-to-client config/control channel** — a path that pushes feature flags and string-typed config to the client at startup. It is undocumented in official Claude Code docs (see `results/docs-gap-analysis-2026-05-20.md`).

- **Flag readers rotate per binary release.** Cosmetic minifier churn — never anchor cross-version checks on reader identifier names. The boolean reader and the typed reader each rotate identifiers across recent releases. Use string-pool literals (flag names, telemetry events, error messages) for cross-version claims, not minified identifiers.
- **7-layer flag resolution**, ~410 gate reads, 18 DEFAULT-TRUE (15 boolean + 3 typed) — byte-identical v143→v145.
- **Wire-confirmed server-push injection primitives** (all ride the same server-controlled channel; details in `results/`), referred to by finding number:
  - **#106 CRITICAL** — an empty-default string-flag overrides the hardcoded Stop-hook reminder; reaches the model context as a synthetic user-text message verbatim, no length cap, no cert pinning.
  - **#108 CRITICAL** — a default-TRUE flag, server-flippable safety inversion of the sandbox/auto-mode permission classifier (fail-open).
  - **#110 CRITICAL** — raw plugin/skill/marketplace identifier field-level egress on the event-logging batches (hundreds of raw fields per session, wire-identical v129→v145).
  - **#113 HIGH** — a server-pushed forced-downgrade primitive. Wire-confirmed on an interactive TUI (session-59): the auto-updater performed the downgrade with no user prompt.
  - **#127 CRITICAL** — a server-pushed terminal-notification string. Wire-confirmed on an interactive TUI (session-59): rendered verbatim with unsanitized ANSI escapes and a bare URL (phishing surface).
  - **#105 HIGH** — a server-flippable third-party-logging gate ships envelope identifiers plus a system fingerprint to a third-party processor. Extends an earlier envelope-leak finding.
- **#31 AC3** (subagent ghost-inbox / attribution-forgery class) **remains UNDEFENDED as of v2.1.145.** A new v145 guard addresses skill self-recursion only, orthogonal to the inbox path.
- **Runtime probing.** Findings gated behind the interactive TUI require `tools/probe-sandbox/` + `tui-driver.exp`. `--print` and `claude doctor` short-circuit before the Ink React tree mounts, so downstream gates never fire.

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
