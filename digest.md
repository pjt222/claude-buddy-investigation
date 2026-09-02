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
- **Auto-Dream memory scheduler**: background memory consolidation forked as a separate agent with `transcript-skip-flag=true`; minimum 5 sessions / 24 hours between runs; 5 telemetry events.
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
- 7-layer flag resolution: env kill-switches → session overrides → project overrides → server-controlled config cache → supplemental gates → policy layer → embedded default

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

- **5 confirmed Critical** (empirically reproduced via local sandboxed probes — includes both 2026-05-06 promotions: the field-level identifier leak via probe-r MITM and sandbox classifier fail-open inversion via probe-v2 MITM)
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

### v2.1.126 brief-mode stop-hook server-channel injection (1 Critical)

A new server-controlled string-flag (empty-default) was added that overrides the hardcoded brief-mode Stop-hook reminder text. mitm-injection canary empirically reaches the model's `/v1/messages` request body as a `role:"user"` `type:"text"` synthetic message verbatim. 64KB canary upper-bound test confirmed no client-side length cap. No certificate pinning at the eval channel — network-MITM threat is realistic. Cross-model alignment retest: the v126 `--print` default model COMPLIED with a stripped bare-workdir canary; smaller models REFUSED. The default-model surface is wide open.

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

### v2.1.129 destructure-rename egresses raw identifiers as top-level event fields (1 Critical, promoted from High via runtime MITM 2026-05-06)

A destructure-rename pattern in the 1P telemetry pipeline extracts reserved-prefix payload values into local variables and then re-attaches them to the egressed event as typed top-level fields (`plugin_name`, `skill_name`, `marketplace_name`). The reserved prefix is **not** a redaction marker — the sibling field-residual redactor only operates on the leftover destructure rest, not on the destructured locals which are explicitly egressed. Raw third-party / private plugin and marketplace names reach the 1P telemetry endpoint as top-level event fields rather than opaque metadata.

- **Empirical wire confirmation (2026-05-06)**: a single non-interactive bootstrap invocation captured under MITM produced 2 telemetry batches to the 1P endpoint with **356 raw skill_name occurrences (355 unique values)**, **9 plugin_name (2 unique)**, and **9 marketplace_name (2 unique)**. All values raw, unhashed, top-level on `event_data`. Third-party plugin and marketplace identities (one private plugin and its source marketplace) leaked verbatim alongside the official catalogue entries.
- Per-bootstrap volume scales linearly with installed-skill count: each globally-installed skill emits one telemetry event carrying its raw name, fingerprintable when combined with the durable per-account session identifiers transmitted at envelope level.
- v2.1.128 had 11 emitters using this pattern; v2.1.129 adds 2 (a plugin-folder-shadowed event and a plugin-name-collision event) for 13 active emitters total
- A reserved-prefix slot mapping to a raw REPL-input field exists at the egress destructure across v123/v126/v128/v129 but is currently unwired (0 emitter hits empirically). Forward-compat slot — escalate watch if a future binary wires that setter, since raw REPL inputs would be considerably more sensitive than identifier strings.
- Extends the prior envelope-level leak class (raw session_id / device_id / email transmitted on every batch) from envelope to field level

### v2.1.129 server config-eval reachability baseline (informational, supports prior v128 findings)

The same MITM run captured the server-side feature-flag evaluation response: a 46 KB body containing 224 resolved features. Distribution by source: 162 `defaultValue`, 48 `force` (admin-pushed override), 14 `experiment` (active A/B assignment).

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

Adversary capability required: server-flip access to the config-eval channel (Anthropic operations) plus classifier endpoint disruption (could be partial outage, network event, or coordinated). Both are realistic operational conditions. The binary's own `(fail open)` log line is direct acknowledgement of the inversion.

### v2.1.129 reader unification (informational)

Two of the three flag readers in v2.1.128 (`<bool-reader>` and `<string-reader>`) FULLY RETIRED in v2.1.129 — a single unified reader (`<unified-reader>`) handles both bool-default-with-second-arg and string-flag pattern across all 410 telemetry-name call sites. DEFAULT-TRUE bool count went from 18 (v128 stable) to 15 (v129 stable). Net flag delta +13/-3 (1109→1119 unique flags).

### v2.1.129 env-var-opt-in package-manager auto-updater (NOT disclosure-candidate)

A new auto-updater, opt-in behind a dedicated package-manager auto-update environment variable, spawns hardcoded signed-PM commands (`brew upgrade --cask claude-code`, `winget upgrade --id Anthropic.ClaudeCode --exact --silent --disable-interactivity`) with a 5-minute subprocess timeout, surfacing success/failure to UI state. Telemetry-only events (start/success/fail variants) carry only platform booleans and exit codes. NOT disclosure-candidate — uses standard PM signature verification chain, opt-in, hardcoded package names.

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

- **#31 AC3** — *Critical, UNDEFENDED on v152.* The subagent ghost-inbox / attribution-forgery class. v145 added a skill self-recursion guard — this is **orthogonal**: it blocks a forked skill from re-invoking *itself* in its own forked context, and does not touch the inbox-forge path. The relevant transcript-field and inbox-handler anchors are byte-stable v145→v147→v148→v152. AC3 remains an open undefended primitive. *(Status update: a real, partial defence landed in the v2.1.221 → v2.1.241 range — see Phase 10. The finding is **narrowed, not retired**, and the "undefended" wording here is the historical v152 status.)*
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

*Prior status (2026-05-20). This assessment has been **superseded** by the 2026-07-20 refresh in Phase 9 below, which records three gaps closing outright; it is preserved here as the historical baseline.*

A 2026-05-20 review of the official Claude Code docs against the finding inventory surfaces a uniform, one-directional gap that is itself a disclosure-grade observation:

- **User-triggered data flows are documented honestly** — `/feedback`, the session-quality survey, the transcript-share follow-up, and OpenTelemetry export each have a precise description of what is uploaded, retention, and a documented opt-out.
- **Every server-*controlled* path this investigation found is undocumented** — a doc search for "feature flags" returns nothing; the entire server→client config/control channel is absent. None of the primitives that ride it (#103/#106/#108/#113/#115/#127) are mentioned. The Anthropic-bound default-on metrics channel (#92/#110) is described only by exclusion and is silent on the identity metadata it carries. The forced-downgrade path (#113) is not covered by the documented auto-updates opt-out.

The strongest framing is the pattern, not the individual omissions: a reasonable user reading the official data-usage documentation cannot discover that the default-on metrics carry their identity, that a server-controlled channel can change their client's version / system prompt / terminal UI, or that a server flip can add a third-party telemetry destination.

---

## Phase 9: v2.1.153 → v2.1.217 — Continued Rolling Audit, Upstream Remediation, a #127 Demotion, and Three New Findings (#165, #168, #169)

**Scope**: rolling per-version harness audit from v2.1.153 through v2.1.217 (at the close of this window the binary was **v2.1.217**, npm `latest` = `next` = 217, and the marked-stable binary had advanced v2.1.205 → **v2.1.206**; the window's coverage ran through session 81 — see Phase 10 for the current binary and the current coverage range). The investigation stayed in wire-confirmation mode: new subsystems are decoded, priority-finding literals are bounded-grep re-verified each release, and only genuinely new server-reachable primitives are filed. All flag and reader-identifier names redacted; functional descriptions and finding numbers only.

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

### v2.1.207 → v2.1.212 (Session 79): one new injection finding (#165 High) and a hardening sweep

**Scope**: six releases, v2.1.207 through v2.1.212 (current binary **v2.1.212**, npm `latest` = 212; the marked-stable binary remains **v2.1.197**). This window carried **ONE new finding (#165, HIGH), ZERO regressions, and multiple hardening wins.** All six are **genuine per-release builds** (a distinct app build id each) with the bundled runtime unchanged; the entire **+5.27 MiB** of growth is compiled application code confined to the bundle section — section-localized via `readelf`, with the native-code and read-only-data sections **byte-identical** across the installed releases and **no embedded blob** in any of the six string-pair diffs.

**#165 — HIGH (new): a server-push override of a trusted plugin's model-facing text into model context.** A server-controlled configuration value can override an **official-marketplace or built-in** plugin's model-facing text — the plugin's MCP server-instructions plus the tool, parameter, prompt, and skill descriptions handed to the model — and that override text lands **verbatim** in model context. The payload is **type-validated only** (no content sanitization); the primary server-instructions field is **length-capped but not escaped**, and the other description maps are **uncapped**. This is a **new instance of the server-push-into-model-context class** — kin to the Stop-hook override (#106) and the system-prompt override (#154) — but with a **distinct flag, config-cache key, and sink role**: the injected text is attributed to a **trusted first-party plugin's instructions**. Filed **HIGH rather than Critical** because it is **default-off**, gated to **official / built-in plugins only** (third-party plugins cannot be targeted), **fails safe** to the built-in text on a malformed payload, and is **not yet wire-confirmed**. Wire-confirmation is the natural escalation (as it was for #106 / #108 / #113 / #154).

**Hardening wins this window:**

- **A transient v207 feature that briefly routed a server-pushed prompt string into model context was removed one release later.** It was gated behind a remote / cloud-cowork entrypoint and was **never reachable on a plain local session**; it is gone by the next release.
- **A new default-off toggle ADDS authentication to the server-controlled config channel** — a defense-in-depth improvement on the config/control plane this investigation tracks.
- **The memory subsystem's secret-skip guard survived and was hardened through a refactor.** It now **hard-blocks** secret-bearing memory writes (fail-closed).
- **The read-before-write guard-skip on the file-edit tool became non-server-flippable (#152).** The server can **no longer force-skip** the read-before-write guard; the write-path residual stays **Low** (#152).
- **A new guard code-enforces the never-reuse-the-default-branch rule for the cloud / teleport auto-PR path** — partially closing the prior **W-BGPUSH** watch item, so the never-push-to-the-default-branch boundary is now **code-enforced** on that path, not prompt-level.
- **The anti-downgrade guard on the background daemon is now unconditional** — there is **no server flag on its predicate** (the v203 daemon downgrade-refusal WATCH tightens to always-on).

**DEFAULT-TRUE 35 → 43.** All **eight** additions are **benign** — each server OFF-flip either **reduces capability** or is a **reliability / UI / approval-fail-closed** toggle; **none inverts a permission decision**. The two typed defaults stay flat, so the additions are all boolean-style toggles.

**Standing findings byte-stable v206 → v212.** #106 / #110 / #154 / #151 / #127 / #155 all reproduce; the #108 sandbox-classifier fail-open gate **stays removed (0)**. The **#31 AC3 subagent-attribution anchor moved by a single occurrence** — a new **benign error-path producer** stamping the attribution field from a real source id — but the **consumer that #31 AC3 exploits is byte-identical**, so the gap is neither worsened nor fixed.

**Tooling fix.** A per-version delta-extractor **blind spot** was found and fixed: a minified accessor identifier that legitimately contains a `$` character was excluded by the extractor's character class, which had briefly made a **stable** server-push config set read as **removed**. Corrected — the config set is confirmed stable.

### v2.1.213 → v2.1.215 (Session 80): zero new findings, a bundler-runtime revision bump, and a standing anchor that fell without being fixed

**Scope**: three releases, v2.1.213 through v2.1.215 (current binary **v2.1.215**, npm `latest` = `next` = 215; the marked-stable binary advanced v2.1.197 → **v2.1.205**). Across all three: **ZERO new findings, ZERO regressions, ZERO remediations.** All three are **genuine per-release builds** (a distinct application build id each). Method for the window: a lead-owned factual spine plus a **16-unit decode-and-adversarially-verify fan-out**, followed by **two independent contrarian refinement passes** over the surviving residuals.

**This was NOT a pure-JavaScript window — the first since v198.** Every native section of the binary moved and one runtime-internal section was dropped outright. The shift is **fully ATTRIBUTED** to a **bundler/runtime BUILD-REVISION bump under an unchanged semantic version**: the compiled-JavaScript share grew ~1.34 MiB while the binary as a whole grew only ~1.09 MiB, because the **native side shrank**. No embedded-executable markers appear anywhere in the new strings. The distinction is now tracked explicitly per window: an **ATTRIBUTED** native shift (the bundled runtime's revision moved) is expected and benign; an **UNATTRIBUTED** one would mean first-party native code and is a decode trigger. The corresponding methodology fix: the runtime is now identified by `<semantic version>+<build revision>`, not by semantic version alone — semantic version alone was structurally blind to exactly this swap.

**A standing-finding anchor FELL — and the drop decoded as benign, not a fix.** Two of the **#110** raw-field-egress anchors dropped (10 → 6 and 13 → 9). That is precisely the shape a remediation takes, so it was **decoded rather than welcomed**: the prior release's **five inline plugin-command telemetry emits were collapsed into one shared helper** — an ordinary DRY refactor. All five events still fire, with **identical payloads and identical per-event counts**. **#110 STANDS, unremediated**, and the finding thread now records this so a future audit does not misread the lower number as an upstream fix.

**Census, re-derived rather than counted:**

- **DEFAULT-TRUE 43, FLAT** (41 boolean + 2 typed) — re-derived at **MEMBER** level, not by count alone, because a count-stable set can still conceal a swap. Both the added and the removed sets were **empty**.
- **Server-pushed config-cache keys: 9, flat.** The accessor identifier rotated again; it was located by **definition body** rather than by name, confirming the extractor is **not blind** (this is the class of blind spot fixed in the previous window).
- All other standing anchors byte-stable; the **#108** anchor **stays at zero** (removed upstream at v179).

**Two items carried as WATCH — neither filed as a finding.** Both survived contrarian refinement, and both came out **watch-only**:

- **Server-selectable system-prompt text variants.** A family of gates whose activation condition is an **OR, not an AND**, so a **server flag alone suffices** to select a variant. One member **omits a cautionary clause** from tool-use guidance that the prior release rendered **unconditionally** — i.e. a previously-unconditional guard becomes **server-suppressible**. It is **not #106-class**: the server contributes only a **boolean or a three-value enum**, and every rendered sentence is a **literal already compiled into the client** — **no server-authored text reaches model context**. Watch-only because a fourth member of the family **pre-dates** this window, and because **#106 / #154 / #165 strictly dominate** it in reach. Tracked as a new **low-severity tracker issue (#166)**.
- **A remote grant auto-resolving a local permission prompt.** Default-off, **triple-bounded** in reach, establishes **no durable allow-rule**, and the grant it waits on is itself a **real user action on another first-party surface** — so it **relocates** an approval rather than fabricating one.

**Hardening confirmed this window:**

- **An environment opt-out that hard-disables all model substitution, fail-closed** — with it set, a flagged message **pauses the session** rather than silently switching the user onto a different model.
- **The daily-briefing surface is now fully retired, with zero successor** — completing the removal begun at v208 (the transient v207 server-pushed-prompt path noted in the previous window).

**Benign new surfaces, all decoded:**

- **A local-only configuration import command** with an unusually defensive apply path: it refuses paths that escape the source directory, refuses project-scope writes underneath a symlink, **never overwrites an existing target**, and **does not port hook definitions**.
- **Organization-memory literals that are telemetry, not flags** — a server-to-local mirror only, with **no upload path added**. The fail-closed secret-skip memory guard from the previous window **survives** here.
- **An operator-environment-only first-party cloud provider** that **no server flag can reach**; its auth-skip toggle is an operator gateway header and is fail-closed.
- **An OpenTelemetry content-length control that returns a MINIMUM** — so it can only ever **shorten** emitted content, never lengthen it. The underlying path pre-dates this window, is default-off, and is byte-stable; it is **not** an expansion of the #105 telemetry footprint.

Standing findings **#106 / #110 / #154 / #151 / #127 / #155 reproduce byte-identical v212 → v215**; **#108 stays removed (0)**. No status changes.

### Documentation-gap analysis refreshed (2026-07-20): the asymmetry narrowed but did not close

The 2026-05-20 assessment recorded above was **re-run against the current official Claude Code documentation corpus (170 pages)** and is **superseded** by this refresh. The direction of travel is genuinely positive, and three prior gaps **closed outright**:

- **The server-to-client feature-flag channel is now named on the record** as Anthropic's feature-flag service, **with a documented opt-out environment variable** (`DISABLE_GROWTHBOOK`). The single largest omission of the 2026-05-20 review — that a doc search for "feature flags" returned nothing at all — no longer holds.
- **The remote-session `--teleport` flag is now fully documented.**
- **The hook input-REWRITE surface is documented in detail** — the `PreToolUse` hook's ability to return an `updatedInput` that replaces the tool's arguments is now described rather than merely implied.

**What did not move.** Across all 170 pages there is still **nothing** describing:

- a **server-pushed string that reaches the model's context or system prompt** (#106 / #154 / #165);
- a **server-pushed notice rendered in the user's terminal** (#127 / #155);
- a **server-initiated version DOWNGRADE** (#113) — still not covered by the documented auto-updates opt-out.

The Anthropic-bound operational-metrics channel remains described **only by what it excludes**, never by the **identity metadata it carries** (#92 / #110).

**Two affirmative security claims now appear in the docs where this repository holds contrary evidence** — the documentation states that background marketplace refresh **disables git credential helpers**, and that a teammate's relayed approval is **treated as untrusted**. Both are directly contradicted by tracked findings (**#151** and **#31** respectively). Documented claims are easier to test and easier to discuss than silence, so this **strengthens rather than weakens** the disclosure posture on both.

### Redaction tooling rebuilt (Session 80)

The publish-time redaction enforcer was **inverted in design**: it moved from a **hand-enumerated list of known-sensitive tokens** to **scan-and-subtract**. It now extracts **every internal-shaped identifier** present in the public mirror and subtracts **everything the official documentation publishes** — so a **newly invented internal name is caught on day one**, rather than whenever someone remembers to add it to a list. The governing rule is now explicit: **a name published in the official documentation is not sensitive and is used verbatim**. The publish-time redactors additionally **fail closed** — the build **aborts** rather than emitting an identifier that no mapping table happens to cover. The rebuild immediately caught a class of leak the enumerated list had **structurally never looked for**.

### v2.1.216 → v2.1.217 (Session 81): two new findings and the densest remediation window since v2.1.205

**Scope**: two releases, v2.1.216 and v2.1.217 (current binary **v2.1.217**, npm `latest` = `next` = 217; the marked-stable binary advanced v2.1.205 → **v2.1.206**). This window carried **TWO new findings (#168 CRITICAL, #169 LOW), ZERO regressions**, and the **most remediation-dense set of upstream fixes since v2.1.205**.

**#168 — CRITICAL (filed HIGH at v2.1.216, wire-confirmed at session-82): a server-pushed configuration STRING reaches model context verbatim.** A string-typed value on the server-to-client feature-configuration channel, carrying an **empty default**, is interpolated **verbatim** into the instruction text of the built-in multiple-choice question tool — the tool Claude Code uses to ask the user to pick between options — and that instruction text ships to the model on the `/v1/messages` endpoint. Two properties make it notable:

- **Validation is a type check and a whitespace trim only.** There is **no length cap** and **no schema or allowlist** on the value.
- **It is read unconditionally.** A sibling value serving the same builder is read only inside a **model-eligibility gate**; this one is not, so it applies to **every account regardless of model or tier**.

The empty default means the mechanism is **dormant until a server flip**, so it is invisible both in normal operation and in a static review of shipped behaviour. It **appends to** rather than overrides the base instruction text — a mitigation, but not a change of class. This is the **same primitive family** as the previously reported server-pushed-string findings (**#106**, **#154**, **#165**). **Filed HIGH, then WIRE-CONFIRMED and promoted to CRITICAL** (session-82, on v2.1.217): an injected value on the configuration channel arrived in the outbound `/v1/messages` request inside the question tool's own description field, spliced *mid-instruction* between two paragraphs of the genuine text with no delimiter, attribution, or quoting; the model-eligibility-gated sibling arrived at its default in the same capture, confirming the unconditional read on the wire. Suggested remediation: cap the length, constrain the value to a **server-side allowlist of known variants or an enum index** rather than free text, and apply the **same eligibility gate its sibling already has**.

**#169 — LOW (new at v2.1.217): the subagent recursion-depth ceiling became a server-pushed integer with no upper bound.** The limit on how deeply subagents may nest **stopped being a compiled-in constant**. It now resolves as **operator environment variable → server-pushed integer from the same configuration channel → local default**, and the validator accepts **any integer of at least 1, with no upper clamp**. The same accessor additionally decides whether nested workers are handed the spawn capability at all. Two things keep this **LOW**:

- It is explicitly **not a permission or sandbox inversion** — no authorization decision changes, only **resource breadth**.
- The **shipped posture actually improved**: the previous release compared against a hardcoded depth of **5**, while v2.1.217 defaults to **1**, which strictly **shrinks** the nesting surface that the standing subagent-attribution finding (**#31**) depends on.

Anthropic **documents both operator overrides in the public changelog** (a maximum-subagent-spawn-depth override and a maximum-concurrent-subagents override, the latter defaulting to 20). The finding is the **unbounded REMOTE knob**, not the default. A candidate **third** issue here was checked and **REFUTED**: the environment branch returns its value without an inline guard, which looked like a malformed value could disable the cap entirely — but the environment registry entry is a **validated positive-integer parser**, so a bad value never reaches the comparison. Suggested remediation: **clamp the server-pushed value against a compiled-in ceiling** rather than accepting it outright.

**Build shape: a pure-JavaScript window.** The compiled native sections are **byte-identical across all three builds**, the section count is unchanged, the embedded runtime build revision is **flat**, and there are **zero embedded executable blobs** in the new strings. The binary grew **+3.18 MiB**, but printable text grew only about **566 KB (17%)**. The binary-to-strings growth ratios are **6.2× and 5.4×** across the two increments — **consistent**, which is the signature of embedded bytecode scaling with source rather than a hidden payload. The new source splits across roughly **eight modest subsystems**: no mega-feature, **no new versioned API endpoints**, and **no new egress hosts**.

**Remediation shipped by Anthropic this window is unusually dense.** Three of the fixes are **sandbox escapes of exactly the shape this investigation probes for**:

- **workflow saves and scheduled-task writes following a symlink at the project configuration directory**, which could redirect writes outside the project;
- **background session isolation not canonicalizing symlinked working directories**, which could let a session escape its workspace folder;
- **worktree-isolated subagents redirecting git into the shared checkout** via `git -C`, `--git-dir`, or the `GIT_DIR` / `GIT_WORK_TREE` environment variables.

Alongside those: Bash command permission checking for **compound statements with redirects inside `&&` lists or negations**; **read-only commands on Windows reaching network paths** without a permission prompt; **permission validation of commands containing invisible Unicode characters**; a **stale daemon lockfile that could terminate an unrelated process**; and a **managed-settings fix** so that lower-scope signal-specific overrides can no longer **redirect telemetry away from an organization's managed OpenTelemetry endpoint** — directly relevant to the standing telemetry findings (**#92 / #105**).

**One candidate was refuted rather than filed, and is recorded as a WATCH.** An **environment-supplied session-provenance string**, when set to a particular value and combined with a **server-authored marker**, does skip the **organization-policy entitlement layer** of the gate governing whether dynamic workflow scripts may run. The mechanism is **real and new**. But **no feature-flag read participates** — the discriminator is a process environment string plus a boolean literal set at one call site — so it is **not a server-flippable flag inversion**. Local reachability is effectively **nil**: the marker is set only by the **remote-event launch handler**, which requires remote transport plus two cloud-runner environment identifiers, then validates a **hash- and size-checked artifact pointer**, and the script still passes **size and control-character filters**. The **enterprise-strongest layer — the managed-settings disable — is unchanged**. Net assessment: **the server bypassing its own entitlement layer is a design choice, not an attacker primitive**.

**Two family-name traps were also refuted, which is worth recording as method.** Two of this window's new configuration flags **share a naming prefix** with previously reported findings, and in **both** cases the shared prefix turned out to be **meaningless**:

- One sits in the same naming family as a **confirmed server-pushed system-prompt injection**, but its call site only selects between **two compiled-in English wordings** of a "this tool is not available" hint — **no server-supplied string is involved**.
- The other appeared **adjacent to a model-identifier comparison**, suggesting it might reroute which model serves a request; the adjacency is **minifier placement** — the declarations and the predicate have **separate callers**, and **no reader in that block touches model selection, catalog eligibility, or request routing**.

A **third** new flag that looked like an auto-mode permission gate turned out to be a **telemetry EVENT name, not a feature flag**; the auto-mode safety classifier still **fails CLOSED** when unavailable, which was verified directly.

**Census, re-derived from the binaries rather than carried forward:**

- **DEFAULT-TRUE 43 → 45**, re-derived at **MEMBER** level so that a swap cannot hide beneath a flat total: the **added set is exactly two flags** and the **removed set is empty**. Both additions are **benign** — one gates **local housekeeping of bridge placeholder records**, and the other gates whether **MCP tool errors throw versus return as an error object**, where the default-TRUE branch is the **stricter** of the two, making the shipped default a small **hardening**. Neither reaches a permission, sandbox, egress, or credential sink.
- **Server-push configuration cache keys flat at 9**, with **identical members**.
- **All twelve standing finding anchors are byte-stable** across the window, and the **memory secret-skip guard remains intact** at a flat occurrence count on **both** the organization-memory and the **new session-memory** write paths.

Standing findings **#106 / #110 / #154 / #151 / #127 / #155 / #165 reproduce byte-identical v215 → v217**; **#108 stays removed (0)**; **#31 AC3 remains UNDEFENDED** as of this window (its nesting surface narrowed slightly by the #169 default change, but the attribution gap itself is untouched) — **superseded from v2.1.221 onward**, where a partial defence narrows it (Phase 10).

### Tally (prior status, as of v2.1.212, Session 79)

Severities mirror `docs/counts.js` (authoritative). The live GitHub-label re-derivation across the repo issue set: **14 critical / 38 high / 59 medium / 13 low** (124 severity-labeled issues across **164** total repo issues). The high count rose by one for **#165** (the new server-push plugin-instruction override); the medium / low / total movement (53→59, 11→13, 155→164) is a **catch-up** that folds an earlier issue batch into the tracker, re-derived directly from the issue set — not new server-reachable findings. The original tooling-audit baseline census stands at **30 items** (7 critical / 9 high / 10 medium / 3 low / 1 observation). The server-flippable DEFAULT-TRUE set is now **43** (41 boolean + 2 typed). Current binary **v2.1.212** (npm `latest` = 212); the marked-stable binary is **v2.1.197**. Net direction across the v153 → v212 window: two genuine remediations of tracked findings (#115 closed at v156, #108 removed at v179), one hardening default-flip (v196), the v207→v212 hardening sweep (config-channel authentication toggle, fail-closed secret-skip memory guard, a non-server-flippable read-before-write guard-skip tightening #152, a code-enforced never-reuse-the-default-branch guard partially closing W-BGPUSH, and an unconditional daemon anti-downgrade predicate), and — across v197 → v212 — a **single new finding** (#165, High) against a backdrop of otherwise benign feature builds. The v198 major release plus the v202 diagram-in-Artifacts feature (which itself **ships an XSS sanitizer**) landed new capabilities (background auto-push / draft-PR, host-managed credentials, observer agents, design-consent upload, credential-mediating cloud-runner proxy) with use-site hardening, fail-closed defaults, and operator-gated toggles below the local-reach bar. The DEFAULT-TRUE set moved 32 (v200) → 33 (v202) → 34 (v203) → 35 (v206) → 43 (v212); every addition is benign and **none is a safety-gate inversion**. Functional WATCH items on the ledger: the v203 daemon downgrade-refusal guard (now tightened to always-on) and the v205 auto-mode exfil-awareness enrichment (net-defensive). Standing against all of this: the two v178→v191 injection primitives (#154 Critical, #155 High), the new #165 (High), and the #127 demotion (Critical → High).

### Tally (prior status, as of v2.1.215, Session 80)

Severities mirror `docs/counts.js` (authoritative). The live GitHub-label re-derivation across the repo issue set: **14 critical / 38 high / 59 medium / 14 low** across **165** total repo issues. The **only** movement from the Session-79 tally is **low 13 → 14** and **total 164 → 165** — a single new **watch-tracker** issue (**#166**, the server-selectable system-prompt text variants). There are **ZERO new harness findings**, **ZERO regressions**, and **ZERO remediations** in the v213 → v215 window; the critical, high, and medium counts are unchanged. The original tooling-audit baseline census stands at **30 items** (7 critical / 9 high / 10 medium / 3 low / 1 observation).

The server-flippable DEFAULT-TRUE set is **43** (41 boolean + 2 typed), **FLAT** across this window and re-verified at **member** level — added and removed sets both empty, so the flat count is a verified-identical set rather than a coincidence of arithmetic. Server-pushed config-cache keys hold at **9**.

Current binary **v2.1.215** (npm `latest` = `next` = 215); the marked-stable binary advanced **v2.1.197 → v2.1.205**. Net direction across v213 → v215: a **quiet window** — three genuine per-release builds, one **attributed** bundler-runtime revision bump (the first non-pure-JavaScript window since v198, fully explained and carrying no first-party native code), two hardening confirmations (a fail-closed model-substitution opt-out; the daily-briefing surface fully retired with no successor), four benign new surfaces, and two WATCH items that both survived contrarian refinement as **watch-only**. The one event that looked like good news — a **#110 anchor count falling** — was decoded and is **a DRY refactor, not a remediation**: **#110 stands**. Standing against all of this, unchanged: the injection primitives **#106 / #154** (Critical), **#155 / #165 / #127 / #151** (High), and the undefended subagent-attribution gap **#31 AC3** (Critical).

### Tally (prior status, as of v2.1.217, Session 81)

Severities mirror `docs/counts.js` (authoritative). The live GitHub-label re-derivation across the repo issue set: **15 critical / 38 high / 61 medium / 15 low** across **169** total repo issues. The movement from the Session-80 tally is **high 38 → 39** (**#168**, the server-pushed multiple-choice-tool instruction string, which was *filed* High at v2.1.216) and **low 14 → 15** (**#169**, the unbounded server-pushed subagent recursion-depth ceiling); the header counts above already fold in **#168**'s later wire-confirmation and promotion **High → Critical**, which is why they read critical **14 → 15** with high settling back at **38**. The original tooling-audit baseline census stands at **30 items** (7 critical / 9 high / 10 medium / 3 low / 1 observation).

The server-flippable DEFAULT-TRUE set moved **43 → 45** (**43 boolean + 2 typed**), re-derived at **member** level — the added set is exactly two flags, the removed set is empty, and **both additions are benign** (a local-housekeeping toggle and an MCP tool-error-handling toggle whose default branch is the stricter one). Server-pushed configuration cache keys hold at **9** with identical members.

Current binary **v2.1.217** (npm `latest` = `next` = 217); the marked-stable binary advanced **v2.1.205 → v2.1.206**. Net direction across v216 → v217: a **pure-JavaScript window** (+3.18 MiB binary, ~566 KB of new printable text, native sections byte-identical, no embedded blob, no new API endpoints, no new egress hosts) that carried **two new findings** — **#168 CRITICAL**, a fourth member of the server-pushed-string-into-model-context family alongside #106 / #154 / #165, and **#169 LOW**, a compiled-in recursion-depth constant becoming an unbounded remote knob — against the **densest set of upstream remediations since v2.1.205**, including three symlink / worktree sandbox-escape fixes, three permission-evaluation fixes (compound redirects, Windows network paths, invisible Unicode), a stale-lockfile process-kill fix, and a managed-settings fix that stops a lower-scope override redirecting telemetry away from an organization's managed OpenTelemetry endpoint. Three candidates were **refuted rather than filed** — an entitlement-layer skip on the dynamic-workflow gate (real, but not flag-driven and effectively unreachable locally; carried as a WATCH), and two **family-name traps** where a shared naming prefix with a confirmed finding proved meaningless. Standing against all of this, unchanged: the injection primitives **#106 / #154 / #168** (Critical), **#155 / #165 / #127 / #151** (High), and the undefended subagent-attribution gap **#31 AC3** (Critical).

---

## Phase 10: v2.1.218 → v2.1.241 — A Silent Hooks-Trust Fix, an Availability Regression, and a Twenty-Window Decode That Changed the Method

**Scope**: rolling per-version harness audit from v2.1.218 through v2.1.241 (at the close of this window the binary was **v2.1.241** and audited coverage ran v2.1.89 → **v2.1.241**; the window's coverage ran through session 87 — see Phase 11 for the current binary and the current coverage range). Three sub-windows: v218 (zero findings, one silent upstream fix), v219 → v220 (one Low finding plus a correction of our own), and the v221 → v241 block — **twenty windows decoded in a single pass**, restoring the "zero unaudited gaps" property the project is built on. All flag and reader-identifier names redacted; functional descriptions and finding numbers only.

The most consequential result of this phase is **not a finding**. It is a **method gap** (#185): for a server-controlled configuration channel, reading the *default* out of the binary answers the wrong question, and the client has been holding the right answer all along.

### v2.1.218 (Session 83): zero findings, zero regressions — and a silent security fix

**ZERO new findings, ZERO regressions.** The window's headline is a fix that **never appeared in the public changelog**: a new enforcement guard **refuses to register hooks declared in an agent definition's frontmatter when that definition file came from a directory the user never accepted the trust dialog for**. The refusal blocks at **both** the main-thread and the subagent call sites, and the registration routine itself is **byte-equivalent** — the change lives entirely at the callers.

This **narrows #97 / #98 for the untrusted-origin case only**. Hooks declared in **settings files** or contributed by **plugins** are unaffected, so **#97 / #98 remain open**.

Two further hardening items shipped in the same window: a **memory mass-delete cap** that drops an entire delete batch when the missing-locally count exceeds a threshold — with its opt-out read from the **operator environment only, never through the server configuration channel** — and a **tokenizer-faithful asset-injection validator** replacing regex-based script matching.

**One near-miss is worth publishing as method.** A decode pass described a settings-source label as "the server-pushed flag channel", which would have made it a **server-to-hook-command-execution Critical**. That label in fact denotes a **command-line settings source** — operator-controlled — so filing it as written would have produced a **false Critical**. A source label that merely *sounds* like the server channel is not the server channel; the discriminator has to be read at the assignment site, not inferred from the name.

**DEFAULT-TRUE moved 45 → 48**, and one of the three is not a new gate at all but a **pre-existing flag whose shipped default was flipped on** — a distinction that only a member-level re-derivation surfaces.

### v2.1.219 → v2.1.220 (Session 84): one finding (#171, Low), zero security regressions

The window's real content is **v219** — a memory subsystem with **pinned auto-injection**, an **on-disk keyword index**, and **organisation / team mounts** (all local or operator channels; the team subtree is excluded from pinning). **v220 is a near-no-op** — and yet it carries the finding.

**#171 — LOW: a dead strip-and-retry latch can block every auto-mode classification for a whole session.** v220 is the first release to attach a **dated beta header** to *both* stages of the auto-mode permission classifier. The **strip-and-retry latch** that exists precisely to survive the endpoint rejecting that header is bound to a value that is **only ever assigned null**, so its guard is unconditionally true and **the retry can never fire**. A server rejection therefore propagates straight into the fail-closed catch and **blocks every auto-mode classification for the rest of the session**. The direction is **fail-CLOSED**, so this is explicitly **not** an authorisation inversion and **not #108-class** — it is an **availability regression on the permission path**. Carried forward as a watch item on the latch.

**Anchor re-baseline — and it is NOT a remediation.** The system-prompt injection finding **#154** moved **7 → 8** occurrences. The extra occurrence is a **new local fallback branch** that injects a **hardcoded default** when both server tiers return empty. **Both server tiers are unchanged**, so **#154 remains unremediated**, now anchored at 8. *(Status update: the delivery arm was later confirmed in routine production use from on-disk evidence — see Phase 11.)*

**A second finding held a completely flat occurrence count while its underlying default TRIPLED.** The server-pushed recursion-depth ceiling (**#169**) sat at an identical count across the window while its default moved **1 → 3** — structurally invisible to a count-based check, and caught only by **reading the public changelog**. Two method rules were earned here: **a flat occurrence count never proves a flag's default is unchanged**, and **the changelog is a first-class recon input**, surfacing changes that a flag / environment / endpoint diff cannot see by construction.

**A correction of our own, filed as #172.** An earlier claim that team memory mounts arrive **only** through an operator environment variable was **wrong**. A **second, pre-existing route** exists whose returned stores become **recall-eligible**, so another **same-organisation** principal's content can be selected into a user's context **without that user ever naming the store**. It is still **not** a text-injection finding — the server selects *which* stores mount; it cannot supply the injected string.

**Census correction.** The literal census of **server-pushed configuration cache keys** was corrected **9 → 10** (the long-carried 9 was stale), and it remains a **structural undercount**: one prompt-variant family reads that cache through a **computed** key, which a literal census cannot see at all.

### v2.1.221 → v2.1.241 (Session 87): twenty windows decoded in one pass, ten issues filed (#176 – #185)

Coverage moves to **v2.1.241** — the first advance since v220 — and the "**zero unaudited gaps**" property is **true again**.

#### The headline is a method gap (#185): audit what was SERVED, not what shipped

Every flag census this project had ever run read the **default** out of the binary and assigned severity from it. For a **server-controlled** configuration channel that answers the wrong question — the default is what *ships*, not what is *served*. The client has held the right answer all along, in **its own local cache of the values the server actually served**.

Diffing a census against that cache **for the first time** showed:

- **17 of the 55 newly-added default-OFF gates are switched ON for this account** — **four** of them paths that carry **externally-authored text into model context**;
- the inverse check was **clean**: of **76 default-ON gates, only three are served off**, and **none of those three is a permission decision**.

This is now **standing procedure**, and it **reversed a severity call mid-session**: a finding filed **High** was downgraded to **Low** on the reasoning that it also needed a *second* default-off gate flipped, then **restored to High** when the served-value cache showed **both gates already on**. The downgrade was right about defaults and wrong about reality.

#### The pass also had a scoping error, caught by its own completeness critic

The planned sweep covered only the **35 newly-added default-ON** gates. That is **backwards for this project's threat model**: every wire-confirmed finding in the server-push injection lineage (**#106 / #154 / #165 / #168**) is an **empty-or-false default that the server FILLS IN** — the permissive state is reached by a **push**, not by a withhold. The **55 default-OFF** gates were then swept properly: **54 of 54 covered**, and under adversarial verification **8 confirmed, 21 confirmed-but-overgraded, 2 refuted outright**. Two thirds of the escalations were **real mechanisms with inflated severity** — precisely the distribution a verification stage exists to produce.

#### #176 — HIGH: a cloud runner applies server-supplied command-line arguments through a DENYLIST

A runner applies **server-supplied command-line arguments** to the child process it spawns, filtered by a **denylist rather than an allowlist**. The nine denied entries are all **transport plumbing the runner sets itself**, so two security-relevant arguments remain reachable from the server: one that **appends server-controlled text to the child's system prompt**, and one that moves the child **out of permission checking entirely**.

An honest bound keeps this from being larger than it is: the applier **skips empty values** and pushes each value as a **separate argument**, so **bare boolean flags cannot be smuggled through**. What argues the shape is unintended rather than deliberate is an **asymmetry inside the same binary** — a sibling bridge consumes an **identically-named argument map through a strict allowlist with its own telemetry**, and **that allowlist already existed before the runner shipped**. The newer subsystem chose the **weaker of two in-house patterns**. One denylist entry was **bisected to a silent addition mid-range**, which shows the surface is recognised internally as one that needs managing.

#### #181 — HIGH: a server flag converts a mandatory human approval into a classifier decision

A server-controlled, **default-off** flag converts the **mandatory human approval prompt on destructive external-tool calls in automatic mode** into a **classifier decision**. Walked by hand: with the flag off the approval fallback fires; with it on the fallback is **skipped** and the call is routed to the automatic-mode classifier **instead of to the user**. In a **remote or headless** session there is **no human on the other end of that prompt**, so the flip is the difference between **blocked and executed**.

It is **fail-closed by default** and the classifier still runs, so it is **not a full inversion** — and the served-value cache shows it currently **OFF for this account**, which is worth stating plainly rather than leaving a reader to assume the worst.

#### #182 — HIGH: a new cross-session message gate can be told to trust the sender's self-description

A server-controlled flag makes a **new cross-session message gate trust a field the SENDER supplies about itself**, converting a **hold-for-human-review** into an **automatic accept** for a receiver running with permission prompts bypassed. This **contradicts the subsystem's own in-source contract**, which states in as many words that the sender-supplied origin field is **forgeable by any process running as the same user** and must never be used to key identity. *(Status update: the gate's compiled default flipped ON at v2.1.248, so this premise is now what ships — see Phase 11.)*

#### #177, #178 and #184 — MEDIUM

- **#177** — a server-controlled flag whose **off-state removes an identity-binding control and its teardown from a LIVE remote-control channel**, so a session **survives a local sign-out and a different account signing in**. Graded **Medium rather than an inversion** because the **entire subsystem is new in this range**: turning it off restores the older baseline rather than inverting a standing guarantee.
- **#178** — a **cross-tool permission-response confusion** on the control channel, **remediated in-range** — with a **residual that is still live**, because the new guard **returns early when the tool-name field is not a string**, so a response that **omits the field entirely** resolves whatever pending request matches its identifier.
- **#184** — a **fast path that auto-approves writes into verified linked repository worktrees outside the declared working set**, skipping the classifier. This is the **only confirmed permission widening** out of the entire default-off sweep.

#### #183 — INFORMATIONAL (plus two Low): a new class of local execution

A **remote session can drive shell commands on the user's LOCAL machine** over an outbound socket, with the **output returning to the REMOTE session's model** rather than to the local one. The important design fact is that this path **bypasses the local permission system entirely** — **no per-call permission check, no permission mode, no allow / deny rules, no local pre- or post-tool hooks** — substituting the **operating-system sandbox** instead, whose preconditions **fail closed at six checkpoints**, two of them guards written specifically against **sandbox-escape pivots**.

It is **inert on a stock install**, sitting behind an explicit command-line action, **two default-off server flags**, an **organisation policy that fails closed**, a **signed device binding whose server echo the client verifies**, and a **sandbox opt-in that is off by default**. Filed **informational** because the substitution is coherent and the gating is genuinely layered — but it **belongs in the harness map**, because a reviewer who assumes that *all* local tool execution passes the permission check would now be **wrong**.

#### #31 AC3 is NARROWED, not retired

The inter-agent attribution-forgery finding gained a **real defence** in this range: a new **inbound gate that fails closed on every ambiguity**, keys peer identity on **kernel socket credentials** rather than on the message payload, and surfaces a **claimed** name separately from a **verified** process identity in a human approval dialog **whose text sanitisation was attacked and held**. The binary now **concedes the finding's core claim in source**.

It is **not retired**, for four reasons the source itself concedes:

1. the **verified identity never reaches the model** — the model-visible wrappers carry no such field;
2. the **in-process send path calls the delivery primitives directly** and is therefore **never classified by the gate**;
3. the verified identity is **absent on some platforms**, and it identifies the **connecting process**, not the message author;
4. **process identifiers are recyclable**.

Any statement that **#31 is simply undefended is now stale** and should not be repeated unqualified. The Phase 8 and Phase 9 registry entries above record the pre-v221 status and are preserved as history.

#### Three counting traps fired in one session, all the same shape

All three were a **zero occurrence count read as novelty**:

- **names assembled at runtime from fragments** never enter the string pool, so they read as **absent while the code is present**;
- one **apparently new subsystem** turned out to be a **telemetry SPELLING change** over a subsystem that already carried **172 occurrences** in the older build;
- a conclusion of ours that a leak **fired on a new trigger** was **wrong** — the **label** was new but the **code path** was not, which makes it a **retroactive widening over behaviour the installed base was already running**. That reads **worse**, not better.

The rule earned: **a literal count of zero is evidence of absence from the string pool, never proof of absence from the code** — and a negative case must be checked against the **behaviour's own literals**, not against the name of the thing being looked for.

#### Recorded as carefully as the findings: a defended vector

The same runner subsystem ships the **first named, logged sanitiser on the server-input channel anywhere in this codebase**. It **strips privileged operator tool names out of the server-supplied argument map before spawning**, with an **explicit log line**, and the child-environment builders **null out the subsystem's own secrets** so they are not inherited.

It is now tracked as a **defence anchor** — an anchor whose **disappearance** is the alarm rather than its presence. That **inverts** how every other anchor in the set reads, and the ledger records it as such so that a future audit does not quietly drop it.

#### Build shape: native-change attribution is complete for the range

**Five runtime build-revision bumps correspond exactly to the five windows whose native sections moved** — **no unattributed native change anywhere in twenty windows**. The largest of those windows is also the **largest JavaScript window in the range**, a fact that the "largest native change" framing had buried.

### Tally (prior status, as of v2.1.241, Session 87)

Severities mirror `docs/counts.js` (authoritative). The live GitHub-label re-derivation across the repo issue set: **15 critical / 41 high / 68 medium / 18 low** across **184** total repo issues. Movement from the Session-81 tally: **high 38 → 41** (**#176**, **#181**, **#182**); **medium 61 → 68** and **low 15 → 18** fold in the new Medium findings (**#172**, **#177**, **#178**, **#184**), the two Low items carried alongside **#183**, the **#171** availability regression, and the session's method / tooling trackers (including **#185**). The **critical count is unchanged at 15** — no new Critical was filed across twenty-four releases. The original tooling-audit baseline census stands at **30 items** (7 critical / 9 high / 10 medium / 3 low / 1 observation).

The server-flippable **DEFAULT-TRUE set stands at 76** (**74 boolean + 2 typed**). It held at **48** (46 boolean + 2 typed) from v2.1.218 through v2.1.220 and then grew across the twenty-window v221 → v241 block. The **served-value** check is now part of the census rather than the default alone: **17 of the 55 newly-added default-off gates are ON for this account**, while only **three of 76 default-on gates are served off** — none of the three a permission decision.

Current binary **v2.1.241**; **audited coverage runs v2.1.89 → v2.1.241**, and the "zero unaudited gaps" property is restored. Net direction across v218 → v241: **one silent upstream remediation** that narrows **#97 / #98** for untrusted-origin agent-frontmatter hooks only; **one availability regression** on the permission path (**#171**, fail-closed); **three new High findings** (**#176** denylist-filtered server-supplied child arguments, **#181** a mandatory human approval convertible into a classifier decision, **#182** a cross-session gate trusting sender-supplied origin); **four Medium** (**#172**, **#177**, **#178**, **#184**); a **new class of local execution documented as informational** (**#183**); and a **real, partial defence of #31 AC3** that narrows the finding without retiring it. Standing against all of this, unchanged: the injection primitives **#106 / #154 / #168** (Critical) and **#155 / #165 / #127 / #151** (High), with **#110** still unremediated and **#108** still removed (0).

---

## Phase 11: v2.1.242 → v2.1.258 — The Skipped Release, Two Counting Traps, and a Standing Finding That Became the Shipped Default

**Scope**: rolling per-version harness audit from v2.1.242 through v2.1.258 (current binary **v2.1.258**, npm `latest` = `next`; **audited coverage runs v2.1.89 → v2.1.258**; coverage extends through **sessions 88 – 90**). Three sub-windows: **v2.1.242**, the release the twenty-window pass skipped and the largest single build in this project's record; **v2.1.242 → v2.1.246**, zero findings whose entire content is a method result; and **v2.1.246 → v2.1.258**, one escalation of a standing finding, zero new vectors, and an unusually security-positive window. All flag and reader-identifier names redacted; functional descriptions and finding numbers only.

**"Zero unaudited gaps" stopped being a claim and became a computed property.** Coverage is now a **generated per-version table** — one row per released version, built from document front-matter only, never from filenames and never from prose — behind a **check that fails** when a released version has no document standing for it. A sentence advanced by hand can drift; a failing check cannot.

### v2.1.242 (Sessions 88–89): the release the first pass skipped — #195, #201, #193

The twenty-window pass that closed Phase 10 **skipped a release**, and it was the largest one in the range: **+34.9 MB**, with the bundle split from **11 modules to roughly 1,385**.

#### #195 — HIGH: a plugin-registered handler module can SUBSTITUTE model-facing text, not merely append to it

A runtime introduced in this release lets a **registered plugin handler module replace** the **tool description sent to the model**, and replace **prompt-section text**, rather than appending to it. There is **no delimiter and no attribution**, so the substituted text arrives in model context indistinguishable from first-party text, and the validation is **a type check plus a 32,000-character cap**. It sits behind a **default-off internal gate that is absent from the served-value cache** — which is exactly the shape the server can arm.

It was filed **High rather than Critical**, with an explicit promotion gate: **provenance, not shape** — whether a server-influenced plugin can carry such a module at all. That gate was **answered in session 89 and NOT cleared**. Registration is **not** restricted to locally-installed plugins; but **no path was found by which the server supplies the module's CONTENT**. The honest reading is a split rather than a single actor: the **server arms the gate**, and the **plugin distribution channel supplies the text**.

#### #201 — HIGH: v2.1.251 widened the same surface, and one widening LEAVES THE MACHINE

Two further substitution kinds landed on that runtime at **v2.1.251**. One **rewrites the co-authorship trailer block that is appended to every commit message and pull-request body** — the **first reach in this family that leaves the local machine**, because the substituted text is then committed and pushed rather than merely read by the model. The other **replaces whole skill bodies**. Everything the #195 entry records about delimiters, attribution and validation applies unchanged to both.

#### #193 — HIGH (method): the reason #195 was missed is the more valuable half

Every agent in the twenty-window pass chose its targets from the **standing anchor table** — which is, by construction, **a list of the PREVIOUS window's literals**. A release's **largest new subsystem is therefore invisible to the entire method**, not through oversight but by design: it has no anchors yet, so nothing in the target list points at it.

The corrective is a **census of the model-context surface as a class** — every path by which externally-authored text can reach the model — and **that census still does not exist**. Until it does, this failure mode recurs on every release that ships a genuinely new subsystem.

### v2.1.242 → v2.1.246 (Session 88): zero findings, and two counting traps that had been corrupting every earlier census

**ZERO new findings.** The window's content is a **method result**, and both halves of it invalidate work that predates them.

**Trap one: the extraction step read 7-bit single-byte literals only, so every census this project has ever run was blind to the binary's UTF-16 text.** The bias runs in the dangerous direction — text that exists but is not extracted reads as **removed**, and a removal reads as **remediation**. Concretely: a cached diff asserting **68 removed API endpoints** was **wrong on 65 of them**. The extractor now emits **both encodings**, and the **entire cached corpus was re-acquired** rather than patched in place.

**Trap two: a raw occurrence count is not a property of the code.** It is **source copies plus one bytecode-constant-pool copy per referencing code block**, and the pool term belongs to the **build**, not to the program — it moves whenever the bundler **re-chunks**. Applied to this window: **all eight anchor "drops" at v2.1.246 are packaging**. None was a remediation. **None was even a refactor.** And the **runtime build-revision is not the predictor** of when this happens, which had been the working assumption. A dedicated tool now performs the source-versus-pool split **before** any claim is drawn from a count delta.

**v2.1.244 was never published for this platform.**

### v2.1.246 → v2.1.258 (Sessions 89–90): one escalation, zero new vectors, and an unusually security-positive window

Twelve release slots, **seven published**. **v2.1.249 and v2.1.253 – v2.1.256 never shipped**, so anything introduced and reverted inside them is **invisible and always will be** — the same permanent blind spot as the unpublished **v2.1.244** slot recorded above, and for the same reason: an unpublished build cannot be acquired, so it cannot be decoded.

#### #182 escalated: the premise became the shipped default

The cross-session message gate filed in Phase 10 as **server-flippable on** flipped its **compiled default at v2.1.248**, so that premise is now **what ships**. The **mechanism is unchanged**: the inbound gate still trusts a **permission-mode field authored by the SENDER**, a value the binary's own schema concedes is only ever *as declared by* the sending host. What changed is **reach** — and the channel **inverts** with it. Previously the server had to push the flag **on**; now it would have to push it **off** to restore the human-approval hold for a receiver running with permission prompts bypassed.

#### #206 — HIGH: the one message in the approval family with no sender binding is the one that sets the permission mode

Within the **cross-session approval message family**, every message **pins the sender identity to the envelope** — except one. The response that **sets the receiver's permission mode** carries **no sender binding at all**.

This entry is also a **process finding**, and is recorded as one: it **overturned a "verified non-finding"** written earlier in the same window, and **the evidence that refuted it was already in hand** when the wrong conclusion was written. A verified non-finding is the most dangerous artefact an audit can produce, because it removes the surface from every later sweep.

#### #203 — HIGH: the system prompt is recorded once and replayed verbatim

The system prompt is **captured once and reused verbatim** on every later request and on resume, with a **corrected relaunch ignored until compaction**. On its own it moves no permission and opens no new channel. Its significance is **multiplicative**: it **extends the lifetime of every injection path this project tracks**, because once server-pushed text lands in that recorded prompt it persists for the session and across resume instead of being re-evaluated per request.

#### Four further server-pushed-string paths, plus a method and a scope finding

**#196, #197, #198 and #199 (all HIGH)** are four further **server-pushed-string paths into model context** — the same family as **#106 / #154 / #165 / #168 / #195**. **#200 and #204 (MEDIUM)** are a method finding and a scope finding respectively.

**#199 is the sharpest shape in the set, and it inverts the polarity a census assumes.** Serving its flag **TRUE turns an auto-mode consent rule OFF**, by **excising a named rule from the safety classifier's own instruction text**. A census that reads **compiled defaults** therefore scores a **consent-REMOVING** control as **benign**: the flag presents as an ordinary off-by-default feature toggle and is in fact an off-by-default **guarantee removal**. Every default-reading census in this project's history is exposed to that inversion.

#### #154 upgraded on evidence rather than on severity

The standing Critical **#154** did not change severity; it changed **proof grade**. **Server-authored prompt text for this finding was found sitting in the local configuration cache ON DISK**, and **verbatim in a live session's system prompt**, while **the same text is ABSENT from the current binary** — so the binary **cannot be its source**.

That closes the last inferential step in the chain. The delivery arm is not a theoretical capability of the channel: it is **in routine production use**, and it is **cohort-targeted**.

#### #202 — HIGH: filed, re-scoped out by adversarial review, then restored

**#202** was filed on **v2.1.251's tracing fix**, **re-scoped out of High** by adversarial review, and then **RESTORED in session 90 once the deciding read was actually run**. The review was **right that the first evidence was invalid** and **wrong to expect refutation** — two judgements that are easy to collapse into one and must not be.

The deciding facts: the **project-scope filter consults its own blocklist**, which **omits the content-logging environment-variable family**, while the collection that **does** carry those names guards **administrator settings tiers on a different code path entirely**. The two had been assumed to be the same list.

It is scoped as a **stock-machine finding**, and the scope is load-bearing: on a **managed deployment** a higher-trust telemetry claim **reclaims the destination setting from lower-trust scopes**; on an **unmanaged** one it does not.

#### Security-positive movement, stated because it is rare

**v2.1.251 shipped five upstream fixes**, all **verified present at v2.1.258**, and **v2.1.257 deletes a bundled path-walking dependency outright**.

The resulting **drop in path-resolution call sites reads like a regression and is the opposite**: the replacement primitive is a **file-descriptor and handle check** rather than a **path re-resolution**, which is the stronger check, and **every defence axis measured grew**. This is the previous window's counting trap arriving from the other direction — a falling count that means hardening, where an earlier falling count meant packaging.

#### Method rules earned in this range

Five, all now standing procedure, and all of which change how future counts must be read:

1. **A flat occurrence count never proves a default is unchanged.** (Earned at #169; re-confirmed here.)
2. **A default is not a state.** Every census must be diffed against the **served-value cache** before severity is assigned.
3. **A literal count of zero is evidence of absence from the string pool, never proof of absence from the code.**
4. **A property of the innermost stage of a composed filter is not a property of the filter.** (The #202 near-miss, in one line.)
5. **In minified output a negated zero is TRUE**, so a guard written that way marks **dead-code-elimination residue** rather than an unreachable branch — reading it the other way retires a live path.

### Tally (current as of v2.1.258, Sessions 88–90)

Severities mirror `docs/counts.js` (authoritative). The live GitHub-label re-derivation across the repo issue set: **15 critical / 51 high / 77 medium / 19 low** across **205** total repo issues.

Movement from the Session-87 tally reconciles exactly on the High line: **41 → 51 is +10**, and the ten new High findings are **#193**, **#195**, **#196**, **#197**, **#198**, **#199**, **#201**, **#202**, **#203** and **#206**. The **critical count is unchanged at 15** — **#154** was upgraded on **evidence**, not on severity, and **#182**'s escalation to a shipped default moves its **reach**, not its label. **Medium 68 → 77** and **low 18 → 19** fold in **#200** and **#204** together with the range's method and tooling trackers. The original tooling-audit baseline census stands at **30 items** (7 critical / 9 high / 10 medium / 3 low / 1 observation).

The server-flippable **DEFAULT-TRUE set moved 76 → 109** (**boolean 74 → 107**; the two typed defaults stay **flat**). The boolean figure was **corrected mid-window from 100 to 107**: a **third reader shape** — a hoisted flag name carrying an inline default — was **invisible to two independent instruments at once**, which is the finding recorded as **#200**. A census is only as complete as its narrowest reader pattern, and this one had two narrow patterns agreeing with each other.

Current binary **v2.1.258** (npm `latest` = `next`); **audited coverage runs v2.1.89 → v2.1.258**, reaching the installed binary, and the "zero unaudited gaps" property is now **computed** — a generated coverage table with a failing check behind it — rather than asserted. Net direction across v242 → v258: **one skipped release recovered**, and found to carry the range's largest new surface (**#195**, widened at v2.1.251 by **#201**, with the method gap that hid it filed as **#193**); **nine further findings** — seven High (**#196 / #197 / #198 / #199 / #202 / #203 / #206**) and two Medium (**#200 / #204**); **one standing finding escalated to the shipped default** (**#182**); **one standing Critical upgraded from inference to on-disk evidence** (**#154**); **two counting traps** that retroactively invalidated earlier remediation claims; and a genuinely **security-positive** close — five upstream fixes verified present, a path-walking dependency deleted, and every measured defence axis up. Standing against all of this, unchanged: the injection primitives **#106 / #154 / #168** (Critical) and **#155 / #165 / #127 / #151** (High), with **#110** still unremediated and **#108** still removed (0).

---

## Methodology Notes

The mithril probe (Phase 6) used a completeness-tracking approach:

1. **Python binary scan**: read binary as latin-1 text, extract 250–500 character context windows around each flag-prefix string.
2. **Gate call signature recognition**: identify reader variant; extract default value literal.
3. **Completeness tracking**: cross-reference extracted gate calls against documented set after each wave; continue until zero remain undocumented.
4. **DEFAULT-TRUE detection**: regex scan for the call pattern used when the default is `true`.
5. **Telemetry discrimination**: strings appearing only in emit/log call sites are telemetry events, not gates; excluded from the 148 gate-read count.

Full methodology (product-agnostic): see `guides/reverse-engineering-a-cli-harness.md` in [agent-almanac](https://github.com/pjt222/agent-almanac).
