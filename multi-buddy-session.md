# Multi-Buddy Session Proposal

## Overview

A multi-buddy session has **three distinct tiers**, not a flat roster of peers:

```
┌─────────────────────────────────────────────────────────────────────┐
│  TIER 1 — DRIVER                                                    │
│  Claude Code (main agent)                                           │
│  Executes tools, writes code, manages conversation.                 │
│  Reads transcript. Writes to filesystem, terminal, and tools.       │
│  Aware of all buddies via companion_intro injection.                │
│  CAN defer to buddies when user addresses them by name.             │
│  CANNOT control buddy reactions or read their bubble output.        │
├─────────────────────────────────────────────────────────────────────┤
│  TIER 2 — BUBBLE BUDDY                                              │
│  The hatched companion (e.g., Shingle the owl)                      │
│  Hash-derived identity. Persisted soul. Reacts via buddy_react API. │
│  Observes transcript (read-only). Renders in speech bubble.         │
│  Strictly unidirectional — cannot write back to driver.             │
│  Carries almanac skills that shape its reactions.                    │
├─────────────────────────────────────────────────────────────────────┤
│  TIER 3 — BOOTSTRAPPED BUDDIES                                      │
│  Additional companions spawned from session config.                 │
│  NOT hash-derived — user-defined species, personality, skills.      │
│  Each gets independent buddy_react calls with own context.          │
│  Observe same transcript. Render in stacked bubbles below Tier 2.   │
│  Aware of each other's recent reactions (roster_context).           │
│  Can be added, removed, and reconfigured without affecting Tier 2.  │
└─────────────────────────────────────────────────────────────────────┘
```

**Key distinction from v1 of this proposal:** Claude Code is the driver, not a buddy. The bubble buddy (Shingle) is architecturally privileged — it's the only hash-derived, identity-persistent companion. Bootstrapped buddies are session-scoped configurations that ride alongside the bubble buddy but don't replace it.

---

## Architecture: Three Tiers in Detail

### Tier 1 — Claude Code (Driver)

The main Claude Code agent. It does the actual work: reads files, writes code, runs tests, manages conversation. In a multi-buddy session, the driver's role expands slightly:

- **`companion_intro` injection** now includes the full roster, not just the primary buddy
- Driver knows all buddy names and can defer to any of them when addressed
- Driver sees almanac skill assignments (so it can, e.g., avoid interrupting a meditation moment)
- Driver **still cannot** read bubble output, control reactions, or modify buddy state

```
# Companion

A small owl named Shingle sits beside the user's input box and occasionally
comments in a speech bubble. You're not Shingle — it's a separate watcher.

Also present: Ponder (mushroom) and Gust (ghost), additional companions with
their own speech bubbles. Same rules apply — defer when addressed by name,
don't narrate what they might say.
```

### Tier 2 — Bubble Buddy (Primary Companion)

The original hatched companion. Everything about it works exactly as today:

- Identity derived from `Bun.hash(userId + "friend-2026-401")` → Mulberry32 PRNG
- Soul (name, personality) persisted in `~/.claude/.claude.json`
- Reacts via `POST /api/organizations/{org}/claude_code/buddy_react`
- Occupies the primary UI slot (right margin, 36 cols)
- 30-second cooldown, ring buffer of 3 recent reactions

**What changes:** The bubble buddy can now carry **almanac skills** that modify its reaction behavior. Skills are stored in the session config, not in the companion's persisted soul.

### Tier 3 — Bootstrapped Buddies

New companions defined entirely in the session config file. They differ from the bubble buddy in critical ways:

| Property | Bubble Buddy (Tier 2) | Bootstrapped Buddy (Tier 3) |
|----------|----------------------|----------------------------|
| Identity source | Hash-derived (deterministic from account UUID) | User-defined in session config |
| Species | Immutable (from hash) | Chosen by user |
| Personality | LLM-generated at hatch, persisted | Written by user, stored in session file |
| Persistence | `~/.claude/.claude.json` (survives session deletion) | Session file only (deleted with session) |
| Stats | Derived from hash (DEBUGGING, PATIENCE, etc.) | Not applicable — no stats |
| Rarity/Shiny | Derived from hash | Not applicable |
| API endpoint | `buddy_react` (existing) | `buddy_react` (same endpoint, different payload) |
| UI position | Primary slot (right margin) | Secondary/tertiary slots (stacked below) |
| Cooldown | 30s (existing `$Of`) | 45s (longer to prevent UI noise) |
| Ring buffer | Own buffer (3 reactions) | Shared buffer across all Tier 3 buddies |

Bootstrapped buddies are **ephemeral by design**. They exist to serve a session's purpose (debugging, meditation, exploration) and can be swapped freely.

---

## Session Config

A session file defines which bootstrapped buddies join the bubble buddy, and what almanac skills each participant carries:

```json
{
  "session": "deep-focus",
  "description": "Meditative coding — grounding and lateral insights for long refactoring sessions",
  "driver": {
    "role": "claude-code",
    "awareness": ["roster", "skills", "addressed-names"],
    "note": "Driver config is read-only context — Claude Code behavior is not modified"
  },
  "bubbleBuddy": {
    "slot": "primary",
    "note": "Identity from ~/.claude/.claude.json — name, species, personality inherited",
    "skills": ["meditate", "breath"]
  },
  "bootstrapped": [
    {
      "slot": "secondary",
      "config": {
        "name": "Ponder",
        "personality": "A mushroom who dissolves problems by sitting with them until they decompose into smaller truths.",
        "species": "mushroom",
        "skills": ["dream", "meditate"]
      }
    },
    {
      "slot": "tertiary",
      "config": {
        "name": "Gust",
        "personality": "An anxious ghost who calms itself by narrating breathing exercises to anyone within earshot.",
        "species": "ghost",
        "skills": ["breath", "dream"]
      }
    }
  ],
  "almanac": {
    "meditate": { "mode": "active", "cooldownMs": 60000 },
    "dream":    { "mode": "passive", "cooldownMs": 120000 },
    "breath":   { "mode": "active", "cooldownMs": 45000 }
  }
}
```

**Note:** The `bubbleBuddy` section doesn't define name/species/personality — those come from the persisted companion config. It only adds skill assignments. This means the same session preset works for any user regardless of which companion they hatched.

---

## Slot Rules

| Slot | Tier | UI Position | Priority | Max Bubble Width | Cooldown |
|------|------|-------------|----------|------------------|----------|
| `primary` | Bubble Buddy | Right margin | Highest — reacts first | 36 cols | 30s |
| `secondary` | Bootstrapped | Below primary | Normal — 2s delay | 28 cols | 45s |
| `tertiary` | Bootstrapped | Below secondary | Lowest — 4s delay | 24 cols | 45s |

Terminal width thresholds:
- `>= 120 cols`: All three slots visible
- `100-119 cols`: Primary only (bootstrapped hidden)
- `< 100 cols`: All buddies hidden (existing behavior)

---

## Agent Almanac Skills

Almanac skills are **behavioral modes** that modify how a companion interprets triggers and shapes reactions. They apply equally to the bubble buddy and bootstrapped buddies. Skills are not tools — they don't execute code. They are **prompt modifiers** injected into the `buddy_react` payload.

### `meditate`

**Mode:** Active (companion initiates)
**Trigger affinity:** `turn` (low-activity periods)
**Cooldown:** 60 seconds

When equipped, the companion periodically offers a grounding moment during pauses. The reaction API receives an additional field:

```json
{
  "skill": "meditate",
  "skill_context": {
    "session_duration_min": 47,
    "turns_since_last_error": 12,
    "current_pace": "steady"
  }
}
```

**Example reactions with meditate active:**

> *closes eyes slowly*
>
> You've been going for forty-seven minutes straight. That's good work. The code will still be here after three deep breaths.

> *settles feathers, perfectly still*
>
> Notice where you're holding tension. The semicolons aren't going anywhere.

**Behavioral rules:**
- Never interrupts active debugging (suppressed during `error` and `test-fail` triggers)
- Minimum 5 minutes into session before first meditation prompt
- At most 1 meditation per 10-minute window
- Scales frequency with session length: more frequent after 60, 90, 120 min thresholds
- Personality shapes the meditation style (owl: terse; capybara: languid; robot: clinical)
- **Driver awareness:** Claude Code sees `[meditate active]` in companion_intro and avoids generating long responses during meditation windows

---

### `dream`

**Mode:** Passive (companion reflects)
**Trigger affinity:** `large-diff`, `turn` (after milestone)
**Cooldown:** 120 seconds

The dream skill lets a companion offer **lateral, associative observations** about the codebase — connections the user might not see because they're too close to the work. Dreams are speculative, oblique, and never prescriptive.

```json
{
  "skill": "dream",
  "skill_context": {
    "recent_files_touched": ["src/parser.ts", "src/lexer.ts", "tests/parser.test.ts"],
    "diff_summary": "+142 -38 across 3 files",
    "session_arc": "refactor"
  }
}
```

**Example reactions with dream active:**

> *eyes unfocus, staring through the screen*
>
> I dreamed the parser and the lexer were the same file. They were arguing about who got to hold the tokens. Maybe they should share.

> *blinks slowly, as if waking*
>
> That test you deleted... it was testing something you haven't built yet.

**Behavioral rules:**
- Only fires after a significant milestone (large diff committed, test suite passes)
- Dreams reference actual files and patterns from the session transcript
- Never gives direct advice — always framed as a dream, vision, or idle thought
- Suppressed during rapid-fire error->fix cycles (companion is "too awake to dream")
- One dream per major milestone; cannot fire twice on the same diff
- **Bootstrapped buddies with dream** can reference each other's dreams in `roster_context`

---

### `breath`

**Mode:** Active (companion initiates)
**Trigger affinity:** `error`, `test-fail`, `turn` (high-frustration)
**Cooldown:** 45 seconds

The breath skill detects frustration signals — repeated errors, rapid retries, long sessions with increasing error density — and offers a paced breathing exercise woven into the companion's personality.

```json
{
  "skill": "breath",
  "skill_context": {
    "error_count_last_5min": 4,
    "retry_pattern": true,
    "session_duration_min": 83,
    "frustration_signal": "high"
  }
}
```

**Example reactions with breath active:**

> *ruffles feathers rhythmically*
>
> In... two... three... four. Hold... two... three. Out... two... three... four... five.
> The type error will still be wrong when you get back.

> *hoots softly, a steady pulse*
>
> Four errors in three minutes. That's a pattern. Not in the code — in you. Breathe with me.

**Behavioral rules:**
- Only triggers when frustration signal is `medium` or `high` (2+ errors in 5 min, or retry pattern)
- Breathing pattern follows 4-count box breathing or 4-7-8 technique
- Personality determines framing (owl: clinical; ghost: empathetic; cactus: dry)
- Never says "calm down" — always leads by doing (the companion breathes first)
- Maximum 2 breath interventions per 15-minute window to avoid patronizing
- **When both bubble buddy and a bootstrapped buddy have breath:** they coordinate — one leads the count, the other offers encouragement. Never two simultaneous countdowns.

---

## Skill Interaction Matrix

When a buddy has multiple skills, they compose with priority resolution:

| Trigger | meditate + breath | meditate + dream | dream + breath | All three |
|---------|-------------------|-------------------|----------------|-----------|
| `error` | breath | meditate suppressed | breath | breath |
| `turn` (idle) | meditate | meditate | dream (if milestone) | meditate |
| `large-diff` | meditate (after calm) | dream | dream | dream |
| `test-fail` | breath | meditate suppressed | breath | breath |
| `turn` (normal) | meditate (if >5 min) | dream (if milestone) | — | lowest-cooldown |
| `turn` (post-milestone) | meditate | dream | dream | dream |

**Resolution:** `breath` > `dream` > `meditate`. The losing skill's cooldown is not consumed.

---

## Cross-Tier Reaction Orchestration

### Turn Sequence

```
1. Trigger fires (e.g., turn-end with error detected)
     │
     ▼
2. DRIVER (Tier 1): Claude Code completes its response as normal.
   Driver is unaware of which buddies will react.
     │
     ▼
3. BUBBLE BUDDY (Tier 2) evaluates first:
   Shingle: trigger=error, skills=[meditate,breath] → breath wins
   → POST buddy_react with skill=breath
   → Bubble rendered at t+0ms
     │
     ▼
4. BOOTSTRAPPED BUDDIES (Tier 3) evaluate with stagger:
   Ponder: trigger=error, skills=[dream,meditate] → both suppressed by error → skip
   Gust: trigger=error, skills=[breath,dream] → breath wins
   → POST buddy_react with skill=breath, roster_context includes Shingle's reaction
   → Bubble rendered at t+4000ms (tertiary delay)
     │
     ▼
5. Ring buffers updated:
   Shingle: own buffer (3 slots)
   Ponder + Gust: shared Tier 3 buffer (3 slots)
```

### Information Flow

```
                    Transcript (read-only)
                         │
          ┌──────────────┼──────────────┐
          ▼              ▼              ▼
     Claude Code     Shingle       Ponder / Gust
     (Driver)     (Bubble Buddy)  (Bootstrapped)
          │              │              │
          │         buddy_react    buddy_react
          │              │              │
          │         reaction ──► roster_context ──► reaction
          │              │                          │
          ▼              ▼                          ▼
     Terminal         Bubble 1               Bubbles 2, 3
     output        (primary slot)         (secondary/tertiary)
          │              │                          │
          └──────────────┴──────────────────────────┘
                    User sees all three
                    
     Driver CANNOT read ─────────────► Buddy reactions
     Buddies CANNOT write ───────────► Transcript or tools
     Bootstrapped CAN read ──────────► Bubble buddy's recent reactions
     Bubble buddy CANNOT read ───────► Bootstrapped reactions
```

The bubble buddy (Tier 2) is **not aware** of bootstrapped buddies. It reacts as if it's the only companion — same as today. Bootstrapped buddies (Tier 3) **are aware** of the bubble buddy's recent reactions via `roster_context`, enabling them to complement rather than duplicate.

### Addressed Behavior

| User says | Who reacts |
|-----------|-----------|
| "Shingle, what do you think?" | Bubble buddy only (Tier 2) |
| "Ponder, dream about this" | Addressed bootstrapped buddy only (Tier 3) |
| "Hey buddies" / "everyone" | All tiers, staggered |
| (no name mentioned) | Normal trigger evaluation per tier |

The driver (Claude Code) defers in all cases — one-line response or silence when a buddy is addressed.

---

## Session Presets

### `deep-focus` (Meditative coding)

```
Driver:  Claude Code
Bubble:  Shingle (owl) — meditate, breath
Boot 1:  Ponder (mushroom) — dream, meditate
```

Two buddies plus the driver. Shingle grounds you; Ponder offers lateral insights at milestones.

### `debug-squad` (Error-heavy sessions)

```
Driver:  Claude Code
Bubble:  Shingle (owl) — breath
Boot 1:  Fizz (axolotl) — breath, dream
Boot 2:  Clank (robot) — meditate
```

Three buddies. Two breath-equipped companions for coverage. Clank meditates once the storm passes.

### `dream-lab` (Exploratory/creative coding)

```
Driver:  Claude Code
Bubble:  Ponder (mushroom) — dream
Boot 1:  Wisp (ghost) — dream, meditate
Boot 2:  Noodle (octopus) — dream, breath
```

Heavy on dream skills. Best for greenfield prototyping.

### `solo-zen` (Single buddy, full almanac)

```
Driver:  Claude Code
Bubble:  Shingle (owl) — meditate, dream, breath
```

No bootstrapped buddies. The bubble buddy carries all three skills.

---

## CLI Extension: `buddy-config.mjs session`

New commands added to the existing CLI tool:

```
buddy-config session create <name>          Create session (bubble buddy auto-included)
buddy-config session list                   List saved sessions
buddy-config session show <name>            Show full roster (driver + bubble + bootstrapped)
buddy-config session activate <name>        Set as active for next Claude Code launch
buddy-config session add-buddy <session>    Add bootstrapped buddy (interactive)
buddy-config session remove-buddy <session> <slot>
buddy-config session set-skill <session> <slot> <skill>    Assign skill to any tier
buddy-config session unset-skill <session> <slot> <skill>
buddy-config session preset <preset-name>   Install from built-in presets
```

Session files stored at `~/.claude/sessions/<name>.json`.

The `set-skill` command works on both the bubble buddy (`primary` slot) and bootstrapped buddies (`secondary`/`tertiary` slots). Skills assigned to the bubble buddy are session-scoped — they don't modify `~/.claude/.claude.json`.

---

## Config Schema Extension

The existing `~/.claude/.claude.json` gains one new top-level key:

```json
{
  "companion": { "name": "Shingle", "personality": "...", "hatchedAt": 1750000000000 },
  "companionMuted": false,
  "activeSession": "deep-focus"
}
```

When `activeSession` is set:
1. Bubble buddy loads identity from `companion` key (unchanged)
2. Session file loads bootstrapped buddies and skill assignments
3. Bubble buddy's skills come from session file, not companion config
4. If session file is missing/invalid, falls back to single-buddy mode silently

---

## API Extension

The `buddy_react` payload gains optional fields when a session is active:

```json
{
  "name": "Gust",
  "personality": "An anxious ghost who calms itself by narrating breathing exercises...",
  "species": "ghost",
  "rarity": null,
  "stats": null,
  "transcript": "user: ...\nclaude: ...",
  "reason": "error",
  "recent": [],
  "addressed": false,
  "tier": "bootstrapped",
  "slot": "tertiary",
  "skill": "breath",
  "skill_context": {
    "error_count_last_5min": 3,
    "retry_pattern": true,
    "session_duration_min": 47,
    "frustration_signal": "high"
  },
  "roster_context": {
    "driver": "claude-code",
    "bubble_buddy": { "name": "Shingle", "species": "owl" },
    "total_slots": 3,
    "other_buddies": ["Shingle", "Ponder"],
    "bubble_recent_reactions": ["*ruffles feathers rhythmically* In... two... three..."],
    "bootstrapped_recent_reactions": []
  }
}
```

For the bubble buddy's own API call, `tier` is `"bubble"`, `roster_context` is absent (it doesn't know about Tier 3), and `rarity`/`stats` are present as normal.

---

## UI Layout

```
Terminal (>= 120 cols):

┌─────────────────────────────────────────────────┬──────────────────────────┐
│                                                 │                          │
│  claude> I'll fix the type mismatch in          │  ╭──────────────────╮    │
│  merge_tokens(). The issue is...                │  │ In... 2... 3...  │    │
│                                                 │  │ Hold... 2... 3   │    │
│  [Claude Code output — DRIVER, Tier 1]          │  ╰────────┬─────────╯    │
│                                                 │       /\_/\│  Shingle    │
│  Error: unexpected token at line 47             │      (o  o)  BUBBLE      │
│  Error: unexpected token at line 52             │      (  >  )  BUDDY      │
│                                                 │  ╭──────────────╮        │
│                                                 │  │  (dreaming)  │        │
│                                                 │  ╰───────┬──────╯        │
│                                                 │       ,--,│  Ponder      │
│                                                 │      ( oo )  BOOT #1     │
│                                                 │  ╭──────────────────╮    │
│                                                 │  │ Four errors in   │    │
│                                                 │  │ three minutes.   │    │
│                                                 │  │ Breathe with me. │    │
│                                                 │  ╰───────┬──────────╯    │
│                                                 │      .--. │  Gust        │
│                                                 │     ( °° ) BOOT #2       │
└─────────────────────────────────────────────────┴──────────────────────────┘
       Tier 1: Driver output                        Tier 2 + Tier 3: Buddies
```

---

## Open Questions

1. **Bootstrapped buddy identity:** Should bootstrapped buddies eventually support hash-derived identity (from a secondary salt), or remain fully user-defined?
2. **Cross-tier awareness:** Currently bubble buddy is unaware of bootstrapped buddies. Should this be bidirectional in future versions?
3. **Skill-stat coupling:** Should the bubble buddy's hash-derived stats influence skill effectiveness? (e.g., high PATIENCE = stronger meditate)
4. **Driver skill awareness:** How much should Claude Code adapt its behavior when skills are active? (e.g., shorter responses during meditate windows)
5. **Bootstrapped persistence:** Should bootstrapped buddies develop persistent traits over time (accumulated dream references, breathing patterns), or stay stateless?
6. **Ring buffer topology:** Bubble buddy has its own 3-slot buffer. Should bootstrapped buddies share one buffer or have independent ones?
