# Claude Code Buddy System Investigation

Investigation into Shingle — the companion owl in Claude Code's built-in "Buddy" pet system, and the wider hidden systems discovered alongside it.

> **Status (2026-04-17):** The companion UI was **removed from the binary in v2.1.97** (built April 8), but the **`buddy_react` API is still alive** server-side (200 OK, ~1.3s latency). A new **advisor system** (`advisor_20260301`) was discovered — code-complete since v2.1.96, dark-launched behind a feature flag. v2.1.111/v2.1.112 (2026-04-16/17) add Opus 4.7 launch system, proxy-auth helper, memory survey, relay chain, PowerShell tool gate, and GrowthBook remote system-prompt override. See visualization for full architecture.

## Quick Start

- **v2.1.89–v2.1.96**: `/buddy` command activates the native companion UI (Pro/Max plan)
- **v2.1.97+**: Native UI removed, but `buddy_react` API still responds
- **Workspace** (any version): `cd workspace && pnpm dev` — runs independent of the binary, calls the API directly
- Your companion: **Shingle** (Owl, common, PATIENCE primary / CHAOS secondary)
- Hatched: 2026-04-01

## Contents

### Visualization

- `docs/` — GitHub Pages interactive visualization — all findings at a glance
  - Buddy companion system (stats, identity, API, capture)
  - Advisor strategy (architecture, feature gate, system prompt)
  - Lineage (version timeline, binary analysis)
  - **Harness Flow** — complete structural map of the Claude Code harness: 14 subsystems + v2.1.111+ additions

### Tools

- `tools/buddy-config.mjs` — CLI to read/modify companion config (Node.js 18+, zero deps)
- `tools/shared/` — shared modules: config reader (`~/.claude/shingle.json`)
- `tools/shingle-mcp/` — MCP server for programmatic buddy_react access (5s cooldown, ring buffer)
- `tools/sessions/` — multi-buddy session presets (deep-focus, debug-squad, dream-lab, full-crew)
- `SECURITY-AUDIT.md` — 14-finding security audit across CLI, MCP server, capture system, and docs site
- `links.md` — reference sources organized by category

### Buddy Workspace (API-independent — works on v2.1.97+)

- `workspace/` — Vite+React app with embedded PTY Claude and multi-buddy reactions
- `workspace/server/` — WebSocket server: calls `buddy_react` API directly, trigger priority, convergence analysis
- `workspace/tools/workspace-mcp/` — MCP server for reading buddy reactions and workspace status

The workspace bypasses the Claude Code binary entirely. It calls the `buddy_react` API with custom stat blocks per buddy, multiplexes reactions across the crew, and renders them in a React UI.

## Crew Roster

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

The buddy system has a date gate that silently disabled companions during January-March every year. **Fixed in v2.1.97** to correct the logic — but the fix is dead code since the companion module was removed in the same version.

### Version Compatibility

| Version | Companion UI | Advisor | buddy_react API | Workspace |
|---------|-------------|---------|-----------------|-----------|
| v2.1.89–v2.1.92 | Full | Unknown | Live | Works |
| v2.1.96 | Full (last) | FULL (dark-launched) | Live | Works |
| v2.1.97 | Removed | FULL (dark-launched) | Live | Works |
| v2.1.100 | Removed | FULL (dark-launched) | Live (1.3s) | Works |
| v2.1.112 | Removed | FULL (dark-launched) | Live | Works |

**Two independent layers:**

1. **Binary companion UI** (removed in v2.1.97) — the sprite, speech bubble, `/buddy` command, triggers, PRNG derivation. All client-side JavaScript excised from the `.bun` section. Cannot be re-enabled via config.

2. **`buddy_react` API** (still alive) — server-side endpoint at `/api/organizations/{org}/claude_code/buddy_react`. Accepts any valid companion stats, returns reaction strings. Stateless — trusts whatever the client sends. Confirmed responding with 200 OK as of 2026-04-09.

Our workspace and MCP tools operate entirely on layer 2. They call the API directly with custom stat blocks, bypassing the binary completely. This means **multi-buddy reactions work on any Claude Code version**, including v2.1.97+ where the native UI no longer exists.

### v2.1.98 Investigation: The Advisor Strategy (2026-04-10)

Binary analysis of v2.1.98 uncovered a new **advisor tool** system — and scanning all installed versions revealed it was **code-complete since v2.1.96** (coexisting with the full buddy system). Key findings:

- **Advisor**: Server-side tool (`advisor_20260301`) that lets the executor model consult a stronger reviewer (Opus or Sonnet)
- **Dark-launched**: Triple-gated behind env var + firstParty auth + feature flag (not yet rolled out)
- **No code connection to buddy**: Independent architecture sharing only OAuth substrate. Separate telemetry namespaces.
- **System prompt recovered**: 7-paragraph coaching prompt instructing when to call advisor
- **Prompt broadened in v2.1.98**: Code-specific language replaced with domain-agnostic phrasing
- **Blog post**: `claude.com/blog/the-advisor-strategy` — zero mention of buddy/companion

### Identity Pipeline (2026-04-09)

The companion identity is **fully deterministic**: username/ID → hash function → Mulberry32 PRNG → species, name, personality, stats, hat, shiny. 34.4 trillion unique companions total; all trait distributions verified clean.

Shingle's stats are explainable: PATIENCE is the primary stat (boosted +50), CHAOS is the secondary (penalized -10). The dramatic stat profile is by design, not random.

### v2.1.111/v2.1.112 Systems (2026-04-17)

- **Opus 4.7 launch system**: Launch modal with view-count tracking; `claude-opus-4-7` model ID; `xhigh_effort` level maps to it
- **Proxy auth helper**: 5 new env vars for corporate MITM proxies (Zscaler/Netskope); subprocess token fetcher with TTL cache
- **Memory survey**: Triggered by "memory"/"memories" keywords in conversation
- **Relay chain v1**: Feature flag that strips parallel-Bash instructions from system prompt (for alternative execution routing)
- **PowerShell gate**: Windows-only PowerShell tool controlled by feature flag (default OFF)
- **GrowthBook system-prompt override**: Remote-mode env var specifies a GrowthBook flag whose string value replaces the system prompt

### v2.1.112 Binary Probe Results (2026-04-17, non-interactive exhaust)

- **Hook system: 27 types** (was 9 documented) — 18 undocumented types decoded including `TeammateIdle`, `TaskCreated/Completed`, `Elicitation/ElicitationResult`, `ConfigChange`, `WorktreeCreate/Remove`, `InstructionsLoaded`, `CwdChanged`, `FileChanged`
- **Datadog 3rd-party sink**: ~55 events routed to Datadog (separate from Anthropic's own telemetry); subscription tier and user type included in every entry; 1-in-30 user sampling via device ID hash
- **Agent teams** (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS`): experimental gate; GrowthBook kill-switch; custom agents appear as "user-defined" in telemetry regardless of their actual name
- **/fast (Penguin Mode)**: opus-4-6 only; org-level check at startup; cooldown system; `fastModePerSessionOptIn` setting prevents persistence across sessions
- **/passes referral system**: Max plan + org required; 3 guest passes; eligibility + redemptions endpoints
- **File-history (Rewind)**: plaintext file snapshots at `~/.claude/file-history/`; no cleanup mechanism; 216+ sessions accumulate on disk
- **GrowthBook startup PII**: 14 user attributes including email sent to Anthropic-hosted GrowthBook on every startup for remote flag evaluation

### Why This Research Matters

The companion UI was live for only 7 days (April 1–8), but the API survives and our tools work independently of the binary:

- **API still alive** — `buddy_react` responds on v2.1.97+ despite binary removal
- **Multi-buddy workspace** — 6 independent companions with distinct personalities
- **Advisor system** — production-grade review layer dark-launched since v2.1.96
- **Harness map** — 14+ subsystems characterized, including CCR cloud-runner, Kairos loops, MCP client, plugin system, auto-dream memory scheduler, and v2.1.112 additions

## Security Findings

15 findings across the companion system, MCP server, capture tooling, and data handling. Full details in `SECURITY-AUDIT.md`.

Highlights:
- **1 CRITICAL** — attribution laundering via ghost-inbox SendMessage in managed agent teams
- **3 HIGH** — command injection surface, credential exposure via stat spoofing, unilateral remote-session consent
- **5 MEDIUM** — path traversal, memory injection, mTLS gap, quiet CCR consent, TOCTOU state race

## Open Questions

1. **Hash input confirmation** — `accountUuid` vs `userId` vs derived ID (need live firstParty session)
2. **Advisor empirical capture** — advisor tool call has not been intercepted live yet (MITM harness ready)
3. **Hook payload contracts** — PreToolUse/PostToolUse/Stop payloads not yet captured
4. **Per-turn loop ordering** — exact sequence of tool result → stream handler → hook checkpoints unverified
5. **OAuth refresh disk writeback** — whether the 401 refresh callback persists the new token to `.credentials.json`

## License

MIT
