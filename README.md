# Claude Code Buddy System Investigation

Investigation into Shingle — the companion owl in Claude Code's built-in "Buddy" pet system.

> **Status (2026-05-20, session 59):** The companion UI was **removed from the binary in v2.1.97** (built April 8), but the **`buddy_react` API is still alive** server-side. The **advisor system** (`advisor_20260301`) is code-complete since v2.1.96, dark-launched behind a server-side feature flag (see `advisor-architecture.md`). Since v2.1.118 the investigation has broadened into a rolling per-version security audit of the wider Claude Code harness. **Current binary: v2.1.145** (npm `latest`, BUILD 2026-05-19). All 21 priority-finding literals are **byte-stable v143→v145 with no remediation observed**. Live security tally (`docs/counts.js`, derived 2026-05-20): **12 critical / 30 high / 46 medium / 8 low** across 135 repo issues.
>
> **What changed since v2.1.138 (sessions 53–59):** A containerized MITM probe harness (`tools/probe-sandbox/`) plus `expect`-based PTY keystroke automation (`probes/lib/tui-driver.exp`) now drives a real interactive Claude Code TUI — unblocking findings gated behind the Ink React tree that `claude --print` cannot reach. Two findings were **wire-confirmed on an interactive TUI** in session-59: **#113** (a server-pushed forced-downgrade primitive — HIGH; an injected version-config payload made the auto-updater perform the downgrade with no prompt) and **#127** (a server-pushed terminal-notification string — CRITICAL; rendered verbatim with **unsanitized ANSI escapes** and a bare phishing URL). **#115** (a mid-conversation-system substring-trigger mechanism) was **negative** on a full interactive TUI and relabeled `informational`. **#31 AC3** (subagent ghost-inbox / attribution-forgery class) **remains undefended** as of v2.1.145 — the v145-new skill self-recursion guard is an orthogonal fix. See `results/runtime-probes-session-{58,59}.md` and `results/v2.1.144-145-round-1-flag-delta.md`.
>
> **The disclosure asymmetry is itself a finding.** A documentation gap analysis (`results/docs-gap-analysis-2026-05-20.md`) confirms official Claude Code docs are accurate for every data path the *user explicitly triggers* (each with a documented opt-out), but **silent on every server-controlled channel** — the server-to-client config-push channel is undocumented entirely, and forced-downgrade, startup-notice, the third-party logging sink, and the identity metadata on default-on metrics are all absent.
>
> **Per-version timeline (v2.1.118 → v2.1.145).** Each line points to the `results/` file with the full analysis.
>
> - **v2.1.118** — hook subsystem mapped; 2 Criticals runtime-confirmed (#97 a permission-decision rewrite primitive in the hook payload contract, #98 a non-interactive workspace-trust bypass); a teleport-style RCE chain #99 filed.
> - **v2.1.119** — background-daemon subsystem statically mapped (#100, #101); the harbor MCP-channels subsystem catalogued (#102); `--print` confirmed immune to harbor permissions (TUI-only).
> - **v2.1.121** — daemon goes live (+47 events, first daemon-side DEFAULT-TRUE flag); a `/team-onboarding` server-prompt #103 (same class as a prior CLAUDE.md remote-disable finding); harbor permissions runtime-confirmed in TUI mode (#104).
> - **v2.1.123** — new phantom-parent detection telemetry; the SDK-stdin variant of #31 AC3 defended at parse, but transcript-replay / sidechain / inbox-forge variants NOT defended (3 of 4 reachable variants).
> - **v2.1.126** — **#106 CRITICAL** filed: an empty-default string-flag overrides hardcoded Stop-hook text; a canary reached the model context as `role:"user"` verbatim, no length cap, no cert pinning. **#105 HIGH** filed: a third-party processor receives `session_id`/`subscription_type` + a 47-field fingerprint when the third-party-logging gate is server-flipped on (extends an earlier envelope-leak finding).
> - **v2.1.128** — a `ShareOnboardingGuide` agentic tool uploads `ONBOARDING.md` to an Anthropic endpoint (**#107 HIGH**). **#108** filed: a server-flippable safety inversion of the sandbox/permission classifier. **#109** filed: a PR-status path-switcher. The auto-memory feature cluster was fully removed — auto-memory retired.
> - **v2.1.129** — **#110 promoted HIGH→CRITICAL** via MITM: a single `claude --print` invocation leaked 356 raw `skill_name` + 9 `plugin_name` + 9 `marketplace_name` on event-logging batches (zero redaction, fingerprintable, includes 3rd-party plugin names). **#108 promoted to CRITICAL** via MITM: a synthetic rewrite produced the literal `(fail open)` log line.
> - **v2.1.131 / v2.1.132** — stability releases; cross-version regression confirmed all priority findings byte-stable; wire-confirmation runs re-verified #105 (third-party logging, 50 events / 100% PII envelope) and #110 (356/9/9 IDENTICAL). Zero remediations.
> - **v2.1.138** — **2 new HIGH disclosures**: **#113** (a server-pushed forced-downgrade primitive) and **#114** (a skip-persistence bypass that opens a #31 AC3 partial-defense gap; a third-party SDK-wrapper survey of 97 public repos kept #114 at HIGH). 2 remediations observed; static surface substantially exhausted.
> - **v2.1.140–v2.1.143** — **#127 filed** (a server-pushed TUI notification injection) and **promoted HIGH→CRITICAL** on probe-evidence (ANSI escape + OSC 8 phishing). 3 defensive primitives added (a remote-control bridge event-attestation layer, a settings-hierarchy auto-mode defense, telemetry-only model-response keyword detection); a multi-store team-memory mirror decoded as defense-in-depth (not a finding). No new disclosures.
> - **v2.1.144 / v2.1.145** — static round-1: +14/-6 flags v143→v145; the boolean reader and the typed reader each rotated identifiers; DEFAULT-TRUE stable at 18. **All 21 priority-finding literals byte-stable, no remediation.** New signals decoded: a server-pushed plugin allowlist (now wired — catalogued), a new third-party-logging event class (#105-adjacent), a skill self-recursion guard (defensive, orthogonal to #31 AC3). #113 + #127 re-probed on v145 — both reproduce.

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
- `SECURITY-AUDIT.md` — original 14-finding security audit across CLI, MCP server, capture system, and docs site. The live tally has since grown well beyond this with post-audit harness-level findings: `docs/counts.js` tracks an audit-baseline lineage and a live-GH re-derivation (2026-05-20) of **12 critical / 30 high / 46 medium / 8 low = 96 severity-labeled across 135 repo issues**. `docs/counts.js` is the single source of truth — see its two-axis tally.
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
- `tools/probe-sandbox/` — containerized MITM probe harness (a proxy + claude-code on an isolated bridge network; filesystem/process-isolated from the host REPL) for runtime wire-confirmation of harness findings; `probes/lib/tui-driver.exp` drives a real interactive Claude Code TUI via `expect`-based PTY keystroke automation
- `tools/mitm-harness/` — host-side MITM (no filesystem isolation; for probes that mutate `~/.claude/*`)

### Buddy Workspace (API-independent — works on v2.1.97+)

- `workspace/` — Vite+React app with embedded PTY Claude and multi-buddy reactions
- `tools/sessions/full-crew.json` — 6-buddy session preset with TCG-style stat blocks
- `workspace/server/` — WebSocket server: calls `buddy_react` API directly, trigger priority, convergence analysis
- `workspace/tools/workspace-mcp/` — MCP server for reading buddy reactions and workspace status
- `workspace/docs/trigger-flow.md` — state diagram of the cooldown/trigger system

The workspace bypasses the Claude Code binary entirely. It calls the `buddy_react` API with custom stat blocks per buddy, multiplexes reactions across the crew, and renders them in a React UI. Tested and confirmed working on v2.1.97 (2026-04-09).

### Pi-passport research tooling (subsystem PIPASS, batched as #111)

Research-grade tooling demonstrating that an OAuth bearer extracted from a logged-in first-party Claude Code session can drive `/v1/messages` from outside the official binary, against the same Pro/Max subscription billing tier. The tooling exercises a **billing-tier classifier evasion** via a sanitiser ladder (light → nuclear) applied to system-prompt blocks. **Disclosure batched as a single bundled report (research-grade; no in-the-wild abuse).**

Statistical scope is honest: 13 sanctioned-path L1 trials within a 2026-05-07 corpus snapshot (Clopper-Pearson 95% one-sided LB = 0.7942). Effective independent units = 1 classifier-snapshot, **NOT** the 13 Bernoulli trials. Disclosure-grade claim is "demonstrated bypass within snapshot," not "durable bypass."

Multi-perspective audit (7 reviewers; opaque-team) ran on 2026-05-10. **All Critical and High items closed across 6 follow-up commits the same day.** Hardening themes:

- **Shell-script `$PATH`-attacker token-exfil class — CLOSED**: empirically demonstrated (sandbox, fake bearer) via two independent paths (pre-strip dependency-binary shim + post-strip `PATH` forwarding); closed via absolute-path resolution at startup, `$PATH` sanity-check refusing untrusted entries, and hardcoded minimal `PATH` in the env-strip allowlist (no parent-shell forwarding).
- **CWE-78 arithmetic-injection — CLOSED**: integer-format guard before bash `$(( ... ))` context.
- **Mid-session OAuth refresh — ADDED**: single-flight background scheduler with clock-skew defense (server `Date` header is canonical reference for token expiry); TZ-stress test matrix confirms epoch-only invariant.
- **Anthropic-API runtime drift watcher — ADDED**: monitors `Sunset` / `Deprecation` / `anthropic-deprecation-notice` headers + version-error body types; once-per-process dedup.
- **Pi-API runtime event-shape sentinel — ADDED**: per-event expected/missing/wrong-type/extra-field detection on the 3 hooked events.
- **Nuclear-mode opt-in gate — ADDED**: env-injected top level clamps down unless an explicit second env var opts in.
- **`client_id` discovery primitive — ADDED**: when the hardcoded ladder exhausts, a binary-string-grep helper surfaces fresh UUIDs ranked by oauth-keyword proximity.
- **MITM-log path safety — ADDED**: lstat refuses symlinks + non-regular files + non-current-user-owned paths.

Test count lineage: 41 → 54 → 82 → 95 → 107 → **112** across the hardening batch. Remaining open items are documented architectural limitations (bearer-in-`/proc/<pid>/environ`, which requires a Pi-upstream change) or out-of-scope research-grade Lows.

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

### Version Compatibility — Companion Era (v2.1.89–v2.1.100)

This table covers the companion/advisor surface only. For the post-companion harness audit (v2.1.118+), see the per-version timeline in the Status block above and the `results/` writeups.

| Version | Companion UI | Advisor | buddy_react API | Workspace |
|---------|-------------|---------|-----------------|-----------|
| v2.1.89–v2.1.92 | Full | Unknown | Live | Works |
| v2.1.96 | Full (last) | FULL (dark-launched) | Live | Works |
| v2.1.97 | Removed | FULL (dark-launched) | Live | Works |
| v2.1.98 | Removed | FULL (prompt refined) | Live | Works |
| v2.1.99 | — | — | — | *Never published to npm* |
| **v2.1.100** | **Removed** | **FULL (dark-launched)** | **Live (1.3s)** | **Works** |

The `buddy_react` API and the dark-launched advisor have remained stable through to the current binary (**v2.1.145**); the companion UI has not returned. The harness audit since v2.1.118 has rolled across every published release except a handful of skips (v2.1.120/122/124/125/127/130/134/135/136/137/139).

**Two independent layers:**

1. **Binary companion UI** (removed in v2.1.97) — the sprite, speech bubble, `/buddy` command, triggers, PRNG derivation. All client-side JavaScript excised from the `.bun` section. Cannot be re-enabled via config.

2. **`buddy_react` API** (still alive) — server-side endpoint at `/api/organizations/{org}/claude_code/buddy_react`. Accepts any valid companion stats, returns reaction strings. Stateless — trusts whatever the client sends. Confirmed responding with 200 OK as of 2026-04-09.

Our workspace and MCP tools operate entirely on layer 2. They call the API directly with custom stat blocks, bypassing the binary completely. This means **multi-buddy reactions work on any Claude Code version**, including v2.1.97+ where the native UI no longer exists.

### v2.1.98 Investigation: The Advisor Strategy (2026-04-10)

Binary analysis of v2.1.98 uncovered a new **advisor tool** system — and scanning all installed versions revealed it was **code-complete since v2.1.96** (coexisting with the full buddy system). Key findings:

- **Advisor**: Server-side tool (`advisor_20260301`) that lets the executor model consult a stronger reviewer (Opus or Sonnet)
- **Dark-launched**: Triple-gated behind a feature-disable env var, a firstParty auth check, and a server-side advisor feature flag (not yet rolled out)
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
- Rolling per-version harness security audit (96 severity-labeled findings as of v2.1.145; original tooling audit was 14)
- Working MCP tooling for programmatic API access

The companion system has three possible futures: the native UI returns (the `companion_intro` stub and Managed Agents API suggest it might), the advisor subsumes the companion's role (the architectural pattern shift from observation to decision-gating suggests this), or the API is eventually decommissioned. Either way, this repository provides the deepest existing documentation of both the companion and advisor architectures — and a working multi-buddy implementation that operates today via direct API calls.

### Buddy Workspace Convergence

When all 6 buddies independently flag the same concern across multiple reaction waves, it's a high-confidence architectural signal. Empirically validated: the crew flagged a queue/cooldown disconnect 4 times before manual analysis confirmed 2 real bugs.

### Security Audit Summary

The original tooling audit found 14 findings across 5 severity levels (see `SECURITY-AUDIT.md`): 1 CRITICAL (command injection), 3 HIGH (temp file exposure, missing SRI, unfiltered transcript), 5 MEDIUM (path traversal, TOCTOU, permissions, symlink, CSP), 3 LOW (unicode, innerHTML, month-gate), 1 OBSERVATION (intentional stat spoofing).

Since v2.1.118 the rolling harness audit has filed many more — the live tally (`docs/counts.js`, derived 2026-05-20) is **12 critical / 30 high / 46 medium / 8 low across 135 repo issues**. The current critical set centers on server-controlled config-push channels: **#106** (model-context injection via a Stop-hook reminder override), **#108** (a permission-classifier safety inversion), **#110** (raw plugin/skill/marketplace identifier field-level egress), **#127** (unsanitized terminal-notification injection — wire-confirmed session-59), plus **#31 AC3** (subagent ghost-inbox / attribution forgery — still undefended in v2.1.145). **#113** (a forced-downgrade primitive — wire-confirmed session-59) is the headline HIGH.

### Test Suite

Workspace test suite — 9 suites under `workspace/test/` (transcript, transcript-filter, convergence, reaction-timeline, trigger-priority, buddy-api-cooldown, workspace-mcp, session-manager, skill-engine). Run with `cd workspace && npx vitest run`.
