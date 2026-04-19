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

## Methodology Notes

The mithril probe (Phase 6) used a completeness-tracking approach:

1. **Python binary scan**: read binary as latin-1 text, extract 250–500 character context windows around each flag-prefix string.
2. **Gate call signature recognition**: identify reader variant; extract default value literal.
3. **Completeness tracking**: cross-reference extracted gate calls against documented set after each wave; continue until zero remain undocumented.
4. **DEFAULT-TRUE detection**: regex scan for the call pattern used when the default is `true`.
5. **Telemetry discrimination**: strings appearing only in emit/log call sites are telemetry events, not gates; excluded from the 148 gate-read count.

Full methodology (product-agnostic): see `guides/reverse-engineering-a-cli-harness.md` in [agent-almanac](https://github.com/pjt222/agent-almanac).
