# Claude Code Advisor System — Technical Architecture

**Date**: 2026-04-10
**Version**: 1.0

> **Version scope:** The advisor tool infrastructure was already **code-complete in v2.1.96** (built 2026-04-03) — coexisting with the full buddy companion system. Both systems scored 75+/75+ in that build. The buddy UI was then removed in v2.1.97 (built 2026-04-08) while the advisor remained. The system prompt was refined in v2.1.98 (built 2026-04-10) and the advisor feature gate was bumped to a new iteration. The advisor is dark-launched behind a server-side feature flag and is not yet visible to all users. Descriptions below reflect v2.1.98/v2.1.100 analysis; advisor markers are unchanged through v2.1.104.
>
> **See also:** `loop-architecture.md` for the Kairos loop system (`ScheduleWakeup` / `/loop`) that landed in v2.1.101 alongside but architecturally independent from the advisor.

---

## 1. System Overview

The Advisor system is a first-party "second opinion" feature in Claude Code v2.1.97+ that allows the executor model (Sonnet or Opus) to consult a stronger reviewer model at decision points during a task. Unlike the buddy companion system — which was a read-only observer with no influence on the conversation — the advisor is a **bidirectional decision gate** with full conversation context access and the ability to redirect the executor's approach.

The advisor operates as a **server-side tool** within the Messages API. When the executor model calls `advisor()`, the entire conversation history (including all tool calls and results) is forwarded to the advisor model, which returns guidance. The executor then resumes with that guidance incorporated.

**Key architectural difference from buddy**: The buddy system was a separate API endpoint (`buddy_react`) called client-side with a truncated transcript. The advisor is a tool type (`advisor_20260301`) within the standard Messages API — no separate endpoint, no client-side API call.

---

## 2. Data Flow Diagram

### 2.1 Advisor Tool Lifecycle

```
User Query
     |
     v
Query Source Gate ---- repl_main_thread* / agent:* / sdk / hook_agent / verification_agent
     |
     v
Advisor Feature Gate ---- kill-switch env var not set
     |                     + firstParty provider + logged in
     |                     + advisor feature gate enabled server-side
     v
Model Validator ---- validates both advisor and base are opus-4-6 or sonnet-4-6
     |
     v
Tool Schema Push ---- S.push({type: "advisor_20260301", name: "advisor", model: D})
     |
     v
Messages API Call ---- tools array includes advisor schema
     |                  + beta header: "advisor-tool-2026-03-01"
     |                  + advisor system prompt appended
     v
Streaming Response
     |
     +--- server-side tool-use response (name="advisor") ---- in-flight flag set, emit advisor tool-call telemetry
     |
     +--- advisor_tool_result ---- in-flight flag cleared
     |    |
     |    +--- advisor_result ---- verbose: full text / non-verbose: checkmark
     |    +--- advisor_redacted_result ---- always checkmark message
     |    +--- advisor_tool_result_error ---- "Advisor unavailable ({error_code})"
     |
     +--- advisor_message ---- iteration-level tracking in response
     |
     v
Cost Tracking
     |
     +--- advisor iteration extractor ---- pull advisor_message items from iterations
     +--- advisor cost calculator ---- compute per-advisor costs
     +--- token counter ---- accumulate tokens by {model, type}
     +--- advisor token-usage telemetry ---- emitted per response
```

### 2.2 Feature Gate Logic

```
advisorGate() {
  if <advisor-disable-env-var> is set ---- return false (kill switch)
  if provider !== "firstParty" ---- return false (no Bedrock/Vertex)
  if !loggedIn() ---- return false (OAuth required)
  return <advisor-feature-gate>.enabled ?? false
}
```

---

## 3. Function Reference

| Role | Notes |
|------|-------|
| Master feature gate | Checks env kill switch, firstParty auth, advisor feature gate |
| Base model validator | Returns true if model string contains `opus-4-6` or `sonnet-4-6` |
| Advisor model validator | Same check as the base validator — only Opus 4.6 and Sonnet 4.6 accepted |
| Combined validator | Validates both models, returns resolved model string or `undefined` |
| Settings reader | Reads persisted `advisorModel` from user settings schema |
| Iteration extractor | Filters response iterations for `advisor_message` type |
| Type guard | Identifies `advisor_tool_result` or the server-side tool-use response with name "advisor" |
| Cost calculator | Processes advisor costs, emits token usage telemetry |
| Token counter | Accumulates tokens by model and type (input/output/cacheRead/cacheCreation) |
| `/advisor` command handler | Sets/clears advisorModel in state and persists to settings |
| Advisor dialog UI | React component for model selection dialog |
| Model matcher | Fuzzy matches user input to valid advisor model from the shorthand array |

### Constants

| Constant | Value | Notes |
|----------|-------|-------|
| Valid model shorthand array | `["opus", "sonnet"]` | Valid advisor model shorthand names |
| Beta header constant | `"advisor-tool-2026-03-01"` | Beta header pushed to API requests |
| Advisor prompt variable | (system prompt) | Full advisor coaching prompt, see Section 4 |

---

## 4. System Prompt (Paraphrased, v2.1.98)

The following is a **paraphrased summary** of the prompt that is appended to system messages when advisor is enabled. The verbatim text is not reproduced here.

The prompt introduces the `advisor` tool, explaining that it forwards the full conversation history automatically (no parameters needed) so the reviewer sees the entire task, every tool invocation, and every result. It instructs the executor to call the advisor **before substantive work** — before writing, before committing to an interpretation, before building on an assumption — while noting that pure orientation work (locating files, fetching sources) does not require a call.

It lists additional call triggers:
- When the executor believes the task is complete, **after** making the deliverable durable (writing the file, saving the result, committing the change), so that a long advisor round-trip cannot cost unsaved work.
- When stuck with recurring errors, a non-converging approach, or results that don't fit.
- When considering a change of approach.

It sets cadence expectations: at least one pre-approach and one pre-completion call on multi-step tasks, and acknowledges that short reactive tasks don't benefit from repeated calls.

It instructs the executor to weight advisor guidance seriously, but to adapt when empirical evidence or primary sources contradict a specific claim. It warns that a passing self-test is not disconfirming evidence if the test doesn't check what the advice checks.

Finally, it handles the conflict case: if retrieved data points one way and the advisor points another, the executor should not silently switch but should surface the conflict in one more advisor call.

### Prompt Evolution (v2.1.97 → v2.1.98)

| Location | v2.1.97 | v2.1.98 | Interpretation |
|----------|---------|---------|----------------|
| Paragraph 1 | "when you call it" | "when you call advisor()" | Explicit function call syntax |
| Paragraph 1 | references "the advisor" | uses pronoun "they" | Humanizing pronoun |
| Paragraph 2 | "before writing code" | "before writing" | Broadened beyond code |
| Paragraph 2 | "reading code" | "fetching a source" | Broadened beyond code |
| Bullet 1 | "stage the change" | "commit the change" | Stronger durability instruction |
| Paragraph 6 | "the code does Y" | "the paper states Y" | Broadened to research tasks |

The direction is clear: **the advisor is being positioned for non-coding tasks** (research, writing, analysis), not just software engineering.

---

## 5. API Protocol

### Tool Schema

The advisor tool is registered in the Messages API `tools` array:

```json
{
  "type": "advisor_20260301",
  "name": "advisor",
  "model": "<resolved-model-id>"
}
```

The tool takes **no parameters**. When the executor model calls `advisor()`, the entire conversation context is forwarded server-side.

### Beta Header

When advisor is enabled, the beta header `advisor-tool-2026-03-01` is pushed to the API request's betas array.

### Response Content Block Types

| Type | Purpose | UI Rendering |
|------|---------|-------------|
| Server-side tool-use response (name: "advisor") | Executor calling the advisor | Sets in-flight flag |
| `advisor_tool_result` | Successful advisor response | Container for result/redacted |
| `advisor_result` | Advisor text content | Verbose: full text / Non-verbose: checkmark |
| `advisor_redacted_result` | Privacy-safe display | Always: "Advisor has reviewed the conversation and will apply the feedback" |
| `advisor_tool_result_error` | Advisor call failure | "Advisor unavailable ({error_code})" |
| `advisor_message` | Iteration-level cost tracking | Not rendered — used for token accounting |

### Error Messages

```
"${model} cannot be used as an advisor. Valid options: opus, sonnet, off"
"${model} is not a valid advisor model"
"${model} does not support the advisor tool."
"Note: the current main model (${model}) does not support the advisor.
 It will activate when you switch to a supported main model."
```

---

## 6. User Interface

### CLI Flag

```
--advisor <model>    Enable the server-side advisor tool with the specified model
                     (alias or full ID)
```

Hidden behind the advisor feature gate — not visible in `--help` until the gate is enabled.

### Slash Command

```
/advisor [opus|sonnet|off]    Configure the Advisor Tool to consult a stronger
                              model for guidance at key moments during a task
```

Registered as a local-jsx command. `isEnabled` and `isHidden` both defer to the advisor feature gate.

### Dialog UI

When `/advisor` is invoked without arguments, a dialog renders with:

1. **Title**: "Advisor Tool"
2. **Description**: "When Claude needs stronger judgment — a complex decision, an ambiguous failure, a problem it's circling without progress — it escalates to the advisor model for guidance, then resumes. The advisor runs server-side and uses additional tokens."
3. **Marketing**: "For certain workloads, pairing Sonnet as the main model with Opus as the advisor gives you near-Opus performance with reduced token usage."
4. **Warning** (conditional): "The current main model ({model}) does not support the advisor."
5. **Options**: Dynamic list from the shorthand array + "No advisor" (off)
6. **Learn more**: Empty string placeholder

Emits an advisor dialog-shown telemetry event on mount.

### Settings Persistence

The selected advisor model is persisted as `advisorModel` in the user settings schema:

```javascript
advisorModel: E.string().optional().describe("Advisor model for the server-side advisor tool.")
```

Read via the settings-reader function.

---

## 7. Telemetry

Five advisor telemetry events fire at distinct points in the lifecycle:

| Event purpose | Trigger | Payload |
|---------------|---------|---------|
| Command invocation | User invokes `/advisor` | Command context |
| Dialog shown | Advisor config dialog renders | Mount event |
| Tool call | Executor calls advisor() | Tool call context |
| Tool interrupted | User aborts during advisor execution | Interruption context |
| Token usage | Advisor response processed | See below |

### Token Usage Payload

```javascript
{
  advisor_model: string,                   // e.g. "claude-opus-4-6"
  input_tokens: number,
  output_tokens: number,
  cache_read_input_tokens: number,         // ?? 0
  cache_creation_input_tokens: number,     // ?? 0
  <per-call-cost-field>: number            // Math.round(cost * 1e6)
}
```

Token accounting is recursive — nested advisor iterations are individually reported.

---

## 8. Kill Switches

| Mechanism | Scope | Effect |
|-----------|-------|--------|
| Advisor-disable environment variable | Client | First check in the advisor gate — disables entire feature |
| Advisor feature gate (server-side) | Server | Server-side rollout gate — advisor gate returns false if disabled |
| `/advisor off` | Session | Clears `advisorModel` in state and settings |

---

## 9. Buddy ↔ Advisor Comparison

| Dimension | Buddy (v2.1.89–v2.1.96) | Advisor (v2.1.97+) |
|-----------|-------------------------|---------------------|
| Architecture | Client-side observer + separate API | Server-side tool in Messages API |
| Direction | Unidirectional (read-only) | Bidirectional (decision gate) |
| Context | Last 12 msgs, 300 chars each | Full conversation history |
| Model | Haiku-class (server-chosen) | Opus or Sonnet (user-specified) |
| Trigger | Automatic (turn, error, test-fail, etc.) | Model-initiated (tool call) |
| UI | ASCII sprite + speech bubble | Inline text or checkmark |
| Cost | Hidden from user | Explicit per-call cost field |
| Identity | Deterministic hash-derived (species, stats, traits) | None (stateless tool) |
| Kill switch | Non-essential-traffic disable env var | Advisor-disable env var |
| Feature gate | Date gate + firstParty + plan tier | firstParty + advisor feature gate |
| Telemetry | Buddy telemetry family (removed) | Advisor telemetry family (5 events) |
| Config key | `companion`, companion mute config key | `advisorModel` |
| Binary API type | Custom endpoint (`buddy_react`) | Messages API tool (`advisor_20260301`) |
| Persistence | name, personality, hatchedAt | advisorModel only |
| Beta header | `oauth-2025-04-20` | `advisor-tool-2026-03-01` |

**No code path connects the two systems.** They share only the substrate of OAuth authentication, firstParty distribution gating, and org-scoped access. The `companion_intro` attachment type survives as a dead filter entry in v2.1.97+.

---

## 10. Version Timeline

```
v2.1.89 (2026-04-01)   Buddy system launched (April Fools positioning)
v2.1.92 (2026-04-02)   Full companion system (analyzed version)
v2.1.96 (2026-04-03)   Last version with complete buddy code
                        Advisor infrastructure ALREADY CODE-COMPLETE:
                          - Companion: FULL (81/100)
                          - Advisor: FULL (75/75)
                          - Both systems coexist in same binary
v2.1.97 (2026-04-08)   Buddy UI surgically removed from binary
                        Advisor infrastructure unchanged:
                          - advisor_20260301 tool type
                          - 5 telemetry events
                          - 5 response types
                          - /advisor slash command
                          - --advisor CLI flag
                          - advisor feature gate (v1)
                        companion_intro survives as ghost attachment type
                        buddy_react API alive server-side
v2.1.98 (2026-04-10)   Advisor prompt refined (code-specific → domain-agnostic)
                        Advisor feature gate bumped to v2
                        Blog post published: claude.com/blog/the-advisor-strategy
                        Google Vertex AI integration added (10 telemetry events)
                        ALL buddy API strings removed (buddy_react, hash salt,
                          companion mute key, hatchedAt = 0 hits)
                        companion_intro ghost survives
v2.1.99                NEVER PUBLISHED — npm registry skips from 2.1.98 to 2.1.100
                        Likely internal-only build or intentionally skipped version
v2.1.100 (2026-04-10)  Advisor code identical to v2.1.98
                        Minor binary size change (-4KB)
```

---

## 11. Blog Post Connection

The [blog post](https://claude.com/blog/the-advisor-strategy) describes the advisor as a new Messages API feature:

- Tool type: `advisor_20260301` with `model` and `max_uses` parameters
- Executor model drives the task; advisor provides guidance without tools or user-facing output
- Cost: advisor tokens bill at advisor model rates
- Performance: Sonnet + Opus advisor = +2.7pp on SWE-bench, -11.9% cost

The blog makes **zero mention** of the buddy/companion/Shingle system. The advisor is presented as entirely new. Binary evidence confirms: no code path connects the two features. However, the timeline is even more revealing than initially understood — **advisor infrastructure was already code-complete in v2.1.96**, the same build that had the full buddy system. Both coexisted. The buddy wasn't removed to make room for the advisor; the advisor was developed in parallel and dark-launched behind a feature flag while the buddy was a visible, active feature.

---

*Investigation conducted 2026-04-10. Binary analysis on v2.1.96, v2.1.97, v2.1.98, and v2.1.100. System prompt paraphrased from v2.1.98 (verbatim text withheld). Advisor confirmed code-complete in v2.1.96 (coexisting with full buddy system — both scored FULL). Feature-gate status: advisor gate not yet rolled out to this account. buddy_react API confirmed alive (200 OK, 1331ms latency). Companion config intact in `~/.claude/.claude.json`.*
