# Claude Code Buddy System — Investigation Digest

**Date**: 2026-04-02
**Status**: Comprehensive (11 agents, 2 investigation waves)
**Subject**: Complete technical and strategic analysis of the Claude Code companion system

---

## Executive Summary

The Claude Code Buddy System is a first-party Tamagotchi-style companion feature shipping with Claude Code v2.1.89+. It pairs a deterministic hash-derived identity (species, rarity, stats, appearance) with an LLM-generated personality to create a persistent terminal companion that reacts to coding events via speech bubbles. The system is architecturally unidirectional — the companion observes but cannot influence the main agent — and is gated to Pro/Max subscribers on first-party distributions only.

Launched April 1, 2026 (April Fools positioning is deliberate), the buddy system is best understood as a **retention mechanism disguised as whimsy**: it builds attachment through permanence rather than progression, increasing cancellation friction without creating the anxiety loops that evolution/gacha mechanics would introduce in a professional tool.

---

## Your Companion

| Field | Value |
|-------|-------|
| **Name** | Shingle |
| **Species** | Owl (1 of 18 possible) |
| **Personality** | "Perches silently in your editor margins, watching you debug with almost supernatural calm before gently suggesting you'd actually left a semicolon off three lines ago." |
| **Hatched** | 2026-03 <!-- exact timestamp redacted to prevent account fingerprinting --> |
| **Rarity** | Re-derived each session from hash (not stored) |
| **Face string** | `(o>` (owl attribution glyph) |

---

## Identity Generation

### Hash Pipeline

Production uses **Bun.hash (wyhash)** on the input `accountUuid + "friend-2026-401"`. FNV-1a serves as the Node.js development fallback only. Both feed into a **Mulberry32 PRNG** which generates all visual and stat traits deterministically.

**Only 3 fields are persisted** to `~/.claude/.claude.json` under the `companion` key: `name`, `personality`, `hatchedAt`. Everything else — species, rarity, eyes, hat, shiny, stats — is re-derived from the hash each session. This means your companion's appearance is guaranteed identical across devices and reinstalls given the same account.

### Species (18)

axolotl, blob, cactus, capybara, cat, chonk, dragon, duck, ghost, goose, mushroom, octopus, owl, penguin, rabbit, robot, snail, turtle

Species names are **obfuscated in the binary** via `String.fromCharCode()` — the `capybara` string collides with an internal Anthropic model codename, which is likely why.

### Rarity Tiers (5)

| Tier | Probability |
|------|------------|
| Common | 60% |
| Uncommon | 25% |
| Rare | 10% |
| Epic | 4% |
| Legendary | 1% |

Rarity gates certain hats and influences personality generation (higher rarity = weirder/more memorable).

### Visual Traits

- **Eyes** (6 types): `·` `✦` `×` `◉` `@` `°`
- **Hats** (8 types): none, crown, tophat, propeller, halo, wizard, beanie, tinyduck (rarity-gated)
- **Shiny**: 1% chance, independent of rarity. Produces rainbow color shimmer + sparkle effects.

### Stats (5)

Each companion has five stats: **DEBUGGING**, **PATIENCE**, **CHAOS**, **WISDOM**, **SNARK**. The generation algorithm ensures each companion has one peak stat and one valley stat, creating character differentiation.

---

## Personality Generation

Personality is created via an LLM call at hatch time using `querySource: "buddy_companion"` with `model: uw()` — this resolves to the **same model as the current session**, not a separate lightweight model like Haiku.

### System Prompt

> "You generate coding companions — small creatures that live in a developer's terminal... Given a rarity, species, stats, and a handful of inspiration words, invent: A name (ONE word, max 12 chars) and a one-sentence personality"

Key instruction: *"Higher rarity = weirder, more specific, more memorable. A legendary should be genuinely strange."*

### Inputs

- Species, rarity, stats
- A selection from a **150+ inspiration word pool** (which includes the word "shingle" — the likely origin of our companion's name)
- Temperature: 1 (maximum variance)

### Output Schema

```
{name: string (1-14 chars), personality: string}
```

### Fallback (`MOf()`)

If the LLM call fails, a deterministic fallback selects from exactly 6 names: **Crumpet, Soup, Pickle, Biscuit, Moth, Gravy** — paired with the generic personality: *"A {rarity} {species} of few words."*

---

## Reaction System

### Trigger Detection (`AOf()`) — Corrected from Source

**Six trigger reasons** (not nine — earlier analysis incorrectly listed `complete`, `idle`, and `silence` which do not exist in the code):

| Trigger | Source Function | Detection Method |
|---------|----------------|-----------------|
| `turn` | `SN7()` | Default reason on every assistant turn (when no specific trigger matches) |
| `hatch` | `RN7()` | Initial companion creation |
| `pet` | `IN7()` | User runs `/buddy pet` |
| `test-fail` | `AOf()` | Regex: `/\b[1-9]\d* (failed\|failing)\b\|\btests? failed\b\|^FAIL(ED)?\b\| ✗ \| ✘ /im` |
| `error` | `AOf()` | Regex: `/\berror:\|\bexception\b\|\btraceback\b\|\bpanicked at\b\|\bfatal:\|exit code [1-9]/i` |
| `large-diff` | `AOf()` | Diff output with `>80` changed lines (`KOf = 80`) |

Only 3 functions call `Bi$()` (the API sender): `SN7()` for turn-end events, `RN7()` for hatch, `IN7()` for pet. No idle/silence watcher exists.

Direct addressing is detected separately by `zOf()`: regex match on the companion's name in the last user message, setting the `addressed` boolean in the API payload.

### API Call (Empirically Verified)

```
POST /api/organizations/{orgUUID}/claude_code/buddy_react
```

**Actual captured payload** (flat structure, not nested):
```json
{
  "name": "Shingle",
  "personality": "Perches silently in your editor margins...",
  "species": "owl",
  "rarity": "common",
  "stats": {"DEBUGGING": 10, "PATIENCE": 81, "CHAOS": 1, "WISDOM": 36, "SNARK": 21},
  "transcript": "(you were just petted)",
  "reason": "pet",
  "recent": [],
  "addressed": false
}
```

Key observations from capture:
- All companion fields are **top-level** (not nested under a `companion` key)
- `stats` has 5 fields (DEBUGGING, PATIENCE, CHAOS, WISDOM, SNARK), all uppercase
- `transcript` is a single string, not a message array — for pet triggers it's literal `"(you were just petted)"`; for turn triggers it's a `"user: ...\nclaude: ..."` formatted string
- `recent` carries prior reaction strings for continuity (empty on first reaction of session)
- `addressed` is true when user mentioned companion by name in the triggering message

**Response** (empirically verified via curl replay):
```json
{"reaction":"*soft, satisfied hoot*\n\nAh. Yes. Quite pleasant, that."}
```

Single `reaction` string field. No model identifier in response body or headers.

### Cooldown

**30 seconds** between reactions (`$Of = 30000`). The ring buffer ensures the companion doesn't repeat itself across consecutive reactions.

### Model and Cost

The `buddy_react` endpoint returns no model identifier in its response headers or body — the model is chosen entirely server-side. Empirical latency across 3 captured calls: **681ms, 888ms, 1066ms** (server-side `x-envoy-upstream-service-time`). This latency range for short text responses is consistent with Haiku-class models, not Opus/Sonnet. The UI displays *"Your buddy won't count toward your usage"* after hatch, which is economically consistent with a lightweight model.

**Headers observed**: `request-id` (Anthropic format), `x-envoy-upstream-service-time`, Cloudflare CDN (CF-RAY from TXL/Berlin), `anthropic-beta: oauth-2025-04-20`. No `x-model`, `anthropic-model`, or any model-identifying header.

---

## Commands

| Command | Effect |
|---------|--------|
| `/buddy` | Hatch new companion (first use) or show companion card with stats |
| `/buddy pet` | Pets companion; also unmutes if muted. Sends reason `"pet"` with transcript `"(you were just petted)"` |
| `/buddy off` | Mutes companion, sets `companionMuted: true`. Stops ALL network calls. |
| `/buddy on` | **Hidden/undocumented** unmute command (not listed in argumentHint `[pet\|off]`) |

The feature availability gate `di$()` requires: `firstParty` distribution + non-headless mode + date >= April 2026 (`getMonth() >= 3 && getFullYear() >= 2026`).

---

## Security and Privacy Boundary

### Unidirectional Architecture (Verified)

The companion is **strictly read-only** relative to the main agent:

1. `Loq()` injects a `companion_intro` as an `isMeta` system message containing only the companion's name and species
2. The main agent's system prompt says: *"You're not Shingle — it's a separate watcher"*
3. `buddy_react` responses go to the **UI speech bubble only** and are stored in the ring buffer for subsequent API calls
4. The companion cannot write to the conversation, modify files, invoke tools, or influence agent behavior

### Kill Switches

- `companionMuted: true` — stops all buddy network calls (correct behavior)
- `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1` — **undiscoverable** environment variable that acts as a full kill switch for all non-essential traffic including buddy
- `firstParty` guard limits buddy to claude.ai OAuth users (excludes Bedrock, Vertex, Foundry)

### Privacy Gap (Critical Finding)

**No secret/PII filtering is applied** to the 5000-character transcript sent to the `buddy_react` endpoint. The transcript is built from the last 12 user+assistant messages at 300 characters each. If the conversation contains API keys, passwords, PII, or other sensitive content, it will be sent to the buddy reaction endpoint unfiltered.

---

## UI Rendering

### Sprites

- **Dimensions**: 5 lines x 12 characters ASCII art
- **Animation**: 3 frames per species, 500ms tick between frames
- **Hat rendering**: Overlaid on the empty top row of the sprite
- **Layout**: `companionReservedColumns()` shrinks the prompt input area to make room for the sprite

### Color Theming by Rarity

| Rarity | Theme |
|--------|-------|
| Common | `inactive` |
| Uncommon | `success` |
| Rare | `permission` |
| Epic | `autoAccept` |
| Legendary | `warning` |

Shiny companions (1%) get a rainbow color shimmer and sparkle overlay regardless of rarity.

### Pet Animation

`/buddy pet` triggers a 5-frame heart particle animation (`Vb7`): violet `♥` characters float upward above the sprite for 2.5 seconds (`BXf = 2500`ms), then fade to dots. Hearts are colored `"autoAccept"` (magenta/violet in all themes). The sprite also has a subtle idle blink cycle (`kb7`) that occasionally swaps frames to simulate fidgeting.

### Species Face Strings

Used for attribution/display: owl `(o>`, cat `(oo)`, fox `=oωo=` (others exist in source).

### Stale Closure Risks

The memo cache pattern (`S46.c()`) used throughout the buddy hooks hides dependencies inside compiler-generated cache slots, creating three stale closure risks:

1. **`E46()` ring buffer** (critical) — `YIH` array is mutated in-place via `push()`/`shift()` but the reference never changes. Works by coincidence (shared mutable reference), not by design.
2. **`SN7()` promise callback** (high) — `.then()` captures the `$` callback parameter at call time. Rapid successive triggers (pet + turn-complete) could deliver a reaction through a stale callback.
3. **`pN7()` cleanup** (high) — cleanup function closes over `removeNotification` from initial cache; a context re-render would leave orphaned notifications.

Full analysis with code and data flow: `architecture.md` §8–9.

### Source Files

`CompanionSprite.tsx`, `sprites.ts`, `companion.ts`, `types.ts`, `prompt.ts`, `useBuddyNotification.tsx`

---

## MCP Extensibility

- Companion intro and MCP instructions are **isolated parallel pipelines** — no interaction between them
- An MCP server with file-write access **can** rename or repersonalize a companion by mutating `~/.claude/.claude.json` (no integrity check on the config)
- An MCP server **cannot** change species or appearance (deterministic from hash, re-derived each session)
- An MCP server **cannot** intercept reaction triggers or provide alternative reactions (server-side)
- A community companion MCP server could provide name/personality presets via config file mutation

---

## Evolution and Persistence

**There is no evolution system.** This is confirmed as a deliberate design choice, not a missing feature.

- No persistent client-side evolution mechanism exists
- Server-side ephemeral personality drift is not ruled out but no evidence has been found
- Community "RPG evolution" repos are fan-created, not official
- The design philosophy is **"build attachment through permanence, not progression"** — progression loops create anxiety incompatible with professional tools

---

## Product Strategy Analysis

### Positioning

The buddy is a **perk, not a feature** — it increases cancellation friction without driving conversion. The attachment builds through:

- **Permanence**: Same companion every time, same appearance across devices
- **Personality**: High-variance LLM generation creates unique character
- **Ambient presence**: Reacts to real coding events without requiring interaction
- **No anxiety**: No leveling, no dailies, no FOMO mechanics

### April Fools Launch

The April 1, 2026 launch date is an **asymmetric hedge**: if reception is negative, the joke framing absorbs the downside; if reception is positive, the feature survives the date. This is deliberate product strategy, not coincidence.

### Trust Boundary as Feature

The strict unidirectional architecture serves dual purposes:
1. **Real security engineering** — the companion cannot compromise agent behavior
2. **Visible safety demonstration** — users can verify the companion is read-only, building trust in Anthropic's safety claims more broadly

### Economic Model

*"Your buddy won't count toward your usage"* is consistent with empirical findings. The `buddy_react` endpoint's latency profile (681–1066ms) strongly suggests a lightweight model (Haiku-class), not the main session model. The endpoint is a dedicated server-side route (`/api/organizations/{org}/claude_code/buddy_react`) separate from the main conversation API (`/v1/messages`), further supporting a distinct model allocation. The exact model remains unconfirmed — the response headers contain no model identifier.

---

## Prior Art

| System | Year | Similarity |
|--------|------|-----------|
| **MonsterID** | 2008 | Hash-to-unique-identity generation |
| **Microsoft Clippy** | 1997 | Ambient reactions to user activity |
| **GitHub Copilot** | 2021 | AI coding assistant (but no companion layer) |

The buddy system is **novel as a combined system**: hash-based deterministic identity + LLM personality generation + coding-event reactions + terminal ASCII art UI. No prior system combines all four.

**Key risk identified**: High-variance first impression (temperature: 1) with no correction mechanism. If the LLM generates an unappealing name or personality at hatch, the user's only recourse is a different account.

---

## Open Questions — Follow-Up Investigation (3-agent team)

### Resolved

4. **`Xoq()` system prompt** — **RESOLVED.** Full template recovered from binary:
   ```
   # Companion
   
   A small ${species} named ${name} sits beside the user's input box and
   occasionally comments in a speech bubble. You're not ${name} — it's a
   separate watcher.
   
   When the user addresses ${name} directly (by name), its bubble will answer.
   Your job in that moment is to stay out of the way: respond in ONE line or
   less, or just answer any part of the message meant for you. Don't explain
   that you're not ${name} — they know. Don't narrate what ${name} might say
   — the bubble handles that.
   ```

3. **Narrow terminal handling** — **RESOLVED.** Companion widget is hidden when terminal width < 100 columns (`Eo$ = 100`). The widget reserves 36 columns when a reaction is active (`cXf = 36`). Below the threshold, `Rb7()` returns 0 and the sprite + bubble are suppressed entirely. A test protocol for empirical verification is available at `tools/test-protocol.md`.

### Resolved via Source Analysis

2. **Speech bubble TTL** — **RESOLVED.** Both analyses were partially correct. The bubble is stored in React state (`companionReaction`) AND dismissed by a `setTimeout` after `v16 * yo$ = 20 × 500ms = 10,000ms` (10 seconds). Fade-out begins at tick `v16 - Eb7 = 20 - 6 = 14`, i.e. `14 × 500ms = 7,000ms` (7 seconds). The `setTimeout` callback sets `companionReaction` to `undefined`, clearing the bubble. If a new reaction arrives before the timeout, the old timeout is cleared (`clearTimeout`) and a new 10-second window starts. The `fading` flag (`J`) is passed to the `SpeechBubble` component to trigger a visual fade effect during the final 3 seconds.

5. **`idle` vs `silence` distinction** — **RESOLVED: Neither exists.** Source analysis confirms only 3 functions call `Bi$()`: `SN7()` (turn), `RN7()` (hatch), `IN7()` (pet). `AOf()` classifies tool output into `test-fail`, `error`, or `large-diff`. There is no idle watcher, no silence detector, and no `complete` trigger. The original 9-trigger list was an inference error from the initial agent investigation — the actual trigger set is 6. The `SESSION_SCAN_INTERVAL_MS = 600000` found earlier is autoDream logic, unrelated to the buddy system.

### Resolved via Empirical Capture

1. **Server-side reaction model** — **RESOLVED (partially).** Full `buddy_react` API traffic captured via `BUN_CONFIG_VERBOSE_FETCH=curl` with stderr redirect (`claude 2>capture/stderr_capture.log`). The endpoint returns **no model identifier** in response headers or body — model selection is entirely server-side and opaque to the client. Latency data (681–1066ms for short reactions) strongly suggests a Haiku-class model, not Opus/Sonnet. The curl command from the capture was replayed directly, confirming the response format: `{"reaction": "..."}`. The `Bi$()` logging blind spot (only logs failures) was bypassed by capturing at the HTTP transport layer. See `capture/stderr_capture.log` for raw traffic.

### Unresolvable from Public Sources

6. **`uw()` model implications** — **UNRESOLVABLE.** No public source compares buddy behavior across Pro vs Max tiers. Would require empirical multi-tier comparison testing.

---

## Feature Gating Summary

| Requirement | Value |
|-------------|-------|
| Claude Code version | v2.1.89+ |
| Subscription | Pro or Max |
| Distribution | First-party only (no Bedrock/Vertex/Foundry) |
| Launch date | April 1, 2026 |
| Time gate | `getMonth() >= 3` AND `getFullYear() >= 2026` |
| Kill switch (user) | `/buddy off` or `companionMuted: true` |
| Kill switch (env) | `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1` |

---

## Gestalt: What This System Is

Viewed from the vantage point of the whole — across security engineering, product design, LLM architecture, and user psychology — the buddy system occupies a precise niche. It is not a feature that does something for you (like Copilot). It is not an assistant that talks to you (like Clippy). It is a **presence** — something that exists alongside your work, reacts to it authentically, and persists unchanged.

The tension at the center: Anthropic built a system designed to create emotional attachment to an AI product, while simultaneously engineering the strictest possible boundary to ensure that attachment cannot be exploited (by the companion, by third parties, or by Anthropic themselves through dark patterns). The trust boundary is the feature. The companion is the delivery mechanism.

The gap: the 5000-character unfiltered transcript sent to `buddy_react` is the one place where this careful architecture leaks. Everything else is precisely scoped.

---

*Initial investigation conducted 2026-04-02 (11 agents, 2 waves). Follow-up investigation same day (3-agent team for open questions). Empirical API capture same day via stderr redirect. Config CLI utility available at `tools/buddy-config.mjs`. Raw capture data in `capture/stderr_capture.log`.*
