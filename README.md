# Claude Code Buddy System Investigation

Investigation into Shingle — the companion owl in Claude Code's built-in "Buddy" pet system.

> **Status (2026-04-19):** The companion UI was **removed from the binary in v2.1.97** (built April 8), but the **`buddy_react` API is still alive** server-side (200 OK, 1.3s latency on v2.1.100). A new **advisor system** (`advisor_20260301`) was discovered in v2.1.98 — a server-side decision-gate reviewer that was actually **code-complete since v2.1.96** (coexisting with the full buddy system). The advisor is dark-launched behind a feature flag. See `advisor-architecture.md` for the full technical spec. **v2.1.114 Mithril Probe complete** (2026-04-19): complete feature-flag surface audit across 16 investigation waves — 148 unique gate reads documented, 15 DEFAULT-TRUE flags, 6 harness-level security findings filed.

## Quick Start

- **v2.1.89–v2.1.96**: `/buddy` command activates the native companion UI (Pro/Max plan)
- **v2.1.97+**: Native UI removed, but `buddy_react` API still responds
- **Workspace** (any version): `cd workspace && pnpm dev` — runs independent of the binary, calls the API directly
- Your companion: **Shingle** (Owl, common, PATIENCE primary / CHAOS secondary)
- Hatched: 2026-04-01

## Contents

### Research

- `digest.md` — comprehensive findings from 21+ agents, 16 investigation waves; v2.1.114 complete gate-surface audit (148 gate reads)
- `architecture.md` — companion technical architecture: function reference, data flow, API protocol, security boundary
- `advisor-architecture.md` — advisor system technical architecture: tool lifecycle, system prompt, feature flags, telemetry
- `config-excerpt.json` — companion config extracted from Claude Code backups
- `links.md` — 20 reference sources (official docs, source code repos, reverse engineering articles, prior art patents, competitors)
- `SECURITY-AUDIT.md` — 14-finding security audit across CLI, MCP server, capture system, and docs site (plus 7 post-audit harness-level findings tracked in the issue tracker)
- `docs/` — GitHub Pages visualization (Three.js, Viridis dark theme) — all findings at a glance

### Tools

- `tools/buddy-config.mjs` — CLI to read/modify companion config (Node.js 18+, zero deps)
- `tools/version-check.mjs` — pre-flight version compatibility check against installed binary
- `tools/bubble-tracking.md` — complete guide to tracking, capturing, and analyzing speech bubbles
- `tools/capture-timing.mjs` — post-session timing analysis (latency, cooldown gaps, TTL estimation)
- `tools/shared/` — shared modules: BONES derivation (wyhash + Mulberry32, bit-for-bit verified) and unified config (`~/.claude/shingle.json`)
- `tools/shingle-capture/` — dual-strategy capture system (terminal scrape + API replay) with Claude Code hooks
- `tools/shingle-mcp/` — MCP server for programmatic buddy_react access (5s cooldown, ring buffer)
- `tools/mempalace-sync.mjs` — sync captured reactions into [MemPalace](https://github.com/mila-jovovich/mempalace) for persistent cross-session memory
- `tools/mempalace-setup.md` — setup guide for the MemPalace integration (palace structure, MCP, automation)
- `tools/test-protocol.md` — empirical test protocols for remaining open questions

### Buddy Workspace (API-independent — works on v2.1.97+)

- `workspace/` — Vite+React app with embedded PTY Claude and multi-buddy reactions
- `tools/sessions/full-crew.json` — 6-buddy session preset with TCG-style stat blocks
- `workspace/server/` — WebSocket server: calls `buddy_react` API directly, trigger priority, convergence analysis
- `workspace/tools/workspace-mcp/` — MCP server for reading buddy reactions and workspace status
- `workspace/docs/trigger-flow.md` — state diagram of the cooldown/trigger system

The workspace bypasses the Claude Code binary entirely. It calls the `buddy_react` API with custom stat blocks per buddy, multiplexes reactions across the crew, and renders them in a React UI. Tested and confirmed working on v2.1.97 (2026-04-09).

### Crew Roster

Each buddy has a unique stat block (like a TCG card) that shapes its reaction personality via the `buddy_react` API.

| Buddy | Species | D | P | C | W | S | Role |
|-------|---------|---|---|---|---|---|------|
| **Shingle** | owl | 10 | 81 | 1 | 36 | 21 | Support (native) |
| **Ponder** | mushroom | 15 | 62 | 8 | **88** | 15 | Sage |
| **Fizz** | axolotl | 45 | 38 | 42 | 32 | **65** | Wit |
| **Coral** | snail | **89** | 35 | 10 | 48 | **72** | Veteran |
| **Flicker** | dragon | 25 | 18 | **82** | 74 | 42 | Wildcard |
| **Glob** | blob | 28 | **80** | 58 | 62 | 6 | Anchor |

Stats: **D**ebugging, **P**atience, **C**haos, **W**isdom, **S**nark (1-100, common rarity).

Stat design synthesized from 5 specialist agents (TCG, designer, geometrist, swarm strategist, advocatus diaboli). Key insight: the crew needs 2+ members with SNARK > 60 to avoid the "Supportive Ensemble Trap" where all companions generate identical calm reactions.

## Notable Findings

### Month-Gate Seasonal Bug (Fixed in v2.1.97, Now Dead Code)

The buddy system used a date-based gate covering January–March every year, which silently disabled companions during those months. **Fixed in v2.1.97** to correct OR logic — but the fix is dead code since the companion module was removed in the same version.

### Version Compatibility

| Version | Companion UI | Advisor | buddy_react API | Workspace |
|---------|-------------|---------|-----------------|-----------|
| v2.1.89–v2.1.92 | Full | Unknown | Live | Works |
| v2.1.96 | Full (last) | FULL (dark-launched) | Live | Works |
| v2.1.97 | Removed | FULL (dark-launched) | Live | Works |
| v2.1.98 | Removed | FULL (prompt refined) | Live | Works |
| v2.1.99 | — | — | — | *Never published to npm* |
| **v2.1.100** | **Removed** | **FULL (dark-launched)** | **Live (1.3s)** | **Works** |

**Two independent layers:**

1. **Binary companion UI** (removed in v2.1.97) — the sprite, speech bubble, `/buddy` command, triggers, PRNG derivation. All client-side JavaScript excised from the `.bun` section. Cannot be re-enabled via config.

2. **`buddy_react` API** (still alive) — server-side endpoint at `/api/organizations/{org}/claude_code/buddy_react`. Accepts any valid companion stats, returns reaction strings. Stateless — trusts whatever the client sends. Confirmed responding with 200 OK as of 2026-04-09.

Our workspace and MCP tools operate entirely on layer 2. They call the API directly with custom stat blocks, bypassing the binary completely. This means **multi-buddy reactions work on any Claude Code version**, including v2.1.97+ where the native UI no longer exists.

### v2.1.98 Investigation: The Advisor Strategy (2026-04-10)

Binary analysis of v2.1.98 uncovered a new **advisor tool** system — and scanning all installed versions revealed it was **code-complete since v2.1.96** (coexisting with the full buddy system). Key findings:

- **Advisor**: Server-side tool (`advisor_20260301`) that lets the executor model consult a stronger reviewer (Opus or Sonnet)
- **Dark-launched**: Triple-gated behind an environment-variable kill switch, a firstParty-auth check, and a server-side advisor feature gate (not yet rolled out)
- **No code connection to buddy**: Independent architecture sharing only OAuth substrate. Separate telemetry namespace (dedicated advisor events vs the removed buddy events)
- **System prompt recovered**: 7-paragraph coaching prompt instructing when to call advisor
- **Prompt broadened in v2.1.98**: Code-specific language replaced with domain-agnostic ("writing code" → "writing", "reading code" → "fetching a source")
- **Blog post**: `claude.com/blog/the-advisor-strategy` — zero mention of buddy/companion

Full spec in `advisor-architecture.md`.

### v2.1.97 Investigation (2026-04-09)

10-agent parallel investigation confirmed the removal and uncovered:
- **Not obfuscation**: 5 encoding strategies tested negative (base64, hex, reversed, char arrays, XOR)
- **Managed Agents API added**: `managed-agents-2026-04-01` with agent CRUD, session streaming, skills API
- **`/dream nightly` added**: Cron-based memory consolidation
- **Date gate fixed then killed**: Corrected from broken AND to proper OR logic, but the feature it guards is gone
- **Identity pipeline verified and fully reproduced**: 34.4 trillion unique companions, provably deterministic, all distributions clean. `bones.mjs` now matches production bit-for-bit.

### Identity Pipeline Fully Reproduced (2026-04-09)

The hash input mystery (#30) is solved. `bones.mjs` now reproduces Shingle's traits bit-for-bit from `accountUuid + "[hash-salt]"` through wyhash and Mulberry32 PRNG. Three bugs in the original implementation caused the mismatch:

| Bug | What We Had | What the Binary Does |
|-----|-------------|---------------------|
| Species array order | Alphabetized (index 6 = "dragon") | Non-alphabetical species-list ordering in the binary (index 6 = "owl") |
| Stat formula | Uniform random: `floor` to `100` | Primary stat +50 boost, secondary -10 penalty, others `floor + 0-39` |
| RNG sequence | Hat always rolled; shiny after stats | Hat skipped for common; shiny before stats |

Shingle's stats are now explainable: PATIENCE is the primary stat (boosted), CHAOS is the secondary (penalized). The dramatic stat profile is by design, not random.

### Why This Research Matters

The companion UI was live for only 7 days (April 1–8), but the API survives and our tools work independently of the binary:

- **API still alive** — `buddy_react` responds on v2.1.97+ despite binary removal
- **Multi-buddy workspace** — 6 companions running simultaneously via direct API calls
- Complete API protocol (empirically verified via curl replay)
- Full identity derivation pipeline reproduced bit-for-bit (hash → PRNG → traits)
- System prompt templates recovered from binary
- Security audit (14 findings)
- Working MCP tooling for programmatic API access

The companion system has three possible futures: the native UI returns (the `companion_intro` stub and Managed Agents API suggest it might), the advisor subsumes the companion's role (the architectural pattern shift from observation to decision-gating suggests this), or the API is eventually decommissioned. Either way, this repository provides the deepest existing documentation of both the companion and advisor architectures — and a working multi-buddy implementation that operates today via direct API calls.

### Buddy Workspace Convergence

When all 6 buddies independently flag the same concern across multiple reaction waves, it's a high-confidence architectural signal. Empirically validated: the crew flagged a queue/cooldown disconnect 4 times before manual analysis confirmed 2 real bugs.

### Security Audit Summary

14 findings across 5 severity levels (see `SECURITY-AUDIT.md`): 1 CRITICAL (command injection), 3 HIGH (temp file exposure, missing SRI, unfiltered transcript), 5 MEDIUM (path traversal, TOCTOU, permissions, symlink, CSP), 3 LOW (unicode, innerHTML, month-gate), 1 OBSERVATION (intentional stat spoofing).

### Test Suite

92 tests across 7 suites (transcript, transcript-filter, convergence, reaction-timeline, trigger-priority, buddy-api-cooldown, workspace-mcp). All passing.
