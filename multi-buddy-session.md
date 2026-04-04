# Multi-Buddy Session Proposal

## Overview

A **multi-buddy session** allows multiple companion instances — each with distinct configs, personalities, and skill sets — to coexist in a single Claude Code session. Companions observe the same transcript but react through independent channels, each filtered through their unique personality and equipped almanac skills.

Today's buddy system is 1:1: one user, one companion, one reaction stream. This proposal extends it to 1:N, where a **session roster** of 2-5 buddies each occupy their own UI lane and carry specialized **almanac skills** that shape how they respond.

---

## Session Roster

A multi-buddy session is defined by a roster file that maps named slots to companion configs:

```json
{
  "session": "deep-focus",
  "slots": [
    {
      "slot": "primary",
      "config": {
        "name": "Shingle",
        "personality": "Perches silently in your editor margins, watching you debug with almost supernatural calm.",
        "species": "owl",
        "skills": ["meditate", "breath"]
      }
    },
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

### Slot Rules

| Slot | UI Position | Priority | Max Bubble Width |
|------|-------------|----------|------------------|
| `primary` | Right margin (current position) | Highest — reacts first | 36 cols |
| `secondary` | Below primary | Normal — 2s delay after primary | 28 cols |
| `tertiary` | Below secondary | Lowest — 4s delay, suppressed if terminal < 120 cols | 24 cols |

Only the `primary` slot is required. A multi-buddy session with one slot is equivalent to the current single-buddy behavior.

---

## Agent Almanac Skills

Each buddy can be assigned **almanac skills** — behavioral modes that modify how the companion interprets triggers and shapes reactions. Skills are not tools (they don't execute code); they are **prompt modifiers** injected into the `buddy_react` payload.

### `meditate`

**Mode:** Active (companion initiates)
**Trigger affinity:** `idle`, `silence`, `turn` (low-activity)
**Cooldown:** 60 seconds

When equipped, the companion periodically offers a grounding moment during pauses in the session. The reaction API receives an additional field:

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
- Scales frequency with session length: more frequent after 60 min, 90 min, 120 min thresholds
- Personality shapes the meditation style (Shingle's meditations are terse; a capybara's would be languid)

---

### `dream`

**Mode:** Passive (companion reflects)
**Trigger affinity:** `large-diff`, `complete`, `turn` (after milestone)
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
- Only fires after a significant milestone (large diff committed, test suite passes, feature complete)
- Dreams reference actual files and patterns from the session transcript
- Never gives direct advice — always framed as a dream, vision, or idle thought
- Suppressed during rapid-fire error→fix cycles (companion is "too awake to dream")
- One dream per major milestone; cannot fire twice on the same diff

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
- Only triggers when frustration signal is `medium` or `high` (2+ errors in 5 min, or retry pattern detected)
- Breathing pattern always follows 4-count box breathing or 4-7-8 technique
- Companion personality determines framing (owl: clinical; ghost: empathetic; cactus: dry)
- Never says "calm down" — always leads by doing (the companion breathes first)
- Maximum 2 breath interventions per 15-minute window to avoid patronizing

---

## Skill Interaction Matrix

When a buddy has multiple skills, they can compose:

| Trigger | meditate + breath | meditate + dream | dream + breath | All three |
|---------|-------------------|-------------------|----------------|-----------|
| `error` | breath takes priority | meditate suppressed | breath takes priority | breath |
| `idle` | meditate | meditate | dream (if milestone) | meditate |
| `large-diff` | meditate (after calm) | dream | dream | dream |
| `test-fail` | breath | meditate suppressed | breath | breath |
| `turn` (normal) | meditate (if >5 min) | dream (if milestone) | — | lowest-cooldown skill |
| `turn` (post-milestone) | meditate | dream | dream | dream |

**Resolution rule:** When multiple skills could fire on the same trigger, the skill with the **highest urgency** wins. Urgency: `breath` > `dream` > `meditate`. The losing skill's cooldown is not consumed.

---

## Multi-Buddy Reaction Orchestration

### Turn Sequence

```
1. Trigger fires (e.g., turn-end with error detected)
     │
2. Roster consulted — each slot evaluates independently:
     ├─ Slot 1 (Shingle):  trigger=error, skills=[meditate,breath] → breath wins
     ├─ Slot 2 (Ponder):   trigger=error, skills=[dream,meditate] → meditate suppressed, dream suppressed (error context) → skip
     └─ Slot 3 (Gust):     trigger=error, skills=[breath,dream]   → breath wins
     │
3. Deduplication pass:
     ├─ Shingle: breath reaction (rendered)
     ├─ Ponder:  (suppressed — no eligible skill)
     └─ Gust:    breath reaction (rendered, but deduped against Shingle's — different personality yields different text)
     │
4. Staggered rendering:
     ├─ t+0ms:   Shingle's bubble appears
     ├─ t+2000ms: (Ponder silent)
     └─ t+4000ms: Gust's bubble appears
```

### Addressed Behavior

When the user mentions a specific buddy by name:

- Only that buddy reacts (other slots suppressed for this turn)
- The addressed buddy bypasses its cooldown (existing behavior)
- The addressed buddy uses its highest-priority eligible skill, or reacts skill-free if no skill fits the context

When the user addresses "everyone" or "buddies":

- All slots react with staggered timing
- Each uses their personality + top skill for the context

---

## Session Presets

### `deep-focus` (Meditative coding)

```
Shingle (owl)      — meditate, breath
Ponder (mushroom)  — dream, meditate
```

Two buddies. Shingle keeps you grounded; Ponder offers lateral insights at milestones. Good for long refactoring sessions.

### `debug-squad` (Error-heavy sessions)

```
Shingle (owl)      — breath
Fizz (axolotl)     — breath, dream
Clank (robot)      — meditate
```

Three buddies optimized for high-error-density work. Two breath-equipped companions ensure coverage. Clank offers meditation once the storm passes.

### `dream-lab` (Exploratory/creative coding)

```
Ponder (mushroom)  — dream
Wisp (ghost)       — dream, meditate
Noodle (octopus)   — dream, breath
```

Heavy on dream skills. Best for greenfield prototyping where lateral associations have the most value.

### `solo-zen` (Single buddy, full almanac)

```
Shingle (owl)      — meditate, dream, breath
```

One companion with all three skills. Equivalent to current single-buddy behavior plus almanac awareness.

---

## CLI Extension: `buddy-config.mjs session`

New commands added to the existing CLI tool:

```
buddy-config session create <name>        Create a new multi-buddy session
buddy-config session list                 List saved sessions
buddy-config session show <name>          Show session roster and skills
buddy-config session activate <name>      Set session as active for next Claude Code launch
buddy-config session add-buddy <session>  Add a buddy slot to a session (interactive)
buddy-config session remove-buddy <session> <slot>
buddy-config session set-skill <session> <slot> <skill>
buddy-config session unset-skill <session> <slot> <skill>
buddy-config session preset <preset-name> Create session from built-in preset
```

Session files stored at `~/.claude/sessions/<name>.json`.

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

When `activeSession` is set, the buddy system reads the session roster file instead of using the single-companion config. If the session file is missing or invalid, it falls back to single-buddy mode silently.

---

## API Extension

The `buddy_react` payload gains optional fields when a session is active:

```json
{
  "name": "Shingle",
  "personality": "...",
  "species": "owl",
  "rarity": "common",
  "stats": { "DEBUGGING": 10, "PATIENCE": 81, "CHAOS": 1, "WISDOM": 36, "SNARK": 21 },
  "transcript": "user: ...\nclaude: ...",
  "reason": "error",
  "recent": [],
  "addressed": false,
  "slot": "primary",
  "skill": "breath",
  "skill_context": {
    "error_count_last_5min": 3,
    "retry_pattern": true,
    "session_duration_min": 47,
    "frustration_signal": "high"
  },
  "roster_context": {
    "total_slots": 3,
    "other_buddies": ["Ponder", "Gust"],
    "other_recent_reactions": ["*spores drift slowly* That function has been rewritten three times now."]
  }
}
```

The `roster_context` field lets each buddy be aware of the others' recent reactions, preventing redundancy and enabling conversational interplay between companions.

---

## UI Layout

```
Terminal (>= 120 cols):

┌─────────────────────────────────────────────────┬─────────────────────────┐
│                                                 │  ╭─────────────────╮    │
│  claude> working on the parser refactor...      │  │ In... 2... 3... │    │
│                                                 │  │ Hold... 2... 3  │    │
│  Error: unexpected token at line 47             │  ╰───────┬─────────╯    │
│  Error: unexpected token at line 52             │      /\_/\│             │
│  Error: type mismatch in merge_tokens()         │     (o  o)             │
│                                                 │     (  >  )  Shingle   │
│                                                 │  ╭─────────────╮       │
│                                                 │  │  (silent)   │       │
│                                                 │  ╰──────┬──────╯       │
│                                                 │      ,--,│             │
│                                                 │     ( oo )  Ponder     │
│                                                 │  ╭─────────────────╮   │
│                                                 │  │ Four errors in  │   │
│                                                 │  │ three minutes.  │   │
│                                                 │  │ Breathe with me │   │
│                                                 │  ╰──────┬──────────╯   │
│                                                 │     .--. │             │
│                                                 │    ( °° ) Gust         │
└─────────────────────────────────────────────────┴─────────────────────────┘

Terminal (100-119 cols): Only primary slot rendered
Terminal (< 100 cols):  All buddies hidden (existing behavior)
```

---

## Open Questions

1. **Persistence scope:** Should almanac skill assignments persist per-session-file only, or should they also be derivable from the companion's stats? (e.g., high PATIENCE naturally grants meditate)
2. **Cross-buddy conversation:** Should buddies be able to react to each other's bubbles, or only to the user's transcript?
3. **Skill discovery:** Should new almanac skills unlock based on session milestones (e.g., `dream` unlocks after 100 sessions)?
4. **Hatch independence:** Should secondary/tertiary buddies require separate hatch events, or can they be "summoned" from a preset species pool?
5. **Ring buffer sharing:** One shared ring buffer across slots, or independent buffers per buddy?
