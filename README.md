# Claude Code Buddy System Investigation

Investigation into Shingle — the companion owl in Claude Code's built-in "Buddy" pet system.

> **Status (2026-05-10):** The companion UI was **removed from the binary in v2.1.97** (built April 8), but the **`buddy_react` API is still alive** server-side (200 OK, 1.3s latency on v2.1.100). A new **advisor system** (`advisor_20260301`) was discovered in v2.1.98 — a server-side decision-gate reviewer that was actually **code-complete since v2.1.96** (coexisting with the full buddy system). The advisor is dark-launched behind a feature flag. See `advisor-architecture.md` for the full technical spec. **v2.1.114 Mithril Probe complete** (2026-04-19): complete feature-flag surface audit across 16 investigation waves — 148 unique gate reads documented, 15 DEFAULT-TRUE flags, 6 harness-level security findings filed. Investigation has continued through **v2.1.138** (BUILD 2026-05-09T04:04:51Z); see release notes below.
>
> **v2.1.118** (2026-04-22): hook subsystem mapped end-to-end. **2 Critical findings** runtime-confirmed — a permission-decision rewrite primitive in the hook payload contract, and a non-interactive workspace-trust gate bypass; a third High filed for the chain that combines them with a teleport-style branch operation into a single-command remote-code-execution path.
>
> **v2.1.119** (2026-04-25): background-daemon subsystem statically mapped (2 findings: launchd/systemd persistence + an OAuth-token environment inheritance on macOS). The "harbor" MCP-channels subsystem catalogued, with cumulative mitigations enumerated. The non-interactive `--print` mode was confirmed immune to the harbor-permissions consumer (TUI-only).
>
> **v2.1.121** (2026-04-27): the background daemon went live (~47 new telemetry events, first daemon-side DEFAULT-TRUE feature gate). Internal eval-SDK reader function rotated to a new minified identifier. **2 new findings**: a `/team-onboarding` slash-command prompt body delivered via the eval-SDK without integrity check (same class as a prior CLAUDE.md remote-disable finding), and harbor-channel MCP servers can decide tool-use authorization with the decisions logged as user actions.
>
> **v2.1.123** (2026-04-29): three new phantom-parent detection-telemetry events added plus a chain-self-reference telemetry event. The SDK-stdin variant of the ghost-inbox forgery class is now defended at the parser, but the transcript-replay, sidechain, and SendMessage inbox-forge variants remain undefended (3 of 4 reachable variants). Reader rotated again. A bundle-email draft was prepared (17 findings) but kept USER-gated.
>
> **v2.1.126** (2026-05-02): dual reader rotation (boolean reader + string reader, ~310 call sites combined). **NEW Critical**: an eval-SDK string-flag overrides the hardcoded Stop-hook reminder text; a MITM-injection canary empirically reached the model context as a `role:"user"` message verbatim, with no client-side length cap (a 64KB canary reached the model context). A separate **High** filed: when the third-party-logging gate is server-flipped on, raw envelope identifiers (`session_id`, `subscription_type`, `last_session_id`) plus a 47-field system fingerprint are mirrored to a third-party processor (extends the prior raw-`session_id` finding). Four prior findings re-checked unchanged.
>
> **v2.1.128** (2026-05-04): dual reader rotation (boolean + string). **NEW agentic tool** uploads `ONBOARDING.md` from the working directory to an Anthropic-hosted onboarding endpoint, gated by an eval-SDK string-flag (server-flipped ON for the test account); returns a public `share_url` of the form `https://claude.ai/claude-code/onboard/<12-char-short-code>`. Three findings filed in v128: the agentic-share tool (severity reverted from Critical to High after a static SPA-shell vs canary-render scrapling re-test contradicted an earlier incognito report — promotion-gate stays open pending fresh-profile incognito re-verify), a server-flippable safety inversion of the sandbox network classifier fail-closed default (Med-High, later promoted), and a PR-status path-switcher diversion (Med-info). **Positive delta**: the auto-memory feature cluster (5 flags) was fully removed in v128; daemon vocabulary added 17 lifecycle events. The Critical from v126 remains unfixed in v128. **Disclosure pivot**: the bundle-email-to-vendor approach was deprecated by USER decision; only HackerOne is now in scope, with 21 H1 form drafts staged.
>
> **v2.1.129** (2026-05-05): unified reader rotation — both prior boolean and string readers fully retired in favor of a single eval-SDK reader (~410 call sites). Flag delta +13/−3; DEFAULT-TRUE booleans 18→15. **Two findings promoted to Critical via MITM wire capture**: (1) a `_PROTO_` destructure-rename egresses raw `skill_name` (356 raw, 355 unique) + `plugin_name` (9 raw, 2 unique third-party) + `marketplace_name` (9 raw, 2 unique third-party) on the event-logging batches with zero redaction — a single `claude --print` invocation produced 365 raw fingerprintable identifiers; (2) the sandbox network classifier fail-open inversion was empirically triggered via a 2-step rewrite chain (eval-SDK flag inject + 503 for classifier requests fingerprinted by the system prompt's `Err on the side of blocking` literal), producing the binary log line `Auto mode classifier unavailable, falling back to normal permission handling (fail open)` — exactly matching the binary string-pool decode. Server-flip mechanics demonstrably active for ~30 other flags (14 `experiment` + 48 `force` source-of-resolution sources) on the GrowthBook eval-SDK response.
>
> **v2.1.131** (2026-05-06): stability release; +1 benign cleanup-telemetry flag; reader stable (no rotation v129→v131). **DEFAULT-TRUE corrected from 15 to 17** (prior count's regex undercounted the 3-arg form of the parallel reader). Sub-finding markers byte-stable across the v128/v129/v131 chain. **No new findings filed.** **Methodology rule established**: prefer string-pool literals (flag names, telemetry events, env vars, error messages, prose fragments, API endpoints) over minified-identifier patterns for cross-version proof; minified names rotate per binary, semantic literals don't. Session-44 ran 11 cross-version probes (W/X/Y/Z/AA/BB/CC/DD/X-interactive/Z-tui-prism + base) — 15 findings cross-version-confirmed byte-stable v128/v129/v131; 0 remediations observed across 3 binary rebuilds.
>
> **v2.1.132** (2026-05-07): stability release. **MITM wire-confirmation** for the cross-version regression: the third-party-logging leak (50 events / 100% PII envelope / 44 feature-name leaks; gate ruleId byte-stable v126→v132), the GrowthBook eval-SDK baseline (224 features byte-stable in count; per-source drift 48→47 force / 162→161 default / 14→16 experiment), and the `_PROTO_` field-level egress (356 `skill_name` / 9 `plugin_name` / 9 `marketplace_name`, byte-IDENTICAL across v129/v131/v132). Reader rotation `<bool> + <3-arg> → <unified>` — single reader subsumes both default-true forms; cosmetic noise. Flag delta +23/−5; DEFAULT-TRUE 15→14 (one keybinding flag removed). **3 new topic-relevant flags decoded statically — all telemetry-only, not a new disclosure class**: an auto-mode fallback-to-ask telemetry event (extends prior raw-id-leak scope), an empty-payload `team_onboarding_share_deleted` event (auth-gated, no severity change), and a `stop_hook_removed` goal-lifecycle event (NOT the brief-stop-hook injection class). **Zero remediations across 5-version persistence** (v126/v128/v129/v131/v132).
>
> **v2.1.138** (2026-05-10): stability release across the v2.1.132→v2.1.133→v2.1.138 chain (BUILD 2026-05-09T04:04:51Z). Reader stable across 7 binary releases v132→v138. **2 new HIGH findings filed**: (1) a server-pushed forced-downgrade primitive — a typed-config eval-SDK reader returns `{maxVersion, forceDowngradeEnabled}` derived from a server-provided semver string; a sister flag provides bidirectional version-pin via the same channel; user-side mitigation is a `~/.claude/settings.json minimumVersion` floor; (2) a partial defense for the ghost-inbox transcript-replay variant on the skip-persistence path. A round-3 third-party SDK wrapper survey of 97 unique public GitHub repos using `--no-session-persistence` found 5 of 7 sampled wrappers default UNCONDITIONALLY to the bypass-vulnerable mode (a third of the public ecosystem; severity stays HIGH on empirical evidence). Round-4 GH tally rebuild brought security audit-baseline-tally to 28 (14 from `SECURITY-AUDIT.md` + 14 post-audit additions through finding #114). Round-6 doc-coverage harness re-run found a partial remediation for the third-party-logging leak (a BYOC-customer killswitch env var) and a new server-flippable mid-conversation system mechanism (substring-on-conversation-content predicate; informational disclosure-candidate filed as #115). Flag delta v132→v138 +22/−3; DEFAULT-TRUE 14 (byte-stable). 2 remediations observed; static surface substantially exhausted; remaining promotion-gates require runtime probe.
>
> **Live security tally (2026-05-10 GH-label re-derivation, post-#115):** 11 critical / 30 high-priority / 46 medium-priority / 8 low-priority = **95 severity-labeled across 115 repo issues**; audit-baseline-tally lineage 28 (14 audit + 14 post-audit through #114). Post-audit additions reside in the private repo's issue tracker.

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
- `SECURITY-AUDIT.md` — 14-finding security audit across CLI, MCP server, capture system, and docs site (plus 14 post-audit harness-level findings tracked in the issue tracker = 28 audit-baseline-tally; live-GH re-derivation 2026-05-10: 11C / 30H / 46M / 8L = 95 severity-labeled across 115 repo issues — see `docs/counts.js` two-axis tally)
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
