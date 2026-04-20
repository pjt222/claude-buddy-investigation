# Claude Code Kairos Loop System — Technical Architecture

**Date**: 2026-04-12
**Version**: 1.0

> **Version scope:** The Kairos loop system's **dynamic-loop infrastructure landed in v2.1.101** (the smallest delta between v2.1.100 and v2.1.104 — 19 new feature flags, 3 new env vars, the `ScheduleWakeup` tool, and `/loop` slash command). Precursor Kairos markers (brief/cron/durable/dream) already existed in v2.1.98/v2.1.100 — these represent an earlier cron-only Kairos that was superseded when `ScheduleWakeup` was added. v2.1.104 is a rebuild of v2.1.101 with only one new loop-adjacent flag (image-resize failure telemetry) and one env var (agent-rule-disable kill switch) — the loop system is unchanged between 101 and 104. Descriptions below reflect v2.1.101 bundle analysis.

---

## 1. System Overview

The **Kairos loop system** is Claude Code's autonomous-continuation mechanism: a way for the model (or a scheduled trigger) to defer work to a future point and resume from the same task without user input. It covers three distinct execution modes:

1. **Dynamic loop** — the model self-paces iteration cadence by calling the `ScheduleWakeup` tool with a `delaySeconds` argument. Each tick runs the same prompt; the model chooses the next delay or omits the call to end the loop.
2. **Cron-based autonomous loop** — `CronCreate` with `kind: "loop"` schedules recurring ticks using a cron expression. The model uses the `<<autonomous-loop>>` sentinel to resolve prompt text at fire time.
3. **File-backed loop** — the user maintains a `loop.md` in `.claude/` or the project root; the contents are injected as the prompt at each tick. Addressed by `<<loop.md>>` (cron) or `<<loop.md-dynamic>>` (ScheduleWakeup).

**Key architectural property**: dynamic loops are implemented **on top of the cron system internally** — the loop-scheduler function calls `CronCreate` with `kind: "loop"` and a minute/hour cron expression computed from `delaySeconds`. There is no distinct "dynamic scheduler"; dynamism is achieved by the model issuing a fresh `ScheduleWakeup` call on each wake.

**Contrast with advisor and buddy**:
- Buddy (`buddy_react`) was a read-only ambient observer (removed in v2.1.97).
- Advisor (`advisor_20260301`, v2.1.96+) is a synchronous, in-turn delegation to a stronger reviewer model.
- Kairos loop is an **asynchronous self-continuation** mechanism — the turn ends, time passes, and a fresh turn begins with the same conversation context plus a scheduled prompt.

---

## 2. Data Flow Diagram

### 2.1 Dynamic Loop Lifecycle (`ScheduleWakeup`)

```
Model decides to continue later
     |
     v
Model emits tool_use: ScheduleWakeup({delaySeconds, prompt, reason})
     |
     v
loop-scheduler fn (delaySeconds, prompt, reason)
     |
     +--- validate prompt non-empty
     +--- lookup prior loop state by prompt hash
     +--- aged-out check: now - startedAt >= recurringMaxAgeMs (7d default)?
     |      YES -> persist {agedOut:true}; emit loop aged-out telemetry; return null
     +--- clamp delay to [MIN_LOOP_DELAY_SECONDS=60, MAX_LOOP_DELAY_SECONDS=3600]
     +--- derive target = now + clamped*1000; build cron "M H * * *" from target minutes/hours
     |    (NOTE: cron granularity is whole-minute; target rounds UP to the next
     |     minute boundary. Empirically: delaySeconds=90 @ 08:14:40 UTC scheduled
     |     for 08:17:00 UTC = 140 s actual delay.)
     +--- CronCreate({id, cron, prompt, createdAt, kind:"loop"})   [loop cron wrapper]
     +--- persist {startedAt, lastScheduledFor} by prompt key
     +--- emit loop dynamic-wakeup scheduled telemetry {
     |        chosen_delay_seconds, clamped_delay_seconds,
     |        was_clamped, reason (truncated to 200 chars)
     |    }
     v
Tool returns {scheduledFor, clampedDelaySeconds, wasClamped}
     |
     v
Turn ends; Claude Code exits conversation loop
     |
     v
[time passes]
     |
     v
Cron fires at target --- new conversation turn begins
     |
     v
loop default resolver (prompt) resolves sentinels if present
     |
     v
Model receives resolved prompt, continues task, may call ScheduleWakeup again
```

### 2.2 Prompt Resolution at Fire Time

```
resolveLoopDefaultFire(q):
  return <autonomous-sentinel-resolver>(q) ?? <file-sentinel-resolver>(q) ?? q

  <autonomous-sentinel-resolver>:
       if q is <<autonomous-loop>> or <<autonomous-loop-dynamic>> AND
       isLoopDefaultPromptEnabled(), inject default autonomous-loop preamble
  <file-sentinel-resolver>:
       if q is <<loop.md>> or <<loop.md-dynamic>> AND
       isLoopDefaultPromptEnabled(), read loop.md (see § 5) and inject
  else: pass through unchanged
```

### 2.3 Feature Gate Logic

```
isLoopDynamicEnabled():         <loop-scheduler-dynamic-mode-gate> (default=false)
isLoopDefaultPromptEnabled():   <loop-sentinel-resolution-gate>    (default=false)
isLoopsCommandEnabled():        <loop-slash-command-gate>          (default=false)
```

All three default off; the dynamic loop and the `/loop` slash command require server-side gate enablement.

---

## 3. Function Reference

Minified-name to source-name mappings are intentionally omitted here. See the private companion document for the mapping table; this public form describes functional roles only.

| Source name | Role |
|---|---|
| `SCHEDULE_WAKEUP_TOOL_NAME` | Tool name constant (`"ScheduleWakeup"`) |
| `AUTONOMOUS_LOOP_SENTINEL` | Cron-based autonomous sentinel (`"<<autonomous-loop>>"`) |
| `AUTONOMOUS_LOOP_DYNAMIC_SENTINEL` | Dynamic autonomous sentinel (`"<<autonomous-loop-dynamic>>"`) |
| *(file sentinel)* | loop.md cron sentinel (`"<<loop.md>>"`) |
| *(file sentinel dynamic)* | loop.md dynamic sentinel (`"<<loop.md-dynamic>>"`) |
| `MIN_LOOP_DELAY_SECONDS` | Lower delay clamp (value: `60`) |
| `MAX_LOOP_DELAY_SECONDS` | Upper delay clamp (value: `3600`, 1 hour) |
| `LOOP_FILE_TRUNCATION` | loop.md byte cap (value: `25000`) |
| `scheduleLoopWakeup` | Tool handler; builds cron, persists state, emits telemetry |
| `resolveLoopDefaultFire` | Prompt sentinel resolver (entry point) |
| `resolveLoopFileFire` | Reads `loop.md` and builds tick prompt |
| `isLoopDynamicEnabled` | Feature-gate check for the dynamic-mode gate |
| `isLoopDefaultPromptEnabled` | Feature-gate check for the sentinel-resolution gate |
| *(config loader)* | Loop-config loader (reads the Kairos cron-config feature flag) |

---

## 4. Tool Surface

### 4.1 `ScheduleWakeup` Tool Schema (from v2.1.101 bundle)

Short description (paraphrased):
> Schedule when to resume work in /loop dynamic mode (always pass the `prompt` arg). Call before ending the turn to keep the loop alive; omit the call to end it.

Full prompt (paraphrased summary — verbatim text withheld): the text shown to the executor model at tool-list time covers cache TTL guidance (60–270 s stays warm, 300 s–3600 s pays cache miss, avoid 300 s specifically), default 1200–1800 s for idle ticks, and the rationale for the `reason` field.

Parameters:

| Field | Type | Required | Clamp / Constraint |
|---|---|---|---|
| `delaySeconds` | number | yes | runtime clamps to `[60, 3600]` — model does not clamp itself |
| `prompt` | string | yes | becomes the tick prompt; pass same value across turns to repeat; pass the dynamic sentinel `<<autonomous-loop-dynamic>>` for autonomous mode |
| `reason` | string | yes | one-sentence rationale; truncated to 200 chars for telemetry, shown to user in UI |

### 4.2 `/loop` Slash Command

Two invocation modes:
1. **With interval**: `/loop 5m /foo` — user specifies cadence, Claude Code creates a cron entry directly without model involvement.
2. **Without interval**: `/loop <prompt>` — model self-paces via `ScheduleWakeup`. The description text at the top of the `ScheduleWakeup` prompt explicitly frames this mode: *"the user invoked /loop without an interval, asking you to self-pace iterations of a specific task."*

The `/loop` command itself is gated by the loop slash-command gate.

---

## 5. Loop File Format (`loop.md`)

Search path (first match wins):
1. `<cwd>/.claude/loop.md`
2. `<cwd>/loop.md`

File is **truncated to 25000 bytes** at read time with a warning appended:
> WARNING: loop.md was truncated to 25000 bytes. Keep the task list concise.

When addressed via `<<loop.md>>` or `<<loop.md-dynamic>>`, the file-sentinel resolver injects a wrapper:

```
# /loop tick — tasks from <path>

The user configured a loop-tasks file. Work through the tasks defined below;
these are the instructions for this tick and every subsequent tick (the
reminder on later fires refers back to this message).

---

<file content>

---

<autonomous-tick-preamble>
```

A cache key suppresses re-injecting an identical file content — if the file hasn't changed since the last fire, only the preamble is sent.

---

## 6. Default Loop Configuration

From the v2.1.101 bundle — the defaults consumed by the config loader:

```js
// default loop config
{
  recurringFrac:     0.5,          // fraction of cron interval (unused by dynamic loop)
  recurringCapMs:    1_800_000,    // 30 min cap on recurring delays
  oneShotMaxMs:      90_000,       // 90 s one-shot ceiling
  oneShotFloorMs:    0,            // no floor
  oneShotMinuteMod:  30,           // minute alignment for one-shot scheduling
  recurringMaxAgeMs: 604_800_000,  // 7 days — loop auto-ages-out after this
  cacheLeadMs:       15_000,       // 15 s prompt-cache lead time
}
```

User/server override is possible via a Kairos cron-config feature flag, with a 30-day upper bound on `recurringMaxAgeMs` (`2_592_000_000` ms).

**Aged-out behaviour**: when `now − startedAt >= recurringMaxAgeMs`, the loop scheduler returns `null` and emits a loop aged-out telemetry event. The state record is marked `agedOut: true` with `lastScheduledFor` set in the past so subsequent calls are ignored unless the user resets the loop.

---

## 7. Telemetry

Two dynamic-loop telemetry events fire (names withheld):

### 7.1 Dynamic-wakeup scheduled event

Fired every successful loop-scheduler call.

```json
{
  "chosen_delay_seconds":  1200,
  "clamped_delay_seconds": 1200,
  "was_clamped":           false,
  "reason":                "checking long bun build"
}
```

- `chosen_delay_seconds`: raw model input (pre-clamp). `0` if the model passed a non-finite value.
- `clamped_delay_seconds`: post-clamp actual schedule.
- `was_clamped`: `true` if the model's chosen value was outside `[60, 3600]`.
- `reason`: truncated to 200 chars.

### 7.2 Dynamic-wakeup aged-out event

Fired once per loop when the 7-day age ceiling is crossed.

```json
{
  "loop_age_ms": 605_000_000,
  "max_age_ms":  604_800_000
}
```

No subsequent scheduling call is issued for this prompt key; the loop terminates silently from the runtime side.

### 7.3 Related telemetry

- Loop slash-command event — fired on `/loop` slash command invocation (the slash-command gate name doubles as the event name based on naming convention).
- Earlier Kairos telemetry family (brief/cron/dream) — continues to fire for cron-only loops.

---

## 8. Kill Switches

| Switch | Type | Effect |
|---|---|---|
| Cron-disable env var | env var | Disables all cron scheduling including dynamic loops (since dynamic loops use CronCreate under the hood) |
| Loop scheduler dynamic-mode gate | server flag | Must be `true` for `ScheduleWakeup` tool to appear in the tool list |
| Loop slash-command gate | server flag | Must be `true` for `/loop` slash command to be available |
| Loop sentinel-resolution gate | server flag | Must be `true` for sentinel resolution (`<<autonomous-loop-dynamic>>`, `<<loop.md-dynamic>>`) at fire time |

Disabling the sentinel-resolution gate while the other two are on produces an interesting failure mode: the user can schedule loops but the autonomous-tick preamble is not injected, so the model sees the raw sentinel string as the prompt and likely no-ops.

---

## 9. Buddy ↔ Advisor ↔ Loop Comparison

| Property | Buddy (buddy_react) | Advisor (advisor_20260301) | Loop (Kairos) |
|---|---|---|---|
| **Direction** | Observer only (read-only) | Bidirectional gate | Self-continuation (outbound) |
| **Latency** | < 1 s reaction budget | Several seconds (stronger model) | 60 s – 1 h (scheduled) |
| **Scope of context** | Truncated recent transcript | Full conversation + all tool calls | Same as parent conversation at resume |
| **Invocation** | Server-side event hook | Executor model tool call | Executor model tool call *or* user `/loop` |
| **Model used** | Fixed small model | Opus 4.6 or Sonnet 4.6 | Same executor model |
| **Persistence** | Transient reactions | In-turn result | Durable: survives process exit, cron-backed |
| **User control** | Mute per-buddy | `/advisor off`, env kill switch | `/loop` end, state-file edit, cron-disable env var |
| **Feature gate** | (always on when installed, pre-v2.1.97) | Advisor feature gate | Loop dynamic-mode gate + loop slash-command gate |
| **Landing version** | v2.1.89 (removed v2.1.97) | v2.1.96 (refined v2.1.98) | v2.1.101 |
| **Telemetry events** | None client-visible | Advisor telemetry family (5 events) | Loop dynamic-wakeup telemetry (2 events) + slash-command event |

---

## 10. Version Timeline

| Version | Built | Loop-system state |
|---|---|---|
| v2.1.98 | 2026-04-10 | Precursor: earlier Kairos brief/cron/cron-config/durable/dream flags present, no `ScheduleWakeup`, no sentinels |
| v2.1.100 | 2026-04-10 | Identical to v2.1.98 (content rebuild only) |
| v2.1.101 | 2026-04-11 | **Dynamic loop system added**: `ScheduleWakeup` tool, 4 sentinels, 6 new loop-related feature flags, scheduleLoopWakeup / resolveLoopDefaultFire / resolveLoopFileFire / isLoopDynamicEnabled / isLoopDefaultPromptEnabled functions, MIN/MAX delay constants, `<<loop.md>>` file resolution. Also in this version: OAuth SDK refresh callback flow, MCP directory/BFF, SDK observability telemetry. |
| v2.1.102 | — | Never published to npm |
| v2.1.103 | — | Never published to npm |
| v2.1.104 | 2026-04-12 | Loop system unchanged from v2.1.101. Net additions: an image-resize failure telemetry flag and an agent-rule-disable env var; ~1 MB binary growth attributable to runtime/Bun updates rather than feature code. |

---

## 11. Open Questions

1. **Empirical `/loop` behaviour** — we have not exercised the slash command against a live v2.1.104 with the gates enabled. Landing the gates server-side is the gating event for empirical capture.
2. **`recurringFrac`, `oneShotMinuteMod`, `oneShotFloorMs`** — these default-config fields are defined but we have not traced all call sites that read them. They may govern cron-mode behaviour that is orthogonal to the dynamic loop.
3. **Interaction with advisor** — if the advisor tool is called from within a dynamic-loop tick, does the advisor's context include the prior tick or only the current one? Advisor cost-accounting functions (see advisor-architecture.md § 3) do not mention loop-aware fields.
4. **Agent-rule-disable env var** (new in v2.1.104) — name suggests a rule-enforcement kill switch affecting agent behaviour; not obviously loop-related but worth tracing.
5. **Sentinel collisions** — if a user's `prompt` argument accidentally contains one of the four sentinel strings, the runtime will attempt to resolve it. Defensive replacement is not visible in the resolver code.
