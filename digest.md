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

### Trigger Detection (`AOf()`)

Nine trigger reasons drive companion reactions:

| Trigger | Detection Method |
|---------|-----------------|
| `turn` | New assistant turn |
| `hatch` | Initial companion creation |
| `pet` | User runs `/buddy pet` |
| `test-fail` | Regex: `/\b[1-9]\d* (failed\|failing)\b/` |
| `error` | Regex: `/\berror:\|\bexception\b\|\btraceback\b/` |
| `large-diff` | Diff output exceeding changed-lines threshold |
| `complete` | Task completion signals |
| `idle` | Extended inactivity |
| `silence` | Prolonged silence (distinct threshold from idle — exact distinction unresolved) |

Direct addressing is detected separately by `zOf()`: regex match on the companion's name in the last user message, setting the `addressed` boolean in the API payload.

### API Call

```
POST /api/organizations/{orgUUID}/claude_code/buddy_react
```

Payload fields:
- `name` (max 32 chars), `personality` (max 200 chars)
- `species`, `rarity`, `stats`
- `transcript` (max 5000 chars) — built by `HOf()` from last 12 messages, 300 chars each, user+assistant only
- `reason` (one of 9 triggers)
- `recent` (array of 3, max 200 chars each) — ring buffer `YIH` of last 3 reactions, sent for continuity
- `addressed` (boolean)

### Cooldown

**30 seconds** between reactions (`$Of = 30000`). The ring buffer ensures the companion doesn't repeat itself across consecutive reactions.

### Model and Cost

Reactions use the **main loop model** via the server-side endpoint. The UI displays *"Your buddy won't count toward your usage"* after hatch — this claim only makes economic sense if the server-side endpoint uses an efficient model, which remains an open question (see Open Questions).

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

### Species Face Strings

Used for attribution/display: owl `(o>`, cat `(oo)`, fox `=oωo=` (others exist in source).

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

*"Your buddy won't count toward your usage"* implies the server-side reaction endpoint uses a cost-efficient model. If reactions truly run on the main session model (as client-side evidence suggests), the cost per reaction is non-trivial. The exact server-side model remains unconfirmed.

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

### Partially Resolved

2. **Speech bubble TTL** — **CONFLICTING EVIDENCE.** Binary analysis found constants suggesting a 10-second auto-clear (`v16 = 20` ticks × `yo$ = 500`ms, with fade-out starting at 7s). However, a separate analysis found no `setTimeout`-based dismissal and concluded the bubble persists via React state until replaced by the next reaction. Empirical testing needed — protocol at `tools/test-protocol.md`.

5. **`idle` vs `silence` distinction** — **PARTIALLY RESOLVED.** The 30-second cooldown (`$Of = 30000`) and large-diff threshold (`KOf = 80` lines) are confirmed. A session scan interval of 10 minutes (`SESSION_SCAN_INTERVAL_MS = 600000`) was found in autoDream logic but is unrelated to reaction triggers. The specific idle/silence thresholds remain undiscovered in the binary and are not documented in any public source.

### Unresolvable from Public Sources

1. **Server-side reaction model** — **UNRESOLVABLE.** Exhaustive web search (deepwiki, dev.to, GitHub, gists, HN) found no documentation of the server-side model. No community member has intercepted the `buddy_react` API call. Would require network proxy interception of a live session.

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

*Initial investigation conducted 2026-04-02 (11 agents, 2 waves). Follow-up investigation same day (3-agent team for open questions). Config CLI utility available at `tools/buddy-config.mjs`.*
