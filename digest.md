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
- Per-bootstrap volume scales linearly with installed-skill count: each globally-installed skill emits one telemetry event carrying its raw name, fingerprintable when combined with the durable per-account session identifiers transmitted at envelope level.
- v2.1.128 had 11 emitters using this pattern; v2.1.129 adds 2 (a plugin-folder-shadowed event and a plugin-name-collision event) for 13 active emitters total
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

Two of the three flag readers in v2.1.128 (`<bool-reader>` and `<string-reader>`) FULLY RETIRED in v2.1.129 — a single unified reader (`<unified-reader>`) handles both bool-default-with-second-arg and string-flag pattern across all 410 telemetry-name call sites. DEFAULT-TRUE bool count went from 18 (v128 stable) to 15 (v129 stable). Net flag delta +13/-3 (1109→1119 unique flags).

### v2.1.129 env-var-opt-in package-manager auto-updater (NOT disclosure-candidate)

A new env-var-opt-in (`CLAUDE_CODE_PACKAGE_MANAGER_AUTO_UPDATE`) auto-updater spawns hardcoded signed-PM commands (`brew upgrade --cask claude-code`, `winget upgrade --id Anthropic.ClaudeCode --exact --silent --disable-interactivity`) with a 5-minute subprocess timeout, surfacing success/failure to UI state. Telemetry-only events (start/success/fail variants) carry only platform booleans and exit codes. NOT disclosure-candidate — uses standard PM signature verification chain, opt-in, hardcoded package names.

### Positive deltas

- v2.1.128 retired the auto-memory feature entirely (5 flags removed; zero binary-string hits for the related identifiers). Privacy improvement, noted alongside the negative findings.
- v2.1.129's auto-updater is opt-in and uses signed PM commands (rather than self-modifying binary or bundled-installer paths), preserving signature-chain integrity.
- The hook system's documented JSON contract is one of the few harness mechanisms with a publicly-documented full schema, even where individual fields enable problematic behaviors.

### Disclosure approach

Per-thread HackerOne anthropic-vdp filing for each of the 22 findings. Standard 9-section H1 form structure. Capture sharing offered via Anthropic-controlled secure channel on follow-up (captures contain raw envelope identifiers, which are themselves the subject of the meta findings).

---

## Phase 8: v2.1.131 → v2.1.152 — Runtime Wire-Confirmation Era

**Scope**: rolling versions across the v2.1.131 → v2.1.152 release line (current binary v2.1.152, build 2026-05-26). From v2.1.118 onward the investigation shifted from *cataloguing new subsystems* to *runtime wire-confirmation of a stable set of findings*. All flag and reader-identifier names redacted; functional descriptions and finding numbers only.

### Methodology evolution: static decode → runtime MITM → PTY automation

Three distinct probing capabilities were built across this window:

1. **MITM firehose capture** — an intercepting proxy against the Bun-bundled binary, trusting the proxy CA via the standard Node/Bun CA-bundle environment variables. Captures the full `api.anthropic.com` traffic: the messages API, the event-logging batch endpoint, the server-controlled config-eval endpoint, and the third-party telemetry sink. This resolved the telemetry-transport black box and confirmed the server-to-client config-eval channel as the server→client control plane.

2. **Containerized probe-sandbox** — a two-service `docker compose` stack: a proxy service running per-probe Python addons, and a probe service running Claude Code on an isolated bridge network routed through the proxy. The addon **rewrites** the server config-eval responses in flight, force-injecting attacker-chosen feature values. Filesystem- and process-isolated from the host; account state (the OAuth bearer) is still shared. This unblocked the five `runtime-probe-needed` issues.

3. **PTY keystroke automation** — an `expect`-based script that spawns an *interactive* Claude Code TUI on a pseudo-terminal, walks the first-run onboarding, sends scripted user turns, optionally idles, and exits cleanly. This was the missing piece: `claude --print` and `claude doctor` short-circuit before the Ink React tree mounts, so any finding gated on the TUI render path cannot fire under `--print`. The driver mounts a real interactive TUI past the theme picker. A key root-cause gotcha: Claude Code reads its main state file from `$HOME/.claude.json` (home root), not from the `.claude/` subdirectory.

### The server-flippable control plane

The dominant architectural finding of this window: a large and growing fraction of Claude Code's runtime behavior is controlled by **feature flags evaluated server-side at Anthropic**. The client receives pre-evaluated values; the flag-resolution chain has 7 layers (caller-side env kill switches → session-override map → project-local overrides → server-controlled cache → Statsig supplemental → Grove policy → embedded default). The recurring code shape is a single-flag gate over an entire subsystem.

A flag is not only a boolean on/off — many carry **typed object or string payloads** that become part of model context, UI text, or update behavior. The flag readers rotate identifiers per binary release (cross-version analysis anchors on string-pool literals, never minified reader names). Per-version flag deltas net +8 v143→v145, then +44 v145→v152 (+49/-5 cumulative across v147/v148/v152). The DEFAULT-TRUE set grew 18 → 20 across v145→v152 (two new server-flippable boolean defaults: a workflows-master gate at v147, a daemon-binary-takeover gate at v152).

Subsystems dark-launched or controllable through this channel, catalogued across v118–v145 and referred to by finding number:

| Subsystem | Finding | Status |
|---|---|---|
| Background daemon | #100 / #101 | Live since v121; ~77 daemon telemetry events; a peer-UID check on the control socket was added at v121 |
| Harbor MCP channels | #102 (notifications), #104 (permission delegation) | Both runtime-confirmed at protocol layer; `--print`/SDK paths immune (the consumer is a TUI-only React hook) |
| Team-onboarding prompt | #103 | A server-supplied slash-command prompt body; byte-stable v128→v145 |
| Brief stop-hook text | #106 (Critical) | An empty-default server string overrides hardcoded UI text and reaches the messages API as `role:"user"` verbatim; no length cap (a 64 KB canary reached), no cert pinning |
| Content-sharing tool | #107 (High) | A built-in agentic tool uploads a working-directory file to an Anthropic endpoint |
| Permission-classifier safety inversion | #108 (Critical) | A DEFAULT-TRUE flag governs the sandbox network classifier; flipping it false produces fail-open behavior; wire-confirmed v129 via a synthetic-rewrite MITM |
| Field-level identifier egress | #110 (Critical) | Hundreds of raw plugin/skill/marketplace field values on the wire; wire-identical across v129/v131/v132 and byte-stable to v145 |
| Forced downgrade | #113 (High) | A typed-object flag drives the AutoUpdater — **wire-confirmed on an interactive TUI, Session 59** (see below) |
| Mid-conversation system predicate | #115 | **Relabelled informational, Session 59** (see below) |
| Startup-notice UI injection | #127 (High; was Critical) | An empty-default string flag reaches the TUI notification surface — **re-tested session-70 on the v191 image: demoted Critical→High** (the dangerous escapes are stripped by the render path; see below and Phase 9) |
| Third-party telemetry sink | #105 (High) | Server-flipped on for the test account; 50–60 events/session; v144 adds a new hook-metrics event class carrying plugin and hook-event identifiers |
| Plugin allowlist | catalogued, not filed | A v144 typed-object flag carries a server-pushed plugin-name allowlist; previously a byte-absent codename, now wired |

The nonessential-traffic kill-switch env var does **not** suppress the config-eval channel or the third-party telemetry sink.

### Finding status registry (current as of v2.1.152, Session 61)

Severities mirror `docs/counts.js`. "Wire-confirmed" = observed on captured network traffic, not inferred from static decode.

- **#31 AC3** — *Critical, UNDEFENDED on v152.* The subagent ghost-inbox / attribution-forgery class. v145 added a skill self-recursion guard — this is **orthogonal**: it blocks a forked skill from re-invoking *itself* in its own forked context, and does not touch the inbox-forge path. The relevant transcript-field and inbox-handler anchors are byte-stable v145→v147→v148→v152. AC3 remains an open undefended primitive.
- **#105** — *High, wire-confirmed.* Anthropic's own third-party telemetry sink; raw envelope identifiers plus a 47–60-field fingerprint. Extends an earlier envelope-leak finding. v144 expands the surface with a new hook-metrics event class.
- **#106** — *Critical, wire-confirmed.* The Stop-hook reminder override reaches model context verbatim; no cap, no cert pinning. The reader is byte-stable v126→v145.
- **#108** — *Critical, wire-confirmed (v129).* The permission-classifier fail-open inversion was empirically triggered; the binary log emits a literal `(fail open)` line.
- **#110** — *Critical, wire-confirmed (v129).* Field-level identifier egress; 356 raw `skill_name` + 9 `plugin_name` + 9 `marketplace_name`. Byte-stable to v145.
- **#111 (pi-passport)** — *Critical.* Third-party-app gate evasion + OAuth-bearer harness bypass; the promotion-gate was met via an empirically demonstrated env-var token-exfil class, closed the same day. Post-rebaseline: 35 of 44 findings closed, 112-test suite.
- **#113** — *High, WIRE-CONFIRMED on an interactive TUI (Session 59).* Injecting a forced-downgrade payload into the config-eval response made the AutoUpdater perform a downgrade to an attacker-chosen older version, with the interactive flag set and an `Auto-updating…` render — **no UI prompt, no confirmation**. Session 58 showed the inject lands; Session 59 (PTY-driven real TUI) showed the downstream AutoUpdater path executes. Reproduces identically on v145. The documented auto-updates opt-out does **not** cover this channel; a user who "disabled auto-updates" is still downgradable. User-side mitigation: a `settings.json` minimum-version floor.
- **#114** — *High.* The #31 AC3 partial-defense (detection wired at v138) plus a skip-persistence bypass. Severity round-tripped Med→High after a third-party SDK-wrapper survey: of 97 public repos using the no-session-persistence flag, 5 of 7 sampled invoke it unconditionally (a large default-vulnerable share of the ecosystem).
- **#115** — *Informational (relabelled Session 59).* A mid-conversation-system substring trigger. NEGATIVE on a full interactive TUI with both a synthetic canary and a valid model id as the injected value — the predicate did not fire despite all gates satisfied; beta headers were byte-identical baseline vs. canary turn. The substring-trigger primitive as hypothesised is not exercisable by config-value injection on v143/v145. Static decode stays catalogued.
- **#127** — *High (was Critical; DEMOTED session-70).* A server-controlled empty-default string flag reaches the trusted TUI notification banner. The earlier v140 promotion to Critical (claimed "unsanitized ANSI reached the terminal + bare-URL phishing surface") was **refuted by a byte-level re-test on the v191 image (session-70)**: the notification string renders through the Ink `<Text>` component, which **strips** the dangerous escape classes (cursor movement, clipboard write, device-status-report, OSC 8 hyperlink) — only color styling survives. The original Critical was a substring grep of one benign color class; the dangerous classes were never actually exercised and are in fact removed by the renderer. Residual risk = server-controlled **styled-text spoofing** in the trusted notification banner (no cloaked link, no clipboard write, no model-context reach, no credential reach). GitHub relabeled the issue critical→high-priority. Sibling of #155 (same render-path stripping). See Phase 9.

Older findings (the global-query off-switch, the server-disablable CLAUDE.md injection, the mithril-probe medium-class findings, and others) were re-checked across the v122→v145 chain — all byte-stable, **no patches**. Net direction across this window: attack surface only added, never removed.

### Persistence chain — no remediation v126 → v145

Each version since v126 has been round-1 flag-diffed and the priority findings cross-checked with bounded-literal grep (string-pool literals are version-stable; minified identifiers rotate and must not be used as cross-version anchors). The result is uniform: **20 testable priority-finding literals byte-stable v145→v147→v148→v152, zero remediations observed across the chain v126→v152**. Two genuine remediations were noted earlier — a config-auth-loss fix and an OAuth refresh-token state-machine improvement at v138 — neither touched a tracked finding. Apparent string-count drops were confirmed as Bun-bundler dedup / V8 C++ symbol stripping, not silent fixes.

**v145 → v152 additions** (no new disclosures filed): a **workflows family** at v147 — a user-invoked multi-phase autonomous task runner with phase tracking + budget/agent caps + journal-respawn (10 new flags including a DEFAULT-TRUE master gate, reuses subagent infra so #31 AC3 surface still applies); a **skills-sync family** at v152 — an org-scoped server-pushed skill content sync delivering per-skill zip archives that the client extracts into the local skills directory (4 new flags, multistore-class defense-in-depth: org auth + path validator + zip-slip-defended extraction + atomic rename; **surface registered with promotion-gate to disclosure-candidate**, requires a crafted-zip MITM probe to verify whether sync'd skills auto-register their own `hooks/hooks.json`); a **daemon binary takeover** at v152 — a DEFAULT-TRUE auto-update of the background daemon binary on host binary version mismatch.

### The documentation-gap pattern

A 2026-05-20 review of the official Claude Code docs against the finding inventory surfaces a uniform, one-directional gap that is itself a disclosure-grade observation:

- **User-triggered data flows are documented honestly** — `/feedback`, the session-quality survey, the transcript-share follow-up, and OpenTelemetry export each have a precise description of what is uploaded, retention, and a documented opt-out.
- **Every server-*controlled* path this investigation found is undocumented** — a doc search for "feature flags" returns nothing; the entire server→client config/control channel is absent. None of the primitives that ride it (#103/#106/#108/#113/#115/#127) are mentioned. The Anthropic-bound default-on metrics channel (#92/#110) is described only by exclusion and is silent on the identity metadata it carries. The forced-downgrade path (#113) is not covered by the documented auto-updates opt-out.

The strongest framing is the pattern, not the individual omissions: a reasonable user reading the official data-usage documentation cannot discover that the default-on metrics carry their identity, that a server-controlled channel can change their client's version / system prompt / terminal UI, or that a server flip can add a third-party telemetry destination.

---

## Phase 9: v2.1.153 → v2.1.206 — Continued Rolling Audit, Upstream Remediation, and a #127 Demotion

**Scope**: rolling per-version harness audit from v2.1.153 through v2.1.206 (current binary **v2.1.206**, npm `latest` and `next`; the marked-stable binary is **v2.1.197**; coverage extends through session 78). The investigation stayed in wire-confirmation mode: new subsystems are decoded, priority-finding literals are bounded-grep re-verified each release, and only genuinely new server-reachable primitives are filed. All flag and reader-identifier names redacted; functional descriptions and finding numbers only.

### v2.1.153 → v2.1.177 bridge (stable-runtime, genuine per-release builds)

This window added product capability but few new local-reach primitives. Highlights, by finding number (full detail in the per-version `results/` files and the project README):

- **The bundled runtime went stable** across the back half of the window — it bumped once near the start of the range and has held since. The per-release app build id, by contrast, **changes every release**: these are **genuine per-release builds**, not rebuilds of one frozen tag (an earlier "rebuild of one source tag" framing mistracked a runtime-embedded constant that only rotates on a runtime bump, not the app build id). Apparent size growth reconciles as new bundled code, not a runtime change.
- **#115 REMEDIATED + CLOSED (v156).** The mid-conversation-system substring-trigger mechanism (already relabelled informational in Session 59) was removed from the binary entirely.
- **#140 HIGH (v158).** A plugin-sync leg (an environment-variable opt-in, default off, plus org auth — *not* server-flippable) headlessly registers an org's synced plugins' MCP servers, including subprocess-spawning ones, with no consent prompt in the sync caller — asymmetric to the skills-sync sibling, which deliberately suppresses hook registration. Chains #136 + #110.
- **v160 was a major feature release** whose flag-name-only diff hid the real content (the lesson that made the *non-flag* diff mandatory per release). Two large subsystems decoded: a **Cowork remote-environment bridge** (a register/reconnect + work-lease/heartbeat protocol over the public `/v1/environments/...` and `/v1/sessions/...` endpoints, networked and credentialed but **runner-side only** — it activates as a cloud remote environment, not on the local CLI — so below the local-reach bar, logged as a runtime-probe watch item); and a **two-stage auto-mode safety classifier** that is **fail-CLOSED** (blocks on uncertainty/unavailability) — a net safety *strengthening*, the opposite of the #108 fail-open inversion.
- **Subsequent Session-61 docker probing promoted #113 and #136 to Critical** — the forced-downgrade primitive was shown to actually swap the on-disk binary via the auto-updater + package install, and the server was captured pushing a non-empty plugin-allowlist by default that propagates the OAuth bearer into on-list plugins' hook-subprocess environment.
- **v161 → v177 retro-audited in one pass (Session 67).** Two findings: **#151 HIGH** — a server-flippable flag re-enables the git credential helper during the **background plugin-marketplace auto-update fetch** (default-off suppresses it; locally reachable via a background timer, *not* gated to the cloud runner; the #136 / #140 / #151 plugin-credential family); **#152 LOW** — a server-flippable flag skips the Edit/Write read-before-write guard (data-integrity only, no permission reach). Two major hidden-code releases (a refusal-fallback state machine; an artifact/frame-deploy publish subsystem) both decoded benign / below-bar. The DEFAULT-TRUE boolean set grew across the range — all benign feature / perf / prompt-nudge gates, **none** a safety-gate inversion. New product capability in the window: **Opus 4.8** as the tier-eligible "opus" resolution and an "ultracode" max-effort mode (a client-side toggle, no server override).

### v2.1.178 → v2.1.191 (Session 69): two new injection findings + the first upstream remediation

- **#154 — CRITICAL, WIRE-CONFIRMED.** A **new** server-pushed string flag (empty default, **no length cap**) is wired verbatim into the system-prompt dynamic-section builder, reaching the `/v1/messages` **system** field as `role:"system"` content verbatim. Wire-confirmed on an interactive TUI: an injected marker reached the system field. This is the #106 class (server-string → model context, no cap, no certificate pinning) but a **distinct flag and a distinct sink** — #106 lands as `role:"user"`; #154 lands as `role:"system"`, the higher-trust half of the prompt.
- **#155 — HIGH.** A **new** server-pushed, schema-validated array of terminal strings rendered in the **startup banner** via Ink `<Text>`. A byte-level test showed the render path **strips** the dangerous escape classes (cursor movement, clipboard write, device-status-report, OSC 8 hyperlink) — only color styling survives. The Critical / phishing vector is therefore **refuted**; residual risk = server-controlled **styled-text spoofing** in the trusted startup banner. Sibling primitive to #127.
- **#108 — REMEDIATED UPSTREAM (v179).** The default-true sandbox-classifier fail-open inversion (the safety gate whose server-flip-to-false produced allow-on-classifier-unavailable) was **removed** from the binary at v179 (zero occurrences v179 onward). Retained in the finding census as a remediated Critical — the first genuine remediation of a tracked finding in the rolling audit.
- **DEFAULT-TRUE boolean defaults moved 25 → 27** (+2 at v191: a remote-control-notice display gate and a runner-side MCP startup-policy gate — both benign).

### Session 70: #127 demotion (see the corrected Phase 8 entry)

A byte-level re-test on the v191 image proved #127 is the sibling of #155: the server-controlled startup-notification string renders through Ink `<Text>`, which strips cursor / clipboard / device-status-report / OSC 8 escapes — only color survives. The Session-59 "Critical: unsanitized ANSI reached the terminal + bare-URL phishing" was a substring grep of one benign color class; the dangerous classes were never actually tested and are in fact stripped. **#127 demoted Critical → High**; residual = server-controlled styled-text spoofing in the trusted TUI notification banner (no cloaked link, no clipboard write, no model-context reach, no credential reach). GitHub relabeled the issue critical → high-priority. The Phase 8 registry entry above has been corrected in place.

### v2.1.193 → v2.1.196 (Sessions 71–72): zero new findings, one hardening flip

- **v193 / v195 (Session 71): ZERO new findings, ZERO remediations, ZERO regressions.** DEFAULT-TRUE flat. New flags decoded across these releases were all benign (telemetry events, UI-render, model-catalog, schema-normalization, scheduling); new endpoints were first-party billing / enterprise-SSO / observability surfaces, none reaching the local-reach bar.
- **v196 (Session 72, 2026-06-30): ZERO new findings; ONE hardening default-flip.** The DEFAULT-TRUE boolean set moved **27 → 28** (total 30 with the 2 typed): an **upload-MITM-guard flag flipped default OFF → ON** — an anti-MITM guard on artifact upload, now on by default, i.e. a **hardening**, the *inverse* of a fail-open inversion. Also added: a runner-side MCP-policy-exempt gate (gated behind the cloud-runner environment plus an already-permission-bypassed mode — inert on the local CLI); and a removed subagent-CLAUDE.md-omission gate (behavior baked to its prior default). The typed DEFAULT-TRUE set moved 3 → 2 across the v178 → v196 range (the #108 gate removed at v179).
- **New benign feature — plugin binary-asset provisioning.** v196's headline new capability fetches **sha256-pinned** binaries into a plugin's `bin/` directory from a **first-party content-addressed store**, gated to **official marketplaces only**, **default-off**, and the harness does **not** execute the placed files (execution is mediated by the plugin's own already-trusted hooks). It is the **best-hardened** member of the plugin-credential family (#136 / #140 / #151) — a **watch item, not a finding**. Two more benign decodes: a **read-only structured-output "report findings" tool** for the `/code-review` flow (renders locally, no egress) and a **single-bit A/B gate** over two hardcoded skill-tool description strings.
- **Structural.** v181 → v196 are **genuine per-release builds** — the per-release app build id changes every release (an earlier "unchanged since v181 / rebuild of one source tag" framing mistracked a runtime-embedded constant that only rotates on a runtime bump, not the app build id); the bundled runtime is stable; v196 adds ~1 MiB of pure bundled code (no new assets or native markers).

### v2.1.197 (Session 73): zero new findings, model-catalog prep

- **v197: ZERO new findings, ZERO remediations, ZERO regressions.** A genuine small feature build (~143 KiB of pure bundled code, **no embedded blob**; the bundled runtime is unchanged) whose dominant new content is model-catalog preparation for the next model generation. DEFAULT-TRUE flat at **30**.
- **Two new benign surfaces, both below the local-reach bar:**
  - A **new server-pushed config-cache key** carrying a promo-expiry **date**. It is **hard-sanitized** — the raw server string is re-parsed through a date formatter that **discards the original string** and emits only a short localized date — and it is spliced **only** into the model-picker UI description text. It **never** reaches model or system context and **never** gates a permission decision. Every reference to it resolves to the UI path.
  - A **new documentation-only API endpoint**: reference text inside a bundled skill's documentation, with **no in-harness caller** — not reachable from a running session.
- Standing findings #106 / #110 / #154 / #151 / #127 / #155 reproduce byte-identical; #108 stays removed (0).

### v2.1.198 → v2.1.200 (Session 74): a major feature release, zero new findings

**Scope**: v2.1.198 (a major feature release), v2.1.199 (fixes + hardening), and v2.1.200 (npm `next`). Current stable binary is **v2.1.199** (npm `latest`); coverage extends through **v2.1.200**. Across all three: **ZERO new findings, ZERO remediations, ZERO regressions.** The ~5.78 MiB of growth reconciles entirely as compiled-bundle code — no embedded blob — and the bundled runtime is unchanged. These are **genuine per-release builds**.

**What shipped (v198, the major release):** browser automation reached general availability; subagents now run in the background **by default** and, when launched from the background-agents view, auto-commit / push / open a **DRAFT** pull request on finishing code work; a new gateway upstream provider; a host-managed-credentials file path; a chart-design skill; and a design-consent API. **v199** added fixes plus request-body compression, stacked slash-commands, a new teleport repo-host verification guard, and a SendMessage misroute fix. **v200** added an "observer agents" capability plus background-agent auth-mismatch guards.

**Key surfaces decoded — all benign:**

- **Host-managed-credentials file reader — the best-hardened member of the credential family (#136).** It validates at the use-site (owner-only file permissions + schema + process-liveness + expiry checks), holds tokens in memory, and deliberately keeps them **out** of the inheritable subprocess environment. It is **double-gated behind two operator-set environment variables** with no server-push source, so it is **not reachable from a plain local session**.
- **Parked-permission resume for background / away-from-keyboard agents is FAIL-CLOSED.** A deferred permission only auto-resolves by **replaying the user's own persisted answer**; a timeout **cancels and re-asks** — there is no auto-approve.
- **Background auto-push / draft-PR is worktree-isolated and DRAFT-only.** The merge- / force-capable auto-approve allowlist is scoped to the **user-invoked** commit-push-PR command and is **absent** from the background path.
- **Away-from-keyboard AskUserQuestion auto-advance submits only answers the user already selected** — unanswered questions become "skipped", **never auto-picked** — and it is explicitly **barred from plan / permission approval**.
- **The new teleport repo-host telemetry sits inside a NEW repo-binding guard** that **refuses on a repo mismatch** — this is **added defense**, not a masked hole. The #99 teleport-chain layer is unchanged.
- **The design-consent endpoint sends only a boolean.** Artifact upload stays **user-invoked** and gated behind design-OAuth login + recorded consent + the default-on anti-MITM upload guard (the v196 hardening flip).
- **A new "observer agents" capability** (a background agent that watches another). Its default-true gate is **inert behind an operator experimental environment variable** — no server push can enable it alone — and an observer influences the observed agent only through a **harness-mediated report channel**; the inbox / SendMessage path is **blocked**.

**Two new WATCH items (functional, not findings):**

- **W-BGPUSH** — background auto-push / draft-PR is gated, but the *never-push-to-main / no-force / no-merge* boundary is **prompt-level, not code-enforced**.
- **W-OBSERVER** — the observer-agents default-true gate is inert behind the operator experimental env; **re-check if a future release drops that env gate**.

**DEFAULT-TRUE 30 → 32** (boolean 28 → 30; typed flat at 2): two new default-true gates, **both benign** — one toggles the explore / plan helper agents (turning it *off* reduces capability, not a safety inversion), the other is the observer-agents gate (inert behind the operator env). **Neither is a safety-gate inversion.**

**#31 AC3 re-checked — still UNDEFENDED (Critical).** The v199 SendMessage misroute fix is a **recipient-side** guard (it refuses a silent re-send to a reused member name after the resolved member has left) — **orthogonal** to the **sender-side** attribution forgery #31 AC3 exploits. #31 AC3 is neither mitigated nor regressed.

**Out of scope:** browser-automation GA is out of scope for the server-channel audit — the browser tooling **pre-dates** v198 (v198 only flipped it to GA) and the diff adds no server-controlled browser gate.

Standing findings #106 / #110 / #154 / #151 / #127 / #155 reproduce byte-identical v197 → v200; #108 stays removed (0). No status changes.

### v2.1.201 → v2.1.202 (Session 77): a refactor and the diagram-in-Artifacts feature (with an XSS sanitizer)

Both releases: **ZERO new findings, ZERO remediations, ZERO regressions.**

- **v201 is a near-pure refactor.** It is a genuine per-release build (the per-release app build id changes) with **net-zero size growth**. The apparent flag- and environment-variable deltas were artifacts of a greedy substring grep matching against byte-stable literals — once discounted, there is **no new server-reachable surface**.
- **v202 shipped a diagram-in-Artifacts feature** — roughly +10 MiB of pure bundled code comprising a diagram-rendering engine, a grammar parser, and an HTML sanitizer. Notably, it **ships an XSS sanitizer** over the rendered diagram SVG/HTML: a **security-positive**, not a new exposure. Two more benign surfaces:
  - **A cloud-runner agent-proxy that MEDIATES provider credentials.** It injects a **sentinel placeholder token** into the tool subprocess environment and keeps the **real** credential **out** of that environment — the *inverse* of a credential leak. A bespoke runner secret is additionally scrubbed from a locked-down git subprocess environment (protocol restricted). This is a hardening pattern, not a #136-class egress.
  - **A refusal-fallback auto-retry** driven by a **server-pushed boolean config-cache key**: on an availability refusal it swaps to a fallback model. This is an **availability swap, not a text-into-model-context primitive** — distinct from the #106 / #154 server-string-to-model-context class.
- **DEFAULT-TRUE moved 32 → 33** (a diagram-render capability toggle). Non-#108; a capability gate, not a safety inversion. The 2 typed defaults stayed flat.

### v2.1.203 → v2.1.204 (Session 78): a code shrink and a mechanical rebuild

Both releases: **ZERO new findings, ZERO remediations, ZERO regressions.**

- **v203 carried the real delta of the span — and it is a ~5 MiB code SHRINK.** A preview/render engine was **retired** once the v202 diagram path superseded it (pure code removal, **no embedded blob**). A shrink can neither add nor mask a finding, and all standing-finding anchors are byte-stable. Four safety-relevant candidates all decoded benign:
  - **An auto-mode edit-classification capability, DEFAULT-OFF.** When enabled it routes edits to **more** scrutiny — the *inverse* of the removed #108 fail-open inversion, not a safety inversion.
  - **A new default-true daemon-side downgrade-refusal guard** (security-positive): the background daemon **refuses to self-restart into an older on-disk build**. It is server-disableable, but disabling only reverts to prior behavior — **#113-adjacent, no new reach** (a functional WATCH, not a finding).
  - **A new provider-auth environment variable** for an already-scaffolded upstream provider backend — operator-set, held in the credential-redaction lists.
  - **A resume-integrity filter that DROPS unlinked transcript records on resume** — the *opposite* of an attribution-injection.
- **DEFAULT-TRUE moved 33 → 34** (the daemon downgrade-refusal guard).
- **v204 is a mechanical rebuild** — a tiny bundle re-chunk with **zero flag / environment / gate changes**.

### v2.1.205 (Session 78): a security-positive auto-mode exfil-command enrichment

**ZERO new findings, ZERO remediations, ZERO regressions.** The headline is a **net-defensive enrichment of the auto-mode safety classifier**: exfil-command awareness.

- The classifier now **flags exfil-capable git / gh commands** (push, remote set-url / add, pr / issue create, release upload, fork) and enriches its permission decision with two optional, **DEFAULT-OFF** signals: the repository's **public/private visibility** (client-computed and sanitized) and **git-status paths** (paths and status **only** — never file content, length-capped).
- Both signals are sent **only to the first-party classifier** — **no third-party sink**.
- Crucially it is a **risk HINT, not a decision**: no visibility branch flips a permission on its own.
- Net-defensive, analogous to the v160 two-stage classifier strengthening — the **opposite** of the #108 inversion (a functional WATCH, not a finding).

### v2.1.206 (Session 78): a feature build, two anchor drifts (both benign), and an enable-gate graduation

**ZERO new findings, ZERO remediations, ZERO regressions.** A feature build (+1.49 MiB of compiled code) with four surfaces, all benign:

- **Staged-tool-call gating — a server-controlled KILL-SWITCH.** Turning it **off REFUSES** the staged call: a capability **reduction**, not a fail-open.
- **A new end-of-conversation agent-lifecycle tool**, guarded so that a subagent **cannot** end the parent conversation; it is **local-only, no egress**.
- **A plan-review UI surface.**
- **A telemetry cluster.**

**DEFAULT-TRUE moved 34 → 35** (the staged-call kill-switch; a capability gate, not a safety inversion).

**Two standing-finding anchors drifted by ±1 at v205, and BOTH decode benign:**

- **The #110 field-egress anchor FELL by one occurrence** — a semantics-preserving hoist of a telemetry emit above a branch. The egress is **unchanged, NOT remediated**.
- **The #31 AC3 attribution anchor ROSE by one** — a new **legitimate** producer (an end-of-conversation abort branch stamping the attribution field from a **real** source id). The consumer that #31 AC3 exploits is **byte-identical**, so the gap is **neither worsened nor fixed**.

An **enable-gate GRADUATION** was also noted: a design-integration enable environment variable was **removed** while the consent + guard boundary on its egress stayed **byte-stable** — a feature going GA, **not a masked hole**.

Standing findings #106 / #110 / #154 / #151 / #127 / #155 reproduce byte-identical v200 → v206; #108 stays removed (0). No status changes across the v201 → v206 window.

### Tally (current as of v2.1.206, Session 78)

Severities mirror `docs/counts.js` (authoritative), **unchanged across this window**. The live GitHub-label re-derivation across the repo issue set: **14 critical / 37 high / 53 medium / 11 low** (115 severity-labeled issues across 155 total repo issues). The original tooling-audit baseline census stands at **30 items** (7 critical / 9 high / 10 medium / 3 low / 1 observation). The server-flippable DEFAULT-TRUE set is now **35** (33 boolean + 2 typed). Current binary **v2.1.206** (npm `latest` and `next`); the marked-stable binary is **v2.1.197**. Net direction across the v153 → v206 window: two genuine remediations of tracked findings (#115 closed at v156, #108 removed at v179), one hardening default-flip (v196), and — across v197 → v206 — **zero new findings, zero remediations, zero regressions**: a major feature release (v198) plus the v202 diagram-in-Artifacts feature (which itself **ships an XSS sanitizer**), whose new capabilities (background auto-push / draft-PR, host-managed credentials, observer agents, design-consent upload, credential-mediating cloud-runner proxy) all landed with use-site hardening, fail-closed defaults, and operator-gated toggles below the local-reach bar. The DEFAULT-TRUE set moved 32 (v200) → 33 (v202) → 34 (v203) → 35 (v206); every addition is benign and **none is a safety-gate inversion**. Two new functional WATCH items joined the ledger: the v203 daemon downgrade-refusal guard (server-disableable but net-positive, #113-adjacent) and the v205 auto-mode exfil-awareness enrichment (net-defensive). Standing against all of this: the two v178→v191 injection primitives (#154 Critical, #155 High) and the #127 demotion (Critical → High).

---

## Methodology Notes

The mithril probe (Phase 6) used a completeness-tracking approach:

1. **Python binary scan**: read binary as latin-1 text, extract 250–500 character context windows around each flag-prefix string.
2. **Gate call signature recognition**: identify reader variant; extract default value literal.
3. **Completeness tracking**: cross-reference extracted gate calls against documented set after each wave; continue until zero remain undocumented.
4. **DEFAULT-TRUE detection**: regex scan for the call pattern used when the default is `true`.
5. **Telemetry discrimination**: strings appearing only in emit/log call sites are telemetry events, not gates; excluded from the 148 gate-read count.

Full methodology (product-agnostic): see `guides/reverse-engineering-a-cli-harness.md` in [agent-almanac](https://github.com/pjt222/agent-almanac).
