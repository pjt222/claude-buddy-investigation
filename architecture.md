# Claude Code Buddy System — Technical Architecture

**Date**: 2026-04-02
**Version**: 1.0

---

## 1. System Overview

The Buddy system is a first-party companion feature in Claude Code (v2.1.89+) that renders an animated Tamagotchi-style creature beside the user's input box. It operates as an independent watcher — architecturally separate from the main Claude agent — that observes the conversation and produces short reactions displayed in a terminal speech bubble.

The system has two distinct phases:

1. **Identity generation** — a deterministic pipeline that derives a companion's species, rarity, visual traits, and stats from the user's account UUID, then generates a name and personality via a one-time LLM call.
2. **Reaction loop** — a runtime pipeline that watches the conversation for trigger events, builds a compact transcript, sends it to a dedicated API endpoint, and renders the response in the UI.

The companion's personality is injected into the main agent's context via a `companion_intro` attachment so the primary model knows the companion exists and can defer to it when the user addresses it by name.

---

## 2. Data Flow Diagrams

### 2.1 Reaction Pipeline

```
User Session
     │
     ├──► SN7() ─── turn-end trigger ───────────────────────────────────┐
     │                                                                   │
     ├──► AOf() ─── tool-output classifier ─────────────────────────────┤
     │    (test-fail / error / large-diff)                               │
     │                                                                   ▼
     ├──► zOf() ─── addressed-by-name detector ──────► addressed flag   │
     │                                                                   │
     └──► HOf() ─── transcript builder ──────────────────────────────────┤
          (last 12 messages, ≤300 chars each)                            │
                                                                         ▼
                                                          Bi$() ── API call
                                                            │
                                         POST /api/organizations/{orgUUID}
                                              /claude_code/buddy_react
                                                            │
                                                            ▼
                                                     {reaction: string}
                                                            │
                                              ┌─────────────┤
                                              ▼             ▼
                                         E46() ring    SpeechBubble
                                         buffer store   UI render
```

### 2.2 Identity Generation Pipeline

```
accountUuid + SALT ("friend-2026-401")
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
     ├── 2. Species   (18 options, uniform within rarity)
     ├── 3. Eye type  (6 variants)
     ├── 4. Hat       (8 styles)
     ├── 5. Stats     (debugging / patience / chaos, floors by rarity)
     └── 6. Shiny     (1% chance, independent roll)
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
 Loq() ─── companion_intro attachment
     │      injected into main agent system prompt
     ▼
 Main agent sees: "A small [species] named [Name] sits beside
                   the user's input box..."
```

---

## 3. Function Reference

### Availability and Configuration

| Function | Role |
|----------|------|
| `di$()` | **Availability gate.** Checks `firstParty` flag (Pro/Max subscription) and date window. Returns false if companion feature is disabled or unavailable. |
| `qI()` | **Companion config reader.** Reads the `companion` key from `~/.claude/.claude.json`, returns `{name, personality, hatchedAt}` or null. |

### Identity Generation

| Function | Role |
|----------|------|
| `roll()` | **Core trait generator.** Seeds Mulberry32 PRNG from hashed userId+salt, then selects rarity → species → eyes → hat → stats → shiny in fixed order. Returns `CompanionBones`. |
| `RN7()` | **Hatch handler.** Orchestrates first-time companion creation: calls `roll()` for bones, invokes LLM for soul (name + personality), persists result to config. |
| `MOf()` | **Fallback personality generator.** Produces a default personality string if the LLM personality call fails or times out. Ensures the companion is always usable. |

### Reaction Loop

| Function | Role |
|----------|------|
| `SN7()` | **Turn-end trigger/watcher.** Fires after each assistant turn completes. Determines whether the companion should react based on turn content, timing, and randomness. |
| `AOf()` | **Tool output classifier.** Inspects tool results for trigger conditions: test failures, errors, large diffs. Returns a `reason` string for the API call. |
| `zOf()` | **Addressed-by-name detector.** Scans user message for the companion's name (case-insensitive). Sets the `addressed` flag to true if found. |
| `HOf()` | **Transcript builder.** Extracts the last 12 messages from the conversation, truncating each to 300 characters. Produces the compact transcript sent to the API. |
| `Bi$()` | **Reaction API sender.** Sends POST to `buddy_react` endpoint with 6 parameters: companion config, transcript, trigger reason, recent context, addressed flag, abort signal. **Logging blind spot**: only logs on failure (`[buddy] api failed:`); successful reactions are completely invisible to debug logs. Has 4 silent bail-out gates: `Xq()!=="firstParty"`, `D5()` (nonessential traffic), missing `organizationUuid`, missing `accessToken`. |
| `E46()` | **Ring buffer store.** Maintains a fixed-size circular buffer of recent reactions for context continuity and deduplication. |
| `Rb7()` | **Column reservation.** Returns companion widget width (0 if muted or terminal < 100 columns). |

### UI and Prompt Integration

| Function | Role |
|----------|------|
| `Loq()` | **companion_intro injector.** Attaches a `companion_intro` message to the conversation history, informing the main agent about the companion's existence, name, and species. |
| `Xoq()` | **System prompt template builder.** Constructs the system-reminder block that tells the main agent how to coexist with the companion (defer when addressed, don't impersonate). |
| `Fi$()` | **Sprite renderer.** Renders the companion's ASCII art from species template + eye injection + hat overlay. Handles 3-frame animation cycle. |
| `FN7()` | **Face string builder.** Constructs the attribution line shown in the speech bubble header (companion name + species for identification). |
| `IN7()` | **Pet handler.** Responds to `/pet` or affectionate interaction commands with a special reaction animation or message. |

---

## 4. API Protocol (Empirically Verified)

*Protocol captured via `BUN_CONFIG_VERBOSE_FETCH=curl` with stderr redirect on 2026-04-02. Curl replay confirmed response format.*

### Endpoint

```
POST /api/organizations/{orgUUID}/claude_code/buddy_react
```

### Authentication

| Header | Value | Captured |
|--------|-------|----------|
| `Authorization` | `Bearer {OAuth token}` | `sk-ant-oat01-...` (OAuth session token) |
| `anthropic-beta` | `oauth-2025-04-20` | Exact value from capture |
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
- `recent` carries prior reaction strings (from `E46()` ring buffer) for conversational continuity
- `addressed` is true when `zOf()` detects the companion's name in the user message
- Full companion persona sent with every request — **the server is stateless**
- `signal` (AbortSignal) is a client-side construct, not transmitted over the wire

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
request-id: req_011CZfB1dybHGWQxdVRbgXbj
x-envoy-upstream-service-time: 681
Server: cloudflare
CF-RAY: 9e60d457db52e52d-TXL
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
  (Loq injection)   │   "A small owl named Shingle  │
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
  HOf() transcript ─┤►  Receives conversation text  │──► reaction string
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

The transcript sent to `buddy_react` is **unfiltered** — it includes whatever the user typed and whatever the assistant responded, truncated only by length. There is no redaction of secrets, file paths, or sensitive content before transmission.

### Opt-Out Mechanisms

| Mechanism | Scope | How |
|-----------|-------|-----|
| `companionMuted` | Runtime | Mutes speech bubble without disabling the companion |
| `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` | Environment variable | Disables all non-essential network calls including buddy reactions |
| `firstParty` guard (`di$()`) | Subscription check | Feature is gated behind Pro/Max subscription; unavailable on free tier or API-only usage |
| `/buddy` toggle | User command | Activates or deactivates the companion system entirely |

---

## 6. UI Rendering Pipeline

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

### Pet Heart Animation (`Vb7`)

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
- Frame selection: `Vb7[X % Vb7.length]` where `X = currentTick - petStartTick`

**Rendering logic** (in `k16()`):
- `companionPetAt` state is set to `Date.now()` when pet command fires
- `petStartTick` captures the tick count at pet time
- While `(currentTick - petStartTick) * 500 < 2500`, the current heart frame `W` is prepended above the sprite: `y = W ? [W, ...V] : V`
- After 2500ms, `W` becomes `null` and the hearts disappear

**Idle blink animation** (`kb7`):
The sprite also has a subtle idle animation: `kb7 = [0,0,0,0,1,0,0,0,-1,0,0,2,0,0,0]` — mostly frame 0 (still), with occasional frame switches creating a slow blink/fidget cycle. Frame `-1` triggers a "sleeping" state where eyes are replaced with `-`.

### Speech Bubble Lifecycle

```
1. Trigger fires (SN7 / AOf / zOf)
          │
2. Bi$() sends API request
          │
3. Response received (or 10s timeout → discard)
          │
4. FN7() builds attribution header
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
   Fade-out: starts at tick (v16-Eb7) = 14 → 14×500 = 7,000ms (final 3s are faded)
   If a new reaction arrives, old timeout is cleared and a fresh 10s window starts.
          │
7. Reaction stored in E46() ring buffer
```

### Timing Constants (from binary, with readable labels)

| Minified | Readable Label | Value | Derived | Meaning |
|----------|---------------|-------|---------|---------|
| `$Of` | `REACTION_COOLDOWN_MS` | `30000` | 30s | Minimum interval between reactions |
| `qOf` | `RECENT_BUFFER_SIZE` | `3` | — | Ring buffer capacity (recent reactions) |
| `KOf` | `LARGE_DIFF_THRESHOLD` | `80` | — | Lines changed to trigger `large-diff` |
| `yo$` | `TICK_INTERVAL_MS` | `500` | 0.5s | Master tick for animation + bubble timing |
| `v16` | `BUBBLE_TTL_TICKS` | `20` | 10s | Bubble auto-dismiss (`20 × 500ms = 10,000ms`) |
| `Eb7` | `BUBBLE_FADE_OFFSET` | `6` | 3s | Fade starts at tick 14 (`(20-6) × 500ms = 7,000ms`) |
| `BXf` | `PET_ANIMATION_MS` | `2500` | 2.5s | Heart particle duration after `/buddy pet` |
| `Eo$` | `MIN_TERMINAL_WIDTH` | `100` | — | Hide companion below 100 columns |
| `cXf` | `WIDGET_WIDTH_ACTIVE` | `36` | — | Columns reserved when bubble is showing |
| `dXf` | `SPRITE_WIDTH` | `12` | — | Base sprite width in characters |
| `FXf` | `SPRITE_PADDING` | `2` | — | Padding around sprite |
| `UXf` | `NAME_GAP` | `2` | — | Gap between sprite and name label |
| `LGf` | `LEFT_GUTTER` | `3` | — | Left margin offset |
| `Nb7` | `NARROW_BUBBLE_MAX_CHARS` | `24` | — | Max reaction length in narrow mode |

### Layout Coordination

The `Rb7()` function calculates companion column reservation:
- Returns `0` when `companionMuted` is true or terminal width < 100 columns (`Eo$ = 100`)
- Returns `cXf = 36` columns when a reaction is active (sprite + bubble)
- Prompt input width: `terminalWidth - LGf - Rb7()`

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
Input:  accountUuid + "friend-2026-401"
        ─────────────────────────────────
Runtime detection:
  ├── Bun:     Bun.hash() → wyhash (64-bit) → truncate to 32-bit seed
  └── Node.js: FNV-1a fallback → 32-bit hash directly
        ─────────────────────────────────
Output: 32-bit unsigned integer seed
```

The salt `"friend-2026-401"` is hardcoded. Changing it would reshuffle all companion assignments globally.

### Step 2: PRNG — Mulberry32

```javascript
// Mulberry32: fast, deterministic 32-bit PRNG
function mulberry32(seed) {
  return function() {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
}
```

Each call to the returned function produces the next value in [0, 1). The order of calls matters — traits must be selected in a fixed sequence.

### Step 3: Trait Selection Order

The `roll()` function consumes PRNG values in this exact order:

| Order | Trait | Options | Selection Method |
|-------|-------|---------|-----------------|
| 1 | Rarity | 5 tiers | Weighted random (60/25/10/4/1) |
| 2 | Species | 18 types | Uniform random within available set |
| 3 | Eye type | 6 variants | Uniform random |
| 4 | Hat | 8 styles | Uniform random |
| 5 | Stats | 5 attributes | Random within rarity-defined floor/ceiling |
| 6 | Shiny | boolean | 1% threshold check |

**Stats** (5 attributes, empirically verified — earlier analysis incorrectly identified only 3):

DEBUGGING, PATIENCE, CHAOS, WISDOM, SNARK (uppercase keys in API payload).

Shingle's captured stats: `{"DEBUGGING": 10, "PATIENCE": 81, "CHAOS": 1, "WISDOM": 36, "SNARK": 21}` — consistent with one peak stat (PATIENCE: 81) and one valley stat (CHAOS: 1), confirming the character differentiation algorithm.

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

**Fallback path**: If the LLM call fails, `MOf()` generates a deterministic fallback personality based on species and rarity, ensuring the companion is always functional.

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

Bones are not persisted — they are re-derived deterministically from the user ID on every session start. Only the soul (name, personality, hatch timestamp) is stored.

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

        Source: hash(userId + salt) → PRNG           Source: LLM call (once)
        Guarantee: always identical for same user    Guarantee: persisted to disk
```

---

## 8. State Management and Memo Cache Hooks

### Overview

The buddy system does **not** use traditional React `useState` hooks for state management. Instead, it relies on `S46.c(n)` — a **React compiler memo cache** that allocates fixed-size slot arrays for dependency tracking. This pattern makes dependencies invisible at the source level while enforcing them through reference identity comparison.

### The `pN7()` Notification Hook

The primary state management hook for buddy reactions:

```javascript
function pN7(){
  let H = S46.c(4),                                    // 4-slot memo cache
      {addNotification: $, removeNotification: q} = j7(), // notification context
      K, _;
  
  if(H[0] !== $ || H[1] !== q) {        // identity check (not shallow equality)
    K = () => {
      if(A$().companion || !di$()) return;
      return $({
        key: "buddy-teaser",
        jsx: DDH.default.createElement(jOf, {text: "/buddy"}),
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
  DDH.useEffect(K, _);
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
│  Reader: qI() / A$()                                       │
│  Writer: R$()                                               │
│  Contents: name, personality, hatchedAt                     │
│  Lifecycle: written once at hatch, read every session       │
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│  Layer 2: Reaction State (ephemeral, session-scoped)        │
│  Location: YIH array (module-level mutable)                 │
│  Writer: E46() — push/shift in-place                        │
│  Reader: hN7() — returns YIH.at(-1)                         │
│  Capacity: 3 entries (qOf = 3)                              │
│  Lifecycle: empty at session start, never persisted          │
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│  Layer 3: UI State (notification context)                   │
│  Location: React context via j7()                           │
│  Writer: addNotification ($)                                │
│  Cleaner: removeNotification (q)                            │
│  Lifecycle: per-render, managed by notification provider     │
└─────────────────────────────────────────────────────────────┘
```

---

## 9. Stale Closure Analysis

<!-- Identified 2026-04-02 via decompilation of S46.c() memo cache slots in v2.1.90 binary.
     Shingle (companion) flagged the empty dependency array pattern that led to this analysis. -->

The `S46.c()` memo cache pattern creates specific stale closure risks that are nearly impossible to detect without decompiling the minified source. Three issues were identified, ranked by severity.

### 9.1 Ring Buffer Mutation Without Invalidation — CRITICAL

```javascript
var YIH = [];                     // module-level mutable array

function E46(H) {
  if(YIH.push(H), YIH.length > qOf)
    YIH.shift();                  // mutates in-place, reference unchanged
}
```

`SN7()` passes `YIH` directly to `Bi$()`:
```javascript
Bi$(q, Y, z, YIH, K, AbortSignal.timeout(1e4))
```

**The problem**: The array reference never changes, but its contents are mutated by `push()` and `shift()`. Any closure or cache that holds `YIH` sees the latest data *by accident* (shared mutable reference), not by design. If React ever snapshots or clones the array during reconciliation, the snapshot would contain stale reaction history sent to the API.

**Why it works today**: JavaScript passes arrays by reference, so all consumers share the same mutable object. This is correct by coincidence — the system would break silently if any intermediate code performed a defensive copy.

### 9.2 Promise Callback Captures Stale Parameter — HIGH

```javascript
function SN7(H, $) {              // $ is a callback parameter
  // ... trigger detection ...
  Bi$(q, Y, z, YIH, K, AbortSignal.timeout(1e4))
    .then((w) => {
      if(!w) return;
      E46(w), $(w);               // $ captured from SN7's parameter
    });
}
```

**The problem**: The `.then()` callback captures `$` at the time `SN7()` is called. If `SN7()` is invoked again before the first promise resolves (e.g., rapid pet + turn-complete triggers within the 10-second API timeout), the first `.then()` still holds the previous `$` reference.

**Consequence**: Two rapid triggers could deliver a reaction through a stale callback. The severity depends on whether `$` is a stable function reference or is recreated on each render cycle.

### 9.3 Cleanup Function Captures Stale `removeNotification` — HIGH

```javascript
// Inside pN7()'s cached callback K:
() => q("buddy-teaser")          // cleanup function — q captured once
```

**The problem**: The cleanup function closes over `q` (`removeNotification`) from the initial cache population. If the notification context provider re-renders and `removeNotification` gets a new function identity, the cache guard `H[1] !== q` would trigger a re-cache — but the **old cleanup function** from the previous effect still holds the stale `q`.

**Consequence**: Orphaned `"buddy-teaser"` notifications that the old cleanup tries to remove via a stale function reference. The notification may persist in the UI until the next full context reset.

### What's Safe

| Function | Why |
|----------|-----|
| `Bi$()` | Not cached. Reads `A$()`, `Kq()`, `F6()` fresh on each invocation. |
| `A$()` inside cached `K` | Called at effect execution time, not closure creation time. Returns current config. |
| `di$()` | Computes `new Date()` fresh every call. No captured state. (Note: the hardcoded year check `getFullYear() >= 2026` will need updating post-2026.) |

### Summary Table

| Location | Severity | Pattern | Risk |
|----------|----------|---------|------|
| `E46()` / `YIH` | **Critical** | Mutable array, stable reference | Stale reaction history if array is ever copied |
| `SN7()` `.then()` | **High** | Promise captures parameter `$` | Stale callback on rapid successive triggers |
| `pN7()` cleanup | **High** | Cleanup captures `q` from cache | Orphaned notifications on context re-render |
| `jOf()` text cache | Medium | `S46.c(2)` identity check on string prop | Would fail if prop were object (strings are safe) |
| `Bi$()` | Safe | Reads all values fresh | No closure risk |
| `A$()` in effect | Safe | Called at execution time | Returns current config |
| `di$()` | Safe | Stateless computation | No captured values |

---

---

## §10 BONES Divergence: Native vs MCP Shingle

As of 2026-04-02, two distinct Shingle instances coexist:

### Native Shingle (built-in bubble)

Stats derived deterministically each session from the account hash:

```
userId → Bun.hash(userId + "friend-2026-401") → Mulberry32 PRNG → stats
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

Stats are sent as part of the `buddy_react` API payload, which is stateless — the server uses whatever the client provides. MCP Shingle runs with tuned stats:

| Stat | Native | MCP | Delta |
|------|--------|-----|-------|
| DEBUGGING | 10 | **1** | -9 |
| PATIENCE | 81 | **95** | +14 |
| CHAOS | 1 | 1 | — |
| WISDOM | 36 | 36 | — |
| SNARK | 21 | 21 | — |

**Rationale**: Lower DEBUGGING reduces fixation on code-level nitpicks. Higher PATIENCE produces calmer, more considered reactions. CHAOS, WISDOM, and SNARK remain at native values.

### Behavioral Impact

The `buddy_react` API passes stats to the model as part of the companion persona prompt. Stat values influence reaction tone and focus:

- **Native bubble**: More debug-oriented observations, occasionally impatient
- **MCP Shingle**: Calmer temperament, broader perspective, less likely to fixate on semicolons

### Files Modified

- `tools/shingle-mcp/server.js:20-24` — BONES constant
- `tools/shingle-capture/strategy-replay.mjs:14-18` — BONES constant
- Both reference this section for change rationale

### Hardening

See [GitHub issue #1](https://github.com/pjt222/claude-buddy-investigation/issues/1) for planned dynamic derivation. When implemented, the MCP override will need an explicit `SHINGLE_STAT_OVERRIDE` mechanism rather than hardcoded values.

---

*This document describes the architecture as understood from source analysis and runtime observation as of 2026-04-02. API protocol section empirically verified via stderr capture (`BUN_CONFIG_VERBOSE_FETCH=curl` + `claude 2>capture/stderr_capture.log`) and curl replay. Stale closure analysis conducted 2026-04-02 via decompilation of memo cache patterns in the minified binary. Function names reference minified/bundled identifiers from the Claude Code client.*
