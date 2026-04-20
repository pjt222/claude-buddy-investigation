# Claude Code Buddy System — Technical Architecture

**Date**: 2026-04-02 (updated 2026-04-17)
**Version**: 1.2

> **Version scope:** This document describes the companion system as it existed in **v2.1.89–v2.1.96**. The native UI module was surgically removed in v2.1.97 (built 2026-04-08). Functions, components, and rendering described below no longer exist in the binary. The `[buddy-reaction-api]` API remains live server-side — our workspace and MCP tools call it directly, bypassing the binary.
>
> **Advisor system:** Starting v2.1.96, a separate **advisor tool** (`[advisor-tool-name]`) coexists in the binary — a server-side decision-gate reviewer, architecturally independent from the companion. See `advisor-architecture.md` for the full advisor technical spec.
>
> **Kairos loop system:** Starting v2.1.101, an autonomous self-continuation mechanism (`ScheduleWakeup` tool, `/loop` slash command, four prompt sentinels) — also architecturally independent from the companion. See `loop-architecture.md` for the full loop technical spec.
>
> **v2.1.111/v2.1.112 advances:** Binary investigation through v2.1.112 (build 2026-04-16T18:33:55Z) has characterized 14+ additional systems. See §12 for a summary of new architectural surfaces and the `digest.md` v2.1.111/v2.1.112 investigation section for full detail.

---

## 1. System Overview

The Buddy system was a first-party companion feature in Claude Code v2.1.89–v2.1.96 that rendered an animated Tamagotchi-style creature beside the user's input box. It operated as an independent watcher — architecturally separate from the main Claude agent — observing the conversation and producing short reactions displayed in a terminal speech bubble.

The system had two distinct phases:

1. **Identity generation** — a deterministic pipeline that derives a companion's species, rarity, visual traits, and stats from the user's account UUID, then generates a name and personality via a one-time LLM call. *(Pipeline fully reproduced in `bones.mjs`.)*
2. **Reaction loop** — a runtime pipeline that watched the conversation for trigger events, built a compact transcript, sent it to a dedicated API endpoint, and rendered the response in the UI. *(The API endpoint survives — our tools call it directly.)*

The companion's personality was injected into the main agent's context via a `companion_intro` attachment so the primary model knew the companion existed and could defer to it when the user addressed it by name.

---

## 2. Data Flow Diagrams

### 2.1 Reaction Pipeline

```
User Session
     │
     ├──► [buddy-trigger-fn] ─── turn-end trigger ───────────────────────────────────┐
     │                                                                   │
     ├──► [tool-output-classifier-fn] ─── tool-output classifier ─────────────────────────────┤
     │    (test-fail / error / large-diff)                               │
     │                                                                   ▼
     ├──► [name-detector-fn] ─── addressed-by-name detector ──────► addressed flag   │
     │                                                                   │
     └──► [buddy-transcript-fn] ─── transcript builder ──────────────────────────────────┤
          (last 12 messages, ≤300 chars each)                            │
                                                                         ▼
                                                          [buddy-api-fn] ── API call
                                                            │
                                         POST [internal-endpoint-path]
                                              /claude_code/[buddy-reaction-api]
                                                            │
                                                            ▼
                                                     {reaction: string}
                                                            │
                                              ┌─────────────┤
                                              ▼             ▼
                                         [reaction-ring-buffer-fn] ring    SpeechBubble
                                         buffer store   UI render
```

### 2.2 Identity Generation Pipeline

```
accountUuid + SALT ("[hash-salt]")
     │
     ▼
 Hash function
 ├── Bun runtime:  Bun.hash (wyhash, 64-bit)
 └── Node.js:      FNV-1a fallback (32-bit)
     │
     ▼
 Mulberry32 PRNG (seeded from hash)
     │
     ▼
 roll() — trait selection (deterministic order)
     │
     ├── 1. Rarity    (weighted: 60/25/10/4/1)
     ├── 2. Species   (18 options, uniform — non-alphabetical array order)
     ├── 3. Eye type  (6 variants)
     ├── 4. Hat       (8 styles — SKIPPED for common rarity)
     ├── 5. Shiny     (1% chance — before stats)
     └── 6. Stats     (primary boosted +50, secondary penalized -10, others baseline)
     │
     ▼
 CompanionBones (immutable physical identity)
     │
     ▼
 Personality LLM call (one-time, at hatch)
     │
     ├── querySource: dedicated personality endpoint
     ├── model: lightweight (likely Haiku-class)
     ├── system prompt: species + traits context
     └── schema: {name: string, personality: string}
     │
     ▼
 CompanionSoul (name + personality, persisted)
     │
     ├── Stored: ~/.claude/.claude.json → companion key
     └── Backed up: ~/.claude/backups/.claude.json.backup.*
     │
     ▼
 [intro-injector-fn] ─── companion_intro attachment
     │      injected into main agent system prompt
     ▼
 Main agent sees: "A small [species] named [Name] sits beside
                   the user's input box..."
```

---

## 3. Function Reference

> *All functions below were present in v2.1.89–v2.1.96 and removed in v2.1.97. Descriptions reflect their behavior when the module was active.*

### Availability and Configuration

| Function | Role |
|----------|------|
| `[availability-gate-fn]` | **Availability gate.** Checks `firstParty` flag (Pro/Max subscription) and date window. Returns false if companion feature is disabled or unavailable. |
| `[config-reader-fn]` | **Companion config reader.** Reads the `companion` key from `~/.claude/.claude.json`, returns `{name, personality, hatchedAt}` or null. |

### Identity Generation

| Function | Role |
|----------|------|
| `roll()` / `[trait-generator-fn]` | **Core trait generator.** Seeds Mulberry32 PRNG from hashed accountUuid+salt, then selects rarity → species → eyes → hat (skipped for common) → shiny → stats (primary/secondary boost) in fixed order. Returns `CompanionBones`. |
| `[hatch-handler-fn]` | **Hatch handler.** Orchestrates first-time companion creation: calls `roll()` for bones, invokes LLM for soul (name + personality), persists result to config. |
| `[fallback-personality-fn]` | **Fallback personality generator.** Produces a default personality string if the LLM personality call fails or times out. Ensures the companion is always usable. |

### Reaction Loop

| Function | Role |
|----------|------|
| `[buddy-trigger-fn]` | **Turn-end trigger/watcher.** Fires after each assistant turn completes. Determines whether the companion should react based on turn content, timing, and randomness. |
| `[tool-output-classifier-fn]` | **Tool output classifier.** Inspects tool results for trigger conditions: test failures, errors, large diffs. Returns a `reason` string for the API call. |
| `[name-detector-fn]` | **Addressed-by-name detector.** Scans user message for the companion's name (case-insensitive). Sets the `addressed` flag to true if found. |
| `[buddy-transcript-fn]` | **Transcript builder.** Extracts the last 12 messages from the conversation, truncating each to 300 characters. Produces the compact transcript sent to the API. |
| `[buddy-api-fn]` | **Reaction API sender.** Sends POST to `[buddy-reaction-api]` endpoint with 6 parameters: companion config, transcript, trigger reason, recent context, addressed flag, abort signal. **Logging blind spot**: only logs on failure (`[buddy] api failed:`); successful reactions are completely invisible to debug logs. Has 4 silent bail-out gates: `[first-party-check-fn]!=="firstParty"`, `[nonessential-traffic-gate-fn]` (nonessential traffic), missing `organizationUuid`, missing `accessToken`. |
| `[reaction-ring-buffer-fn]` | **Ring buffer store.** Maintains a fixed-size circular buffer of recent reactions for context continuity and deduplication. |
| `[buddy-layout-fn]` | **Column reservation.** Returns companion widget width (0 if muted or terminal < 100 columns). |

### UI and Prompt Integration

| Function | Role |
|----------|------|
| `[intro-injector-fn]` | **companion_intro injector.** Attaches a `companion_intro` message to the conversation history, informing the main agent about the companion's existence, name, and species. |
| `[buddy-template-fn]` | **System prompt template builder.** Constructs the system-reminder block that tells the main agent how to coexist with the companion (defer when addressed, don't impersonate). |
| `[sprite-render-fn]` | **Sprite renderer.** Renders the companion's ASCII art from species template + eye injection + hat overlay. Handles 3-frame animation cycle. |
| `[face-string-fn]` | **Face string builder.** Constructs the attribution line shown in the speech bubble header (companion name + species for identification). |
| `[pet-handler-fn]` | **Pet handler.** Responds to `/pet` or affectionate interaction commands with a special reaction animation or message. |

---

## 4. API Protocol (Empirically Verified)

*Protocol captured via `BUN_CONFIG_VERBOSE_FETCH=curl` with stderr redirect on 2026-04-02. Curl replay confirmed response format.*

### Endpoint

```
POST [internal-endpoint-path]
```

### Authentication

| Header | Value | Captured |
|--------|-------|----------|
| `Authorization` | `Bearer {OAuth token}` | `[oauth-token-placeholder]` (OAuth session token) |
| `anthropic-beta` | `[oauth-beta-version]` | Exact value from capture |
| `Content-Type` | `application/json` | ✓ |
| `User-Agent` | `claude-code/{version}` | `claude-code/2.1.90` |
| `Accept` | `application/json, text/plain, */*` | ✓ |
| `Connection` | `keep-alive` | HTTP/1.1 |

### Request Payload (Captured)

**Structure is flat** — all fields are top-level, not nested under a `companion` key as previously assumed from source analysis.

**Example 1: Pet trigger**
```json
{
  "name": "Shingle",
  "personality": "Perches silently in your editor margins, watching you debug with almost supernatural calm before gently suggesting you'd actually left a semicolon off three lines ago.",
  "species": "owl",
  "rarity": "common",
  "stats": {"DEBUGGING": 10, "PATIENCE": 81, "CHAOS": 1, "WISDOM": 36, "SNARK": 21},
  "transcript": "(you were just petted)",
  "reason": "pet",
  "recent": [],
  "addressed": false
}
```

**Example 2: Turn trigger with direct address**
```json
{
  "name": "Shingle",
  "personality": "Perches silently in your editor margins...",
  "species": "owl",
  "rarity": "common",
  "stats": {"DEBUGGING": 10, "PATIENCE": 81, "CHAOS": 1, "WISDOM": 36, "SNARK": 21},
  "transcript": "user: @Shingle how is it going in space?\nclaude: 👋",
  "reason": "turn",
  "recent": ["*soft hoot of approval, subtle head tilt*\n\nYou remembered the semicolon this time, yes?"],
  "addressed": true
}
```

**Key observations:**
- `stats` has **5 fields** (DEBUGGING, PATIENCE, CHAOS, WISDOM, SNARK), all uppercase keys
- `transcript` is a **single formatted string**, not a message array. For pet triggers: literal `"(you were just petted)"`. For turn triggers: `"user: ...\nclaude: ..."` format
- `recent` carries prior reaction strings (from `[reaction-ring-buffer-fn]` ring buffer) for conversational continuity
- `addressed` is true when `[name-detector-fn]` detects the companion's name in the user message
- Full companion persona sent with every request — **the server is stateless**
- `signal` (AbortSignal) is a client-side construct, not transmitted over the wire

### Field Requirements (Wave 2, 2026-04-09)

| Field | Required | Validation |
|-------|----------|------------|
| `name` | Yes | String |
| `personality` | Yes | String |
| `species` | Yes | Strict enum (18 species) |
| `rarity` | Yes | Strict enum (5 tiers) |
| `stats` | Yes | Keys validated (5 stat names), values NOT range-checked (999, -1 accepted) |
| `transcript` | Yes | String, max 5,000 characters |
| `reason` | Yes | Strict enum: turn, pet, hatch, test-fail, error, large-diff |
| `recent` | No | Defaults to `[]` |
| `addressed` | No | Defaults to `false` |

Extra/unknown fields are silently ignored. Model, temperature, language, and other generation parameters cannot be overridden — model selection is entirely server-side.

### Rate Limits (Wave 2, 2026-04-09)

- Window: approximately **5 minutes** (empirically measured)
- 429 body: `{"error": "Your companion is tired. Try again in a bit.", "details": {"error_visibility": "user_facing"}}`
- Validation errors (400) return in sub-300ms — a pre-flight layer runs before any LLM inference
- The MCP server's 5s cooldown (vs native 30s) amplifies the risk of exhausting the per-user limit

### Response (Captured via curl replay)

```json
{"reaction":"*soft, satisfied hoot*\n\nAh. Yes. Quite pleasant, that."}
```

**Response headers (captured):**
```
HTTP/1.1 200 OK
Content-Type: application/json
Transfer-Encoding: chunked
Content-Encoding: gzip
request-id: req_[REDACTED]
x-envoy-upstream-service-time: 681
Server: cloudflare
CF-RAY: [CF-RAY REDACTED]
strict-transport-security: max-age=31536000; includeSubDomains; preload
Content-Security-Policy: default-src 'none'; frame-ancestors 'none'
cf-cache-status: DYNAMIC
vary: Accept-Encoding
server-timing: x-originResponse;dur=684
```

**Key findings:**
- **No model identifier** in response headers or body — model selection is entirely server-side
- `x-envoy-upstream-service-time` provides server-side latency (681–1066ms across 3 calls)
- Latency range is consistent with Haiku-class models for short text generation
- Cloudflare-fronted, Envoy reverse proxy behind CDN
- `request-id` follows Anthropic's standard format (`req_011CZf...`)
- Response is gzip-compressed (hence invisible to raw stderr capture; curl replay with `Accept-Encoding: identity` was needed)

**Notes:**
- No schema validation is performed on the client side for the response
- The `reaction` string is rendered directly into the `SpeechBubble` component
- **Timeout**: 10 seconds (hard cutoff; reaction is silently dropped on timeout)

---

## 5. Security Boundary

### Unidirectional Content Flow

```
                    ┌──────────────────────────────┐
                    │     Main Agent Context        │
                    │                               │
  companion_intro ──┤►  System prompt (read-only)   │
  ([intro-injector-fn] injection)   │   "A small owl named Shingle  │
                    │    sits beside the input box"  │
                    │                               │
                    │   Main agent CANNOT:           │
                    │   - control companion behavior │
                    │   - read companion reactions   │
                    │   - modify companion state     │
                    └──────────────────────────────┘

                    ┌──────────────────────────────┐
                    │     Buddy React API           │
                    │                               │
  [buddy-transcript-fn] transcript ─┤►  Receives conversation text  │──► reaction string
  (12 msgs × 300ch) │   (unfiltered content)        │     (to UI only)
                    │                               │
                    │   API CANNOT:                  │
                    │   - modify main conversation   │
                    │   - invoke tools               │
                    │   - access filesystem          │
                    └──────────────────────────────┘
```

### Content Flow Direction

- **Into main agent**: `companion_intro` attachment (name, species, behavioral instructions). One-way. The main agent receives awareness of the companion but cannot influence it.
- **Into buddy API**: Unfiltered transcript of the last 12 messages (up to 300 chars each). The buddy API sees conversation content including code, errors, and user messages.
- **Out of buddy API**: A single `reaction` string rendered in the speech bubble UI. This string never enters the main agent's context or tool pipeline.

### Privacy Consideration

The transcript sent to `[buddy-reaction-api]` is **unfiltered** — it includes whatever the user typed and whatever the assistant responded, truncated only by length. There is no redaction of secrets, file paths, or sensitive content before transmission.

### Opt-Out Mechanisms (v2.1.89–v2.1.96 only — moot in v2.1.97+)

| Mechanism | Scope | How |
|-----------|-------|-----|
| `[companion-muted-key]` | Runtime | Muted speech bubble without disabling the companion |
| `[kill-switch-env]` | Environment variable | Disabled all non-essential network calls including buddy reactions |
| `firstParty` guard (`[availability-gate-fn]`) | Subscription check | Feature gated behind Pro/Max subscription; unavailable on free tier or API-only usage |
| `/buddy` toggle | User command | Activated or deactivated the companion system entirely |

---

## 6. UI Rendering Pipeline (v2.1.89–v2.1.96 — removed in v2.1.97)

### Sprite System

```
┌─────── 12 chars wide ───────┐
│  ___   ___   ___            │  ← Hat layer (top line)
│ (o o) (o o) (- o)           │  ← Eyes injected at {E} placeholders
│ /|▓|\ /|▓|\ /|▓|\          │  ← Body (species template)
│  / \   | |   / \            │  ← Feet (frame-dependent)
│                             │
└─── 5 lines tall ────────────┘
      Frame 0  Frame 1  Frame 2

Animation: 500ms tick interval, cycling through 3 frames
```

**Sprite composition layers:**
1. **Body template**: Species-specific ASCII art (18 species × base template)
2. **Eye injection**: `{E}` placeholders in body string replaced with eye-type characters (6 variants)
3. **Hat overlay**: Rendered on the topmost line of the sprite (8 styles)
4. **Shiny effect**: Color/highlight modifier applied to the entire sprite (1% of companions)
5. **Pet hearts overlay**: Animated `♥` particles above sprite during pet reaction (see below)

### Pet Heart Animation (`[heart-anim-frames]`)

When the user runs `/buddy pet`, a 5-frame heart particle animation plays above the companion sprite for 2.5 seconds:

```
Frame 0:    ♥    ♥        (hearts appear)
Frame 1:   ♥  ♥   ♥       (rising, spreading)
Frame 2:  ♥   ♥  ♥        (continued drift)
Frame 3: ♥  ♥      ♥      (dispersing)
Frame 4: ·    ·   ·       (fade to dots)
         ┌──────────┐
         │  sprite  │      (companion below)
         └──────────┘
```

**Constants:**
- `BXf = 2500` — animation duration: 2.5 seconds
- Hearts cycle at `yo$ = 500`ms per frame (5 frames × 500ms = 2500ms)
- Color: `"autoAccept"` theme key → **magenta/violet** in all color schemes
- Heart character: `nH.heart` → `♥` (U+2665)
- Frame selection: `[heart-anim-frames][X % [heart-anim-frames].length]` where `X = currentTick - petStartTick`

**Rendering logic** (in `k16()`):
- `companionPetAt` state is set to `Date.now()` when pet command fires
- `petStartTick` captures the tick count at pet time
- While `(currentTick - petStartTick) * 500 < 2500`, the current heart frame `W` is prepended above the sprite: `y = W ? [W, ...V] : V`
- After 2500ms, `W` becomes `null` and the hearts disappear

**Idle blink animation** (`kb7`):
The sprite also has a subtle idle animation: `kb7 = [0,0,0,0,1,0,0,0,-1,0,0,2,0,0,0]` — mostly frame 0 (still), with occasional frame switches creating a slow blink/fidget cycle. Frame `-1` triggers a "sleeping" state where eyes are replaced with `-`.

### Speech Bubble Lifecycle

```
1. Trigger fires ([buddy-trigger-fn] / [tool-output-classifier-fn] / [name-detector-fn])
          │
2. [buddy-api-fn] sends API request
          │
3. Response received (or 10s timeout → discard)
          │
4. [face-string-fn] builds attribution header
          │
5. SpeechBubble component renders:
   ┌─────────────────────────────┐
   │ Shingle:                    │
   │ "You left a semicolon off   │
   │  three lines ago."          │
   └──────────┬──────────────────┘
              │  ← tail points toward sprite
          [sprite]
          │
6. Auto-dismiss: setTimeout clears companionReaction after v16*yo$ = 20×500 = 10,000ms
   Fade-out: starts at tick (v16-[effort-ui-fn]7) = 14 → 14×500 = 7,000ms (final 3s are faded)
   If a new reaction arrives, old timeout is cleared and a fresh 10s window starts.
          │
7. Reaction stored in [reaction-ring-buffer-fn] ring buffer
```

### Timing Constants (from binary, with readable labels)

| Minified | Readable Label | Value | Derived | Meaning |
|----------|---------------|-------|---------|---------|
| `$Of` | `REACTION_COOLDOWN_MS` | `30000` | 30s | Minimum interval between reactions |
| `[buffer-capacity]` | `RECENT_BUFFER_SIZE` | `3` | — | Ring buffer capacity (recent reactions) |
| `KOf` | `LARGE_DIFF_THRESHOLD` | `80` | — | Lines changed to trigger `large-diff` |
| `yo$` | `TICK_INTERVAL_MS` | `500` | 0.5s | Master tick for animation + bubble timing |
| `v16` | `BUBBLE_TTL_TICKS` | `20` | 10s | Bubble auto-dismiss (`20 × 500ms = 10,000ms`) |
| `[effort-ui-fn]7` | `BUBBLE_FADE_OFFSET` | `6` | 3s | Fade starts at tick 14 (`(20-6) × 500ms = 7,000ms`) |
| `BXf` | `PET_ANIMATION_MS` | `2500` | 2.5s | Heart particle duration after `/buddy pet` |
| `Eo$` | `MIN_TERMINAL_WIDTH` | `100` | — | Hide companion below 100 columns |
| `cXf` | `WIDGET_WIDTH_ACTIVE` | `36` | — | Columns reserved when bubble is showing |
| `dXf` | `SPRITE_WIDTH` | `12` | — | Base sprite width in characters |
| `FXf` | `SPRITE_PADDING` | `2` | — | Padding around sprite |
| `UXf` | `NAME_GAP` | `2` | — | Gap between sprite and name label |
| `LGf` | `LEFT_GUTTER` | `3` | — | Left margin offset |
| `[narrow-max-const]` | `NARROW_BUBBLE_MAX_CHARS` | `24` | — | Max reaction length in narrow mode |

### Layout Coordination

The `[buddy-layout-fn]` function calculates companion column reservation:
- Returns `0` when `[companion-muted-key]` is true or terminal width < 100 columns (`Eo$ = 100`)
- Returns `cXf = 36` columns when a reaction is active (sprite + bubble)
- Prompt input width: `terminalWidth - LGf - [buddy-layout-fn]`

### Rarity Color Mapping

| Rarity | Weight | Visual Treatment |
|--------|--------|-----------------|
| Common | 60% | Default terminal colors |
| Uncommon | 25% | Green accent |
| Rare | 10% | Blue accent |
| Epic | 4% | Purple accent |
| Legendary | 1% | Gold/yellow accent |
| Shiny | 1% (independent) | Sparkle/highlight overlay on any rarity |

---

## 7. Identity Generation Pipeline

### Step 1: Hashing

```
Input:  accountUuid + "[hash-salt]"
        ─────────────────────────────────
Runtime detection:
  ├── Bun:     Bun.hash() → wyhash (64-bit) → truncate to 32-bit seed
  └── Node.js: FNV-1a fallback → 32-bit hash directly
        ─────────────────────────────────
Output: 32-bit unsigned integer seed
```

The salt `"[hash-salt]"` is hardcoded. Changing it would reshuffle all companion assignments globally.

### Step 2: PRNG — Mulberry32

```javascript
// Mulberry32: fast, deterministic 32-bit PRNG
function mulberry32(seed) {
  return function() {
    seed |= 0; seed = seed + [prng-constant] | 0;
    var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
}
```

Each call to the returned function produces the next value in [0, 1). The order of calls matters — traits must be selected in a fixed sequence.

### Step 3: Trait Selection Order (Binary [trait-generator-fn]/[buddy-stat-gen-fn], Verified 2026-04-09)

The `[trait-generator-fn]` function consumes PRNG values in this exact order. **The order varies by rarity** — common companions skip the hat roll entirely.

| Order | Trait | Options | Selection Method | Notes |
|-------|-------|---------|-----------------|-------|
| 1 | Rarity | 5 tiers | Weighted random (60/25/10/4/1) | `[rarity-selector-fn]`: `rng() * 100`, subtract each weight |
| 2 | Species | 18 types | Uniform: `floor(rng * 18)` | Array is **NOT alphabetical** — see species order below |
| 3 | Eye type | 6 variants | Uniform: `floor(rng * 6)` | |
| 4 | Hat | 8 styles | Uniform: `floor(rng * 8)` | **SKIPPED for common** — no RNG call, hat = "none" |
| 5 | Shiny | boolean | `rng() < 0.01` | Comes **before** stats (not after) |
| 6 | Stats | 5 attributes | Primary/secondary boost system (`[buddy-stat-gen-fn]`) | See stat formula below |

**Species array order (binary `[buddy-species-array]`):**

The species array in the binary is NOT alphabetical. The index-to-species mapping must match exactly:

```
[duck, goose, blob, cat, dragon, octopus, owl, penguin,
 turtle, snail, ghost, axolotl, capybara, cactus, robot, rabbit, mushroom, chonk]
```

Species names are obfuscated via `[obfuscation-fn]()` — "capybara" collides with an internal Anthropic model codename.

**Stat derivation formula (binary `[buddy-stat-gen-fn]`):**

Stats are NOT uniform random. The binary picks a **primary stat** (boosted) and a **secondary stat** (penalized), with the remaining three getting baseline values:

```javascript
function [buddy-stat-gen-fn](rng, rarity) {
  const floor = STAT_FLOORS[rarity];
  const primary   = STAT_NAMES[floor(rng() * 5)];       // random stat
  let secondary   = STAT_NAMES[floor(rng() * 5)];       // random stat, must differ
  while (secondary === primary) secondary = STAT_NAMES[floor(rng() * 5)];

  for (stat of STAT_NAMES) {
    if (stat === primary)    stats[stat] = min(100, floor + 50 + floor(rng() * 30));  // boosted
    else if (stat === secondary) stats[stat] = max(1, floor - 10 + floor(rng() * 15)); // penalized
    else                     stats[stat] = floor + floor(rng() * 40);                  // baseline
  }
}
```

For Shingle (common, floor=5): PATIENCE is the primary stat (5+50+26=81), CHAOS is the secondary (max(1, 5-10+6)=1). This explains the dramatic PATIENCE peak and CHAOS valley.

**Stats** (5 attributes, empirically verified — earlier analysis incorrectly identified only 3):

DEBUGGING, PATIENCE, CHAOS, WISDOM, SNARK (uppercase keys in API payload).

Shingle's captured stats: `{"DEBUGGING": 10, "PATIENCE": 81, "CHAOS": 1, "WISDOM": 36, "SNARK": 21}` — **now fully reproduced by `bones.mjs`** using the corrected species order, stat formula, and RNG sequence.

### Step 4: Personality Generation (Soul)

Once bones are rolled, the system makes a one-time LLM call to generate the companion's "soul":

```
Request:
  ├── querySource: personality generation endpoint
  ├── model: lightweight model (Haiku-class for speed)
  ├── system prompt: "Generate a name and personality for a [species]
  │                   companion with [rarity] rarity and these stats..."
  └── response schema: { name: string, personality: string }

Response:
  ├── name: "Shingle"
  └── personality: "Perches silently in your editor margins..."
```

**Fallback path**: If the LLM call failed, `[fallback-personality-fn]` generated a deterministic fallback personality based on species and rarity, ensuring the companion was always functional.

### Step 5: Persistence

The merged `CompanionBones` + `CompanionSoul` are stored as the `companion` key in `~/.claude/.claude.json`:

```json
{
  "companion": {
    "name": "Shingle",
    "personality": "Perches silently in your editor margins...",
    "hatchedAt": 1750000000000  // redacted — dummy value to prevent fingerprinting
  }
}
```

Bones are not persisted — they were re-derived deterministically from the account UUID on every session start (v2.1.89–v2.1.96). Only the soul (name, personality, hatch timestamp) is stored. In v2.1.97+, the derivation code is absent but the soul remains on disk.

---

## Appendix A: Type Definitions

```typescript
interface CompanionBones {
  species: string;       // one of 18 species
  rarity: string;        // common | uncommon | rare | epic | legendary
  eyeType: string;       // 6 variants
  hat: string;           // 8 styles
  stats: {
    DEBUGGING: number;   // empirically verified: uppercase keys
    PATIENCE: number;
    CHAOS: number;
    WISDOM: number;      // not in initial source analysis; confirmed via capture
    SNARK: number;       // not in initial source analysis; confirmed via capture
  };
  shiny: boolean;        // 1% chance
}

interface CompanionSoul {
  name: string;          // LLM-generated
  personality: string;   // LLM-generated, used as behavioral prompt
  hatchedAt: number;     // Unix timestamp (ms) of first generation
}

interface Companion extends CompanionBones, CompanionSoul {}
```

## Appendix B: Bones vs. Soul Architecture

```
        Deterministic (re-derived each session)     Persistent (stored once)
        ──────────────────────────────────────      ─────────────────────────
        CompanionBones                               CompanionSoul
        ├── species                                  ├── name
        ├── rarity                                   ├── personality
        ├── eyeType                                  └── hatchedAt
        ├── hat
        ├── stats {DEBUGGING, PATIENCE, CHAOS, WISDOM, SNARK}
        └── shiny

        Source: hash(accountUuid + salt) → PRNG       Source: LLM call (once)
        Guarantee: always identical for same user    Guarantee: persisted to disk
```

---

## 8. State Management and Memo Cache Hooks (v2.1.89–v2.1.96)

### Overview

The buddy system did **not** use traditional React `useState` hooks for state management. Instead, it relied on `[memo-cache](n)` — a **React compiler memo cache** that allocated fixed-size slot arrays for dependency tracking. This pattern made dependencies invisible at the source level while enforcing them through reference identity comparison.

### The `[notification-hook-fn]` Notification Hook

The primary state management hook for buddy reactions:

```javascript
function [notification-hook-fn]{
  let H = [memo-cache],                                    // 4-slot memo cache
      {addNotification: $, removeNotification: q} = [notification-ctx-fn], // notification context
      K, _;
  
  if(H[0] !== $ || H[1] !== q) {        // identity check (not shallow equality)
    K = () => {
      if([config-reader-fn].companion || ![availability-gate-fn]) return;
      return $({
        key: "buddy-teaser",
        jsx: [react-import].default.createElement([text-cache-fn], {text: "/buddy"}),
        priority: "immediate",
        timeoutMs: 15000
      }),
      () => q("buddy-teaser");           // cleanup — captures q by closure
    };
    _ = [$, q];
    H[0] = $; H[1] = q; H[2] = K; H[3] = _;
  } else {
    K = H[2];                            // REUSES CACHED CALLBACK
    _ = H[3];                            // REUSES CACHED DEPS
  }
  [react-import].useEffect(K, _);
}
```

**Cache slot layout:**

| Slot | Contents | Purpose |
|------|----------|---------|
| `H[0]` | `addNotification` | Identity comparison input |
| `H[1]` | `removeNotification` | Identity comparison input |
| `H[2]` | Effect callback `K` | Cached to avoid re-creation |
| `H[3]` | Dependency array `_` | Cached `[$, q]` passed to `useEffect` |

**Why the dependency array appears "empty"**: The actual dependencies are `[$, q]` (notification context functions), but they're hidden inside the memo cache slots rather than written as a literal array in source. The `if(H[0] !== $)` guard serves the same role as React's dependency diffing — it just happens at the cache level instead of the hook level.

### Three State Layers

The buddy system distributes state across three distinct layers:

```
┌─────────────────────────────────────────────────────────────┐
│  Layer 1: Config State (persistent)                         │
│  Location: ~/.claude/.claude.json                           │
│  Reader: [config-reader-fn] / [config-reader-fn]                                       │
│  Writer: [growthbook-resolver-fn]                                               │
│  Contents: name, personality, hatchedAt                     │
│  Lifecycle: written once at hatch, read every session       │
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│  Layer 2: Reaction State (ephemeral, session-scoped)        │
│  Location: [ring-buffer-array] array (module-level mutable)                 │
│  Writer: [reaction-ring-buffer-fn] — push/shift in-place                        │
│  Reader: [reaction-reader-fn] — returns [ring-buffer-array].at(-1)                         │
│  Capacity: 3 entries ([buffer-capacity] = 3)                              │
│  Lifecycle: empty at session start, never persisted          │
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│  Layer 3: UI State (notification context)                   │
│  Location: React context via [notification-ctx-fn]                           │
│  Writer: addNotification ($)                                │
│  Cleaner: removeNotification (q)                            │
│  Lifecycle: per-render, managed by notification provider     │
└─────────────────────────────────────────────────────────────┘
```

---

## 9. Stale Closure Analysis

<!-- Identified 2026-04-02 via decompilation of [memo-cache] memo cache slots in v2.1.90 binary.
     Shingle (companion) flagged the empty dependency array pattern that led to this analysis. -->

The `[memo-cache]` memo cache pattern creates specific stale closure risks that are nearly impossible to detect without decompiling the minified source. Three issues were identified, ranked by severity.

### 9.1 Ring Buffer Mutation Without Invalidation — CRITICAL

```javascript
var [ring-buffer-array] = [];                     // module-level mutable array

function [reaction-ring-buffer-fn](H) {
  if([ring-buffer-array].push(H), [ring-buffer-array].length > [buffer-capacity])
    [ring-buffer-array].shift();                  // mutates in-place, reference unchanged
}
```

`[buddy-trigger-fn]` passes `[ring-buffer-array]` directly to `[buddy-api-fn]`:
```javascript
[buddy-api-fn](q, Y, z, [ring-buffer-array], K, AbortSignal.timeout(1e4))
```

**The problem**: The array reference never changes, but its contents are mutated by `push()` and `shift()`. Any closure or cache that holds `[ring-buffer-array]` sees the latest data *by accident* (shared mutable reference), not by design. If React ever snapshots or clones the array during reconciliation, the snapshot would contain stale reaction history sent to the API.

**Why it works today**: JavaScript passes arrays by reference, so all consumers share the same mutable object. This is correct by coincidence — the system would break silently if any intermediate code performed a defensive copy.

### 9.2 Promise Callback Captures Stale Parameter — HIGH

```javascript
function [buddy-trigger-fn](H, $) {              // $ is a callback parameter
  // ... trigger detection ...
  [buddy-api-fn](q, Y, z, [ring-buffer-array], K, AbortSignal.timeout(1e4))
    .then((w) => {
      if(!w) return;
      [reaction-ring-buffer-fn](w), $(w);               // $ captured from [buddy-trigger-fn]'s parameter
    });
}
```

**The problem**: The `.then()` callback captures `$` at the time `[buddy-trigger-fn]` is called. If `[buddy-trigger-fn]` is invoked again before the first promise resolves (e.g., rapid pet + turn-complete triggers within the 10-second API timeout), the first `.then()` still holds the previous `$` reference.

**Consequence**: Two rapid triggers could deliver a reaction through a stale callback. The severity depends on whether `$` is a stable function reference or is recreated on each render cycle.

### 9.3 Cleanup Function Captures Stale `removeNotification` — HIGH

```javascript
// Inside [notification-hook-fn]'s cached callback K:
() => q("buddy-teaser")          // cleanup function — q captured once
```

**The problem**: The cleanup function closes over `q` (`removeNotification`) from the initial cache population. If the notification context provider re-renders and `removeNotification` gets a new function identity, the cache guard `H[1] !== q` would trigger a re-cache — but the **old cleanup function** from the previous effect still holds the stale `q`.

**Consequence**: Orphaned `"buddy-teaser"` notifications that the old cleanup tries to remove via a stale function reference. The notification may persist in the UI until the next full context reset.

### What's Safe

| Function | Why |
|----------|-----|
| `[buddy-api-fn]` | Not cached. Reads `[config-reader-fn]`, `[aux-config-reader-fn]`, `[aux-config-reader-fn]` fresh on each invocation. |
| `[config-reader-fn]` inside cached `K` | Called at effect execution time, not closure creation time. Returns current config. |
| `[availability-gate-fn]` | Computes `new Date()` fresh every call. No captured state. (Note: the hardcoded year check `getFullYear() >= 2026` will need updating post-2026.) |

### Summary Table

| Location | Severity | Pattern | Risk |
|----------|----------|---------|------|
| `[reaction-ring-buffer-fn]` / `[ring-buffer-array]` | **Critical** | Mutable array, stable reference | Stale reaction history if array is ever copied |
| `[buddy-trigger-fn]` `.then()` | **High** | Promise captures parameter `$` | Stale callback on rapid successive triggers |
| `[notification-hook-fn]` cleanup | **High** | Cleanup captures `q` from cache | Orphaned notifications on context re-render |
| `[text-cache-fn]` text cache | Medium | `[memo-cache]` identity check on string prop | Would fail if prop were object (strings are safe) |
| `[buddy-api-fn]` | Safe | Reads all values fresh | No closure risk |
| `[config-reader-fn]` in effect | Safe | Called at execution time | Returns current config |
| `[availability-gate-fn]` | Safe | Stateless computation | No captured values |

---

---

## §10 BONES Divergence: Native vs MCP Shingle

As of 2026-04-02, two distinct Shingle instances coexist:

### Native Shingle (built-in bubble)

Stats derived deterministically each session from the account hash:

```
userId → Bun.hash(userId + "[hash-salt]") → Mulberry32 PRNG → stats
```

| Stat | Value |
|------|-------|
| DEBUGGING | 10 |
| PATIENCE | 81 |
| CHAOS | 1 |
| WISDOM | 36 |
| SNARK | 21 |

These cannot be modified client-side. The binary re-derives them on every launch.

### MCP Shingle (shingle-mcp + capture replay)

Stats are sent as part of the `[buddy-reaction-api]` API payload, which is stateless — the server uses whatever the client provides. MCP Shingle runs with tuned stats:

| Stat | Native | MCP | Delta |
|------|--------|-----|-------|
| DEBUGGING | 10 | **1** | -9 |
| PATIENCE | 81 | **95** | +14 |
| CHAOS | 1 | 1 | — |
| WISDOM | 36 | **99** | +63 |
| SNARK | 21 | 21 | — |

**Rationale**: Lower DEBUGGING reduces fixation on code-level nitpicks. Higher PATIENCE produces calmer, more considered reactions. Maxed WISDOM for mage-class insight. CHAOS and SNARK remain at native values.

### Behavioral Impact

The `[buddy-reaction-api]` API passes stats to the model as part of the companion persona prompt. Stat values influence reaction tone and focus:

- **Native bubble**: More debug-oriented observations, occasionally impatient
- **MCP Shingle**: Calmer temperament, broader perspective, less likely to fixate on semicolons

### Files Modified

- `tools/shingle-mcp/server.js:20-24` — BONES constant
- `tools/shingle-capture/strategy-replay.mjs:14-18` — BONES constant
- Both reference this section for change rationale

### Hardening

See [GitHub issue #1](https://github.com/pjt222/claude-buddy-investigation/issues/1) for planned dynamic derivation. When implemented, the MCP override will need an explicit `SHINGLE_STAT_OVERRIDE` mechanism rather than hardcoded values.

---

---

## §11 v2.1.97 Status: Module Removed (2026-04-09)

> **The architecture documented in §1–§10 applies to v2.1.90 through v2.1.96.** In v2.1.97 (built 2026-04-08), the entire companion JavaScript module was excised from the `.bun` section of the binary. This is not obfuscation — the source code is absent.

### What Was Removed

All client-side companion code: `[api-caller-fn]` (API caller), `[date-gate-fn]` (date gate), `roll()` (trait generator), `[buddy-trigger-fn]` (trigger watcher), `[tool-output-classifier-fn]` (tool classifier), `[name-detector-fn]` (name detector), `[buddy-transcript-fn]` (transcript builder), `[buddy-api-fn]` (API sender), `[reaction-ring-buffer-fn]` (ring buffer), `[buddy-layout-fn]` (column reservation), `[intro-injector-fn]` (intro injector), `[buddy-template-fn]` (system prompt builder), `[sprite-render-fn]` (sprite renderer), `[face-string-fn]` (face string builder), `[pet-handler-fn]` (pet handler), `[notification-hook-fn]` (notification hook).

### What Survives

- **`companion_intro`**: Present in a filter array that discards this attachment type. Dead code path — recognized but never generated.
- **`[buddy-reaction-api]` API endpoint**: Server-side, status unknown. May still respond to authenticated requests (the API was stateless).
- **`~/.claude/.claude.json`**: The `companion` key with `name`, `personality`, `hatchedAt` is untouched on disk. `[companion-muted-key]` is now a dead config key with no reader.

### What Was Added

- **Managed Agents API**: `managed-agents-2026-04-01` beta header, `POST /v1/agents`, session streaming, skills API.
- **`/dream nightly`**: Cron-based memory consolidation via SessionStart hooks.

### Date Gate Fix (Dead Code)

The date gate `[date-gate-fn]` was corrected from broken AND logic to proper OR logic in v2.1.97, but the fix is academic — no companion code remains to be gated.

| Version | Logic | Status |
|---------|-------|--------|
| v2.1.90–v2.1.96 | `[month-gate-condition]` | Broken (disables Jan-Mar yearly) |
| v2.1.97 | `getFullYear() > 2026 \|\| (getFullYear() === 2026 && [month-gate-condition])` | Correct, but dead code |

### Corrections from Wave 1 Investigation

1. **Stat range is 1-100, not 1-10**: The formula is `Math.floor(rng() * (100 - floor + 1)) + floor` where floor varies by rarity (common=1, uncommon=10, rare=20, epic=30, legendary=40). Ceiling is always 100.
2. **Tinyduck hat gating**: tinyduck (index 7) is drawn at 12.5% probability but silently rewritten to "none" unless rarity is epic or legendary. Effective rate: ~0.6%. Not previously documented.
3. **Wyhash truncation collision risk**: Production truncates 64-bit wyhash to 32 bits via `BigInt(Bun.hash(H)) & 0xffffffff`. Birthday collision at ~65K users (50%), ~116 collision pairs at 1M users.
4. **Species modular bias**: `2^32 mod 18 = 4`, favoring species at indices 4, 8, 13, 17 (cat, ghost, penguin, turtle) by ~2.3×10^-10 per species. Cryptographically negligible.

---

*This document describes the architecture as understood from source analysis and runtime observation as of 2026-04-02, updated 2026-04-09 with v2.1.97 findings and 2026-04-17 with v2.1.111/v2.1.112 findings. API protocol section empirically verified via stderr capture (`BUN_CONFIG_VERBOSE_FETCH=curl` + `claude 2>capture/stderr_capture.log`) and curl replay. Stale closure analysis conducted 2026-04-02 via decompilation of memo cache patterns in the minified binary. v2.1.97 binary analysis conducted 2026-04-09 via 10-agent parallel investigation (Wave 1). Function names reference minified/bundled identifiers from the Claude Code client — identifiers rotate per release.*

---

## §12 v2.1.111/v2.1.112 Architectural Advances (2026-04-17)

Binary: v2.1.112 (build 2026-04-16T18:33:55Z). Companion module absent since v2.1.97. Systems below are companion-independent.

### New and Characterized Subsystems

**Effort level hierarchy (xhigh)**

A fourth effort tier `xhigh` added above `high`. Gate function `[effort-gate-fn]`: `[effort-helper-fn] ?? model.includes("opus-4-7")`. The 4-tier enum `["low","medium","high","xhigh"]` is persisted in user settings as `effortLevel`. Effort UI enablement check `[effort-ui-fn]` also GrowthBook-extensible. Force-enable via `[internal-env-var]`.

**Proxy auth helper subprocess**

Corporate proxy support via a TTL-cached subprocess pattern. Gate: `[internal-env-var]=1`. Subprocess receives `[internal-env-var]`, `[internal-env-var]`, `[internal-env-var]`. 30s timeout (`[proxy-timeout-const] = 30000`). Trust gate: credentials only honored when request originates from project/local config. Error paths: "timed out", "exited {N}", "did not return a value". Same subprocess model used for OTEL headers helper (`[internal-env-var]`).

**Hook system expansion: 27 types**

The complete `[hook-types-array]` array now has 27 hook types vs. the 9 previously documented:

```
PreToolUse, PostToolUse, PostToolUseFailure, Notification, UserPromptSubmit,
SessionStart, SessionEnd, Stop, StopFailure, SubagentStart, SubagentStop,
PreCompact, PostCompact, PermissionRequest, PermissionDenied, Setup,
TeammateIdle, TaskCreated, TaskCompleted, Elicitation, ElicitationResult,
ConfigChange, WorktreeCreate, WorktreeRemove, InstructionsLoaded, CwdChanged, FileChanged
```

Shell types: `["bash", "powershell"]`. PowerShell available behind `&lt;flag-name&gt;` flag.

**Agent teams subsystem**

Experimental gate: `[internal-env-var]=1` or `--agent-teams`, guarded by `&lt;flag-name&gt;` GrowthBook flag (default `true`). Subagent identity tracked via `AsyncLocalStorage`: `isBuiltIn=true` reports actual name; `isBuiltIn=false` reports as `"user-defined"` in telemetry. Teammate system prompt addendum injected into subprocess sessions (not via tool declaration). Team memory sync: `GET/POST [internal-endpoint-path]`; redirectable via `[internal-env-var]`.

**Telemetry: Datadog 3rd-party sink**

A second telemetry sink routes ~55 events to `[telemetry-sink-url]` using public ingestion key `[telemetry-ingestion-key]`. User assignment: `[device-bucket-formula]` → bucket 0–29 (1-in-30 sampling). Gate: `&lt;flag-name&gt;`. Standard attribute set (`[attr-set-fn]`) includes `subscriptionType`, `userType`, and `userBucket` in every log entry. `[kill-switch-env]=1` does not suppress this sink.

**GrowthBook remote evaluation**

SDK client key: `[growthbook-sdk-key]`. `remoteEval: true` — all flag values computed server-side at Anthropic; client holds pre-evaluated results. 14 attributes sent per startup including `email`, `organizationUUID`, `subscriptionType`, `rateLimitTier`. Cache keys: `["id", "organizationUUID"]`. Timeout: 5s.

**File-history (Rewind)**

Format: `~/.claude/file-history/{sessionId}/{sha256(filePath)[0:16]}@v{n}`. Raw plaintext content snapshots. No TTL, no cleanup — 216+ sessions can accumulate unboundedly on disk. Versioned writes increment `n`.

**System prompt override via GrowthBook (CCR-only)**

`[internal-env-var]` (env, CCR sessions only): its value is used as a GrowthBook flag name; the flag's resolved string value replaces the entire system prompt. Allows zero-binary-release system prompt changes for cloud-runner sessions.

**Behavior-modifying flags**

| Flag | Effect |
|---|---|
| `&lt;flag-name&gt;` | Strips parallel-Bash instruction block from Bash tool description |
| `&lt;flag-name&gt;` | Memory survey; triggers on `/\bmemor(?:y|ies)\b/i` in user messages |
| `&lt;flag-name&gt;` | Double-gated Opus 4.7 feature (`model.includes("opus-4-7") && flag`) |
| `&lt;flag-name&gt;` | Kill-switch for /fast (Penguin Mode); custom message override |
| `&lt;flag-name&gt;` | Array of model fragments that block ToolSearch |
| `&lt;flag-name&gt;` | Agent teams enable gate (default true) |
