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
| `Bi$()` | **Reaction API sender.** Sends POST to `buddy_react` endpoint with 6 parameters: companion config, transcript, trigger reason, recent context, addressed flag, abort signal. |
| `E46()` | **Ring buffer store.** Maintains a fixed-size circular buffer of recent reactions for context continuity and deduplication. |

### UI and Prompt Integration

| Function | Role |
|----------|------|
| `Loq()` | **companion_intro injector.** Attaches a `companion_intro` message to the conversation history, informing the main agent about the companion's existence, name, and species. |
| `Xoq()` | **System prompt template builder.** Constructs the system-reminder block that tells the main agent how to coexist with the companion (defer when addressed, don't impersonate). |
| `Fi$()` | **Sprite renderer.** Renders the companion's ASCII art from species template + eye injection + hat overlay. Handles 3-frame animation cycle. |
| `FN7()` | **Face string builder.** Constructs the attribution line shown in the speech bubble header (companion name + species for identification). |
| `IN7()` | **Pet handler.** Responds to `/pet` or affectionate interaction commands with a special reaction animation or message. |

---

## 4. API Protocol

### Endpoint

```
POST /api/organizations/{orgUUID}/claude_code/buddy_react
```

### Authentication

| Header | Value |
|--------|-------|
| `Authorization` | `Bearer {session_token}` |
| `anthropic-beta` | Feature flag header (enables buddy endpoint) |
| `Content-Type` | `application/json` |

### Request Payload

```json
{
  "companion": {
    "name": "Shingle",
    "personality": "Perches silently in your editor margins...",
    "species": "owl",
    "rarity": "common"
  },
  "transcript": [
    {"role": "user", "content": "...truncated to 300 chars..."},
    {"role": "assistant", "content": "...truncated to 300 chars..."}
  ],
  "reason": "test-fail | error | large-diff | turn-end | addressed",
  "recent": ["previous reaction 1", "previous reaction 2"],
  "addressed": false,
  "signal": "<AbortSignal>"
}
```

**Constraints:**
- `transcript`: Last 12 messages, each truncated to 300 characters
- `recent`: From `E46()` ring buffer — recent reactions for context
- `addressed`: Boolean — true when user mentioned companion by name
- `signal`: AbortSignal for client-side cancellation

### Response

```json
{
  "reaction": "string — the companion's speech bubble text"
}
```

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
6. Bubble remains visible until next turn or timeout
          │
7. Reaction stored in E46() ring buffer
```

### Layout Coordination

The `companionReservedColumns()` function calculates horizontal space needed for the sprite + speech bubble, ensuring the main prompt input area is not occluded. The terminal width minus reserved columns determines the available input width.

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
| 5 | Stats | 3 attributes | Random within rarity-defined floor/ceiling |
| 6 | Shiny | boolean | 1% threshold check |

**Stats by rarity floor:**

| Rarity | Debugging (min) | Patience (min) | Chaos (min) |
|--------|----------------|----------------|-------------|
| Common | low | low | low |
| Uncommon | moderate | moderate | low |
| Rare | moderate | moderate | moderate |
| Epic | high | high | moderate |
| Legendary | high | high | high |

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
    debugging: number;
    patience: number;
    chaos: number;
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
        ├── stats {debugging, patience, chaos}
        └── shiny

        Source: hash(userId + salt) → PRNG           Source: LLM call (once)
        Guarantee: always identical for same user    Guarantee: persisted to disk
```

---

*This document describes the architecture as understood from source analysis and runtime observation as of 2026-04-02. Function names reference minified/bundled identifiers from the Claude Code client.*
