# Investigation Digest

> Compiled findings from the Claude Code companion system, advisor strategy, Kairos loop, and v2.1.114 complete feature-flag surface audit. All flag names and minified identifiers redacted per Tier 1 classification; functional descriptions only.

---

## Phase 1: Companion System (v2.1.89–v2.1.96)

The companion system ("Shingle") ships as a first-party feature on Pro/Max plans starting v2.1.89. A companion owl appears in the Claude Code terminal UI, reacts to session events, and persists across sessions via a small on-disk config.

**Key findings:**

- **Identity derivation is deterministic**: companion name, personality, and traits are fully derived from the user's account ID using a hash + PRNG chain — the same account always produces the same companion. Only three fields (name, personality, hatch timestamp) are persisted on disk.
- **Reaction API**: `POST /buddy_react` endpoint accepts stat blocks and returns typed reactions. The endpoint remains live server-side even after the UI was removed from the binary in v2.1.97.
- **Six confirmed reaction triggers**: turn, hatch, pet, test-fail, error, large-diff. Several suspected triggers (completion, idle, silence) were empirically debunked.
- **Date gate bug**: the gate predicate `getMonth() >= 3` (0-indexed) prevents companion from hatching January–March of any year; this appears to be an off-by-one error rather than intentional seasonal behavior.
- **Unidirectional architecture**: the companion subsystem observes the main agent's session state but has no write path back into it. The trust boundary is properly enforced.
- **18 species** possible; 34.4 trillion unique companion configurations across species × personality × stats.

**Security notes:**

- The `buddy_react` endpoint accepts a `stats` block from the caller without server-side validation of the values. Callers can submit arbitrary stat blocks (including values outside the documented range). This is documented behavior per the "Two Owls" spec; the server trusts caller-supplied parameters intentionally.
- Capture logs produced by the hook-based capture system may contain session tokens in the raw hook payload. Log handling should strip auth headers before any storage.
- Full security findings: see `SECURITY-AUDIT.md`.

---

## Phase 2: UI Removal and API Continuity (v2.1.97)

The companion UI (sprite, speech bubble, `/buddy` command) was removed from the binary in v2.1.97 (built 2026-04-08). The `buddy_react` API endpoint remained live server-side and continued responding with 200 OK through at least v2.1.114.

This creates a **workspace architecture** pattern: a separate process (not the main CLI binary) can call the API directly, bypassing the binary version constraint. The workspace in this repository uses this pattern to run a full multi-buddy session against any binary version.

---

## Phase 3: Advisor Strategy System (v2.1.96–v2.1.98)

A second system was found code-complete in v2.1.96 — the same binary that shipped with the full companion UI:

**Key findings:**

- **Architecture**: the advisor is a server-side Messages API tool, not a separate API endpoint like the companion. It operates inside a normal conversation turn as a tool call.
- **Model selection**: two models are supported (the stronger "Opus" and the standard "Sonnet"). Model choice is configurable at invocation time.
- **System prompt structure**: a recovered 7-paragraph system prompt instructs the advisor on when to intervene, what categories of issues to flag, and how to frame feedback to the main executor without being disruptive to the user's session.
- **Feature gate**: the advisor is dark-launched behind a server-side flag. It requires first-party authentication (not available to third-party API callers) and a valid Pro/Max entitlement.
- **Cost tracking**: four dedicated tracking fields record advisor call costs separately from main-session costs.
- **Five telemetry events**: command invocation, dialog shown, tool call, tool interruption, and per-call token usage.
- **CLI surface**: `--advisor <model>` flag and `/advisor [model|off]` slash command exist in the binary but are hidden from help output until the server-side flag rolls out.
- **Coexistence**: the advisor was architecturally independent of the companion system. It was not built as a replacement; both systems were present in v2.1.96 simultaneously.

---

## Phase 4: Kairos Loop System (v2.1.101–v2.1.104)

A self-continuation scheduling system was identified across v2.1.101–v2.1.104:

**Key findings:**

- **`ScheduleWakeup` tool**: takes `delaySeconds`, `prompt`, and `reason` arguments. The runtime clamps delay to `[60, 3600]` seconds. Available inside loop sessions.
- **Four sentinel prompts**: four special prompt strings are resolved at fire time to standard loop behaviors (autonomous loop, dynamic loop, file-based loop variants).
- **Feature gates**: three separate gates control the tool availability, the `/loop` slash command, and sentinel resolution independently.
- **Loop aging**: loops age out after 7 days by default, configurable up to 30 days.
- **Two telemetry events**: loop wakeup scheduled and loop aged-out.
- **Dynamic loops**: when no delay is specified, the agent self-paces using `ScheduleWakeup` to set its own wakeup time. This is the expected pattern for autonomous work loops.

---

## Phase 5: v2.1.111/v2.1.112 Architecture Probe

A wave-based probe of v2.1.111 and v2.1.112 binaries identified new subsystems and architectural changes:

**New subsystems confirmed:**

- **MCP client subsystem**: 8 transport types (stdio, SSE, WebSocket, HTTP, IDE variants, claude.ai proxy, SDK); OAuth flow with 6 dedicated event types; 42 total telemetry events.
- **Plugin subsystem**: 6 extension types (skills, agents, hooks, MCP servers, LSP servers, monitors); 9 CLI subcommands; official marketplace with Git-based install fallback; 22 telemetry events.
- **Auto-Dream memory scheduler**: background memory consolidation forked as a separate agent with `skipTranscript=true`; minimum 5 sessions / 24 hours between runs; 5 telemetry events.
- **Provider registry**: 6 provider types detected — main API, Bedrock, Vertex, Foundry (scaffolded, no telemetry), AWS (shares main API infrastructure), and an additional provider type sharing main API routing.
- **Team telemetry**: first observed in v2.1.112; 16 team-related events (was 0 in prior versions).
- **Remote-control bridge**: ~30 bridge telemetry events; tool permission requests can optionally include raw command strings for display in bridge UI.
- **RemoteTrigger tool**: 5 actions (list, get, create, update, run); gated behind a server-side flag; requires Remote Control bridge.
- **CCR (Cloud-Code Runner)**: 54 total telemetry events across teleport (17), bridge (30), and umbrella (7); plus 5 ultrareview events and 2 autofix events; 12 environment variables; 11 sessions API path templates and 8 environments API path templates.

**Hook subsystem**: 27 hook event types identified in v2.1.112 (previously 9 documented); includes lifecycle events for tool calls, model turns, bash commands, file operations, and session management.

**TUI renderer**: three-tier architecture confirmed — full Ink Flexbox layout for fullscreen, scroll-region DECSTBM mode for standard terminals, minimal fragment mode as fallback. The tier selection is gate-controlled.

---

## Phase 6: v2.1.114 Mithril Probe — Complete Feature-Flag Surface Audit

**Scope**: v2.1.114 binary (build 2026-04-17T22:37:24Z). Exhaustive sweep of all feature-flag gate reads across 16 documentation waves.

**Statistics**:

- 148 unique gate reads documented
- 15 DEFAULT-TRUE flags (active for all users without server override)
- ~830 strings match the flag prefix — distinguishing gate calls from telemetry events reduces this to 148 actual gates (6× noise ratio; completeness tracking is essential)
- 7-layer flag resolution: env kill-switches → session overrides → project overrides → GrowthBook cache → Statsig gates → Grove policy → embedded default

**Gate reader variants identified** (6 types):

| Variant | Semantics |
|---------|-----------|
| Sync boolean | Simple on/off with binary default |
| Sync config-object | Returns a JSON config schema, not a boolean |
| Bootstrap-aware TTL | Cached with a time-to-live; used during startup before remote config arrives |
| Truthy-only | No default; truthy check only |
| Async bootstrap | Promise-based; resolved after bootstrap completes |
| Async bridge | Evaluated via the Remote Control bridge channel |

**Notable behavioral flags** (functional descriptions — no flag identifiers):

- **Remote-tunable safety classifier** (highest frequency gate, 16 reads): background classifier that evaluates conversation messages; model selection and configuration are remotely tunable via the flag's config schema.
- **Session-scoped scratchpad directory**: when enabled, creates `~/.claude/sessions/{sessionId}/scratchpad/` as a persistent working directory for the session.
- **Eager input streaming** (undocumented API parameter): adds `eager_input_streaming: true` to tool definitions; not documented in the public API.
- **Ultraplan dependency gate**: the Ultraplan feature requires an active Remote Control bridge connection — it cannot run in standalone sessions.
- **Accuracy qualification instruction**: injects a multi-sentence accuracy caveat into the system prompt instructing the model to distinguish verified facts from assumptions.
- **Voice mode kill switch**: inverted flag — when set to `true`, disables voice mode.
- **Background semantic memory lookup**: semantic memory lookup fires on every conversation turn when enabled.
- **Silent async memory extraction**: asynchronously extracts and stores memory from completed turns without surfacing this activity to the user.
- **Multi-session coordinate mode**: enables coordination where one session can grant shell, filesystem, and system-settings permissions to coordinated peer sessions.
- **Stream-to-non-stream fallback**: when disabled, streaming timeouts throw rather than falling back to non-streaming mode.

**Security and Privacy Findings** (flagged for responsible disclosure — details in issue tracker):

| Severity | Count | Category |
|----------|-------|----------|
| HIGH | 2 | Undocumented remote-control capabilities (one silences project-level config; one is a global query kill switch) |
| MEDIUM | 4 | Telemetry transmission to third-party; passive background memory reads; silent async memory extraction; multi-session coordination with elevated permissions |

**DEFAULT-TRUE flag categories** (15 flags active by default for all users):

Categories observed: stream watchdog, bridge compatibility shim, cache optimization, keyboard customization, MCP retry behavior, plugin marketplace fallback, session recap, UI state features, compact system prompt for subagents, session memory features.

---

## Phase 7: Hook Subsystem + Daemon + Disclosure-Candidate Findings (v2.1.118 → v2.1.128)

**Scope**: rolling versions across the v2.1.118 → v2.1.128 release line. This phase tracks ongoing harness behavior changes alongside finding accumulation. All flag and reader-identifier names redacted; functional descriptions only.

**Cumulative metric (as of v2.1.129)**: 22 disclosure-candidate findings filed against the private investigation repo. Severity tally per `docs/counts.js`:

- **5 confirmed Critical** (empirically reproduced via local sandboxed probes — includes both 2026-05-06 promotions: `_PROTO_` field-level leak via probe-r MITM and sandbox classifier fail-open inversion via probe-v2 MITM)
- **7 High** (1 with promotion-gate pending re-verify)
- **11 Medium-class** (Medium / Medium-info)
- **3 Low**
- **1 Observation**

### Hook subsystem hardening (v2.1.118)

A unified hook subsystem covers five hook types (command, prompt, http, mcp_tool, agent) across 29 harness events. Two confirmed-Critical findings filed:

1. **PreToolUse JSON-rewrite path**: a hook returning JSON parsed by the harness's hook-output reader can rewrite tool arguments before execution and override the permission decision via documented JSON contract fields. Full rewrite chain confirmed via local probe.
2. **Workspace-trust gate skipped in non-interactive mode**: the trust gate that protects against malicious cloned-repo settings.json files does not fire in `--print` / SDK / non-interactive mode, and the in-process trust cache lasts for the full process lifetime.

A third High finding composes the two via the `--print --teleport` flag chain — the chain git-checks-out an attacker-controlled branch into the victim's working directory and chains into the trust-bypass for one-command remote-code-execution.

### Background daemon goes live (v2.1.121 → v2.1.128)

The background daemon subsystem (statically present since v2.1.119, dormant) became active in v2.1.121 with +47 telemetry events. v2.1.128 added another +17 events covering daemon-state-machine edge cases (adopt, attach-stall, dispatch reject/rescue/drop, sendclaim, settle, worker-stalled/vanished, ptyhost-crash, phase-illegal, daemon-service-stale-exec, zombie-FP, roster-orphan-adopted). Harbor permissions sub-protocol was runtime-confirmed in TUI mode (1 confirmed Critical, MCP servers can decide tool-use authorization within the harbor channel).

### Subagent attribution detection (v2.1.123)

A telemetry layer for detecting forged subagent-attribution chains was shipped. Static analysis showed 3 of 4 reachable attack-class variants remain undefended at parse/load time: transcript-replay forge, sidechain-insertion forge, SendMessage inbox forge. SDK-stdin variant IS defended. One additional structural defense was confirmed bypassable via matched-pair forge.

### v2.1.126 brief-mode stop-hook GrowthBook injection (1 Critical)

A new GrowthBook string-flag (empty-default) was added that overrides the hardcoded brief-mode Stop-hook reminder text. mitm-injection canary empirically reaches the model's `/v1/messages` request body as a `role:"user"` `type:"text"` synthetic message verbatim. 64KB canary upper-bound test confirmed no client-side length cap. No certificate pinning at the eval channel — network-MITM threat is realistic. Cross-model alignment retest: the v126 `--print` default model COMPLIED with a stripped bare-workdir canary; smaller models REFUSED. The default-model surface is wide open.

### v2.1.126 third-party processor extension (1 High)

A second-channel telemetry processor (Datadog ingest) receives the same envelope identifiers (session_id, subscription_type, last_session_id, plus a 47-field system fingerprint) when a server-flippable gate flag is enabled for an account. Extends the earlier "raw envelope identifiers across telemetry events" meta finding with a new processor surface.

### v2.1.128 ShareOnboardingGuide content-sharing tool (1 High → Critical pending re-verify)

A new built-in agentic tool reads a conventionally-named file from the user's working directory and POSTs the content to an Anthropic-hosted org-scoped endpoint, returning a share URL. Tool availability is gated by a server-flippable string-flag, server-flipped ON for the reporter's account at the time of probe. The tool is model-invocable (no `disableModelInvocation`); the `mode:"check"` argument variant is NOT idempotent-read (it POSTs the upload silently if no existing share is found). The tool result text injects a model-directing instruction (a `Close with: "..."` directive) into the model context — same channel class as the v126 brief-stop-hook injection but via the tool-output channel. The binary exposes no `delete` mode for the share endpoint. **Auth-model status**: round-3 informal incognito browser test reported the URL as anyone-with-link unauth-public, but round-4 scrapling re-test (3 runs, no cookies, no auth state) all returned server-side redirects to the login page. Severity reverted to HIGH pending USER fresh-profile incognito re-verification with explicit address-bar and canary-marker checks.

### v2.1.128 sandbox classifier safety inversion (1 Med-High)

A new default-TRUE boolean flag controls the fail-closed-vs-fail-open behavior of the sandbox network classifier when the classifier service is unavailable. Default-TRUE means deny-on-classifier-unavailable (safe, fail-closed). A server flip to false inverts to allow-on-classifier-unavailable (unsafe, fail-open). Server-flippable safety-default inversion.

### v2.1.128 path-switcher (1 Medium info)

A new string-flag switches the PR-status decision lookup between local `gh pr view` (default, ground truth) and a binary-direct GitHub API/GraphQL fetch path (uses gh-CLI auth, NOT an Anthropic-intermediary as initially framed). Per-account decision-routing flag. Original report corrected in round-6 closure: divergence is subprocess footprint, gh-CLI extension applicability, network-egress proxy bypass, and ETag/30-min review-cache vs fresh-per-call timing — not auth-identity divergence.

### v2.1.128 round-6 closure (informational)

Tail-item dispositions completed before v129 pivot:
- A second call site for the sandbox-classifier flag was identified at the auto-mode permission classifier (same flag, manual-prompt fallback rather than fail-open). Critical impact still driven by the sandbox-network call site.
- The path-switcher's ON-path was confirmed to make direct GitHub API calls from the binary, not via Anthropic-intermediary. Auth-identity divergence threat removed; subprocess/proxy/cache divergence threats stand.
- Two additional flags decoded as feature-rollout / DEFAULT-TRUE killswitch class (no new findings).

### v2.1.129 _PROTO_ destructure-rename egresses raw identifiers as top-level event fields (1 Critical, promoted from High via runtime MITM 2026-05-06)

A destructure-rename pattern in the 1P telemetry pipeline extracts `_PROTO_*`-prefixed payload values into local variables and then re-attaches them to the egressed event as typed top-level fields (`plugin_name`, `skill_name`, `marketplace_name`). The `_PROTO_` prefix is **not** a redaction marker — the sibling field-residual redactor only operates on the leftover destructure rest, not on the destructured locals which are explicitly egressed. Raw third-party / private plugin and marketplace names reach the 1P telemetry endpoint as top-level event fields rather than opaque metadata.

- **Empirical wire confirmation (2026-05-06)**: a single non-interactive bootstrap invocation captured under MITM produced 2 telemetry batches to the 1P endpoint with **356 raw skill_name occurrences (355 unique values)**, **9 plugin_name (2 unique)**, and **9 marketplace_name (2 unique)**. All values raw, unhashed, top-level on `event_data`. Third-party plugin and marketplace identities (one private plugin and its source marketplace) leaked verbatim alongside the official catalogue entries.
- Per-bootstrap volume scales linearly with installed-skill count: each globally-installed skill emits one `tengu_skill_loaded` event with its raw name, fingerprintable when combined with the durable per-account session identifiers transmitted at envelope level.
- v2.1.128 had 11 emitters using this pattern; v2.1.129 adds 2 (`tengu_plugin_folder_shadowed`, `tengu_plugin_name_collision`) for 13 active emitters total
- A `_PROTO_code → repl_code` slot exists at the egress destructure across v123/v126/v128/v129 but is currently unwired (0 emitter hits empirically). Forward-compat slot — escalate watch if a future binary wires a `_PROTO_code:` setter, since raw REPL inputs would be considerably more sensitive than identifier strings.
- Extends the prior envelope-level leak class (raw session_id / device_id / email transmitted on every batch) from envelope to field level

### v2.1.129 GrowthBook eval-SDK reachability baseline (informational, supports prior v128 findings)

The same MITM run captured the GrowthBook SDK feature-flag evaluation response: a 46 KB body containing 224 resolved features. Distribution by source: 162 `defaultValue`, 48 `force` (admin-pushed override), 14 `experiment` (active A/B assignment).

This is the substrate behind the two adjacent v128 findings (sandbox classifier fail-open inversion via DEFAULT-TRUE flag; PR-status path-switcher activation via boolean flag). Neither flag was server-resolved for this user during the capture (one absent → local default applied, one present with `defaultValue: false`). However, the same response shows that the experiment-source and force-source override paths are demonstrably active for ~30 other flags right now — the inversions documented in those v128 findings are reachable via a single config push using mechanisms already in production use, not theoretical mechanisms requiring new infrastructure.

### v2.1.129 sandbox classifier fail-open inversion empirically confirmed (1 Critical, promoted from Med-High via runtime MITM 2026-05-06)

The DEFAULT-TRUE classifier-killswitch flag's fail-open inversion (originally filed against v2.1.128 as a Med-High static-decode finding) was empirically confirmed via runtime MITM on 2026-05-06 using a synthetic-rewrite addon built earlier the same day.

The probe runs a 2-step rewrite chain in front of `api.anthropic.com`:

1. The eval-SDK response is rewritten to inject the killswitch flag with `value: false, source: "experiment"` — simulating the documented "server flips the DEFAULT-TRUE flag to false on a targeted cohort" condition.
2. Any `/v1/messages` POST whose body matches the auto-mode classifier system-prompt fingerprint (a stable string in the binary's classifier system prompt) is force-503ed — simulating classifier endpoint outage.

A simple `claude --print --permission-mode auto` invocation with a non-allowlisted Bash command then triggers the auto-mode permission classifier path. The binary's debug log emits the literal string **`Auto mode classifier unavailable, falling back to normal permission handling (fail open)`** under both attack inputs — exactly matching the binary string-pool entry decoded statically.

Control run (same prompt, no rewrites): classifier returns OK, permission decision `allow`, tool dispatched, command executes normally.

Full-attack run: classifier 3× retries all 503, classifier-error log emitted, then the `(fail open)` log line, then the upstream layer auto-denies because there is no human to ask in `--print` mode. **In an interactive TUI session — the actual target environment — the upstream layer would re-prompt the user, replacing the LLM-evaluated safety review with a manual permission prompt.** Users habituated to clicking through prompts have no signal that the deeper safety check has been disabled; in `acceptEdits`/permission-bypassed contexts, the fall-through is direct allow.

Site coverage: this run confirms the auto-mode permission classifier path. The sandbox-network classifier (separate function in the binary) uses the same flag with the same fail-open inversion semantics but fires only when network sandboxing is active (Linux unshare / macOS sandbox-exec) — empirical confirmation deferred to a sandbox-active TUI session. Static-decode evidence already filed for that site.

Adversary capability required: server-flip access to GrowthBook (Anthropic operations) plus classifier endpoint disruption (could be partial outage, network event, or coordinated). Both are realistic operational conditions. The binary's own `(fail open)` log line is direct acknowledgement of the inversion.

### v2.1.129 reader unification (informational)

Two of the three flag readers in v2.1.128 (`<bool-reader>` and `<string-reader>`) FULLY RETIRED in v2.1.129 — a single unified reader (`<unified-reader>`) handles both bool-default-with-second-arg and string-flag pattern across all 410 `tengu_*` call sites. DEFAULT-TRUE bool count went from 18 (v128 stable) to 15 (v129 stable). Net flag delta +13/-3 (1109→1119 unique flags).

### v2.1.129 env-var-opt-in package-manager auto-updater (NOT disclosure-candidate)

A new env-var-opt-in (`CLAUDE_CODE_PACKAGE_MANAGER_AUTO_UPDATE`) auto-updater spawns hardcoded signed-PM commands (`brew upgrade --cask claude-code`, `winget upgrade --id Anthropic.ClaudeCode --exact --silent --disable-interactivity`) with a 5-minute subprocess timeout, surfacing success/failure to UI state. Telemetry-only flags (`tengu_pkg_manager_auto_updater_{start,success,fail}`) carry only platform booleans and exit codes. NOT disclosure-candidate — uses standard PM signature verification chain, opt-in, hardcoded package names.

### Positive deltas

- v2.1.128 retired the auto-memory feature entirely (5 flags removed; zero binary-string hits for the related identifiers). Privacy improvement, noted alongside the negative findings.
- v2.1.129's auto-updater is opt-in and uses signed PM commands (rather than self-modifying binary or bundled-installer paths), preserving signature-chain integrity.
- The hook system's documented JSON contract is one of the few harness mechanisms with a publicly-documented full schema, even where individual fields enable problematic behaviors.

### Disclosure approach

Per-thread HackerOne anthropic-vdp filing for each of the 22 findings. Standard 9-section H1 form structure. Capture sharing offered via Anthropic-controlled secure channel on follow-up (captures contain raw envelope identifiers, which are themselves the subject of the meta findings).

---

## Methodology Notes

The mithril probe (Phase 6) used a completeness-tracking approach:

1. **Python binary scan**: read binary as latin-1 text, extract 250–500 character context windows around each flag-prefix string.
2. **Gate call signature recognition**: identify reader variant; extract default value literal.
3. **Completeness tracking**: cross-reference extracted gate calls against documented set after each wave; continue until zero remain undocumented.
4. **DEFAULT-TRUE detection**: regex scan for the call pattern used when the default is `true`.
5. **Telemetry discrimination**: strings appearing only in emit/log call sites are telemetry events, not gates; excluded from the 148 gate-read count.

Full methodology (product-agnostic): see `guides/reverse-engineering-a-cli-harness.md` in [agent-almanac](https://github.com/pjt222/agent-almanac).
