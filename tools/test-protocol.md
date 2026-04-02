# Buddy System — Empirical Test Protocol

**Covers**: Q2 (speech bubble TTL) and Q3 (narrow terminal behavior)  
**Version**: 1.0 — 2026-04-02  
**Status**: Protocol — not yet run

---

## Binary Analysis Summary

Before running empirical tests, this section documents what was extracted from the v2.1.90 binary. These findings narrow what to measure and what to expect.

### Speech Bubble Architecture

There is **no TTL constant** for the speech bubble display duration. The binary reveals that reaction display is driven by React component state (`companionReaction` in app state), and the speech bubble appears as long as `companionReaction !== undefined`. A TTL-style fade is not implemented in the bundle — the bubble persists until the next turn clears it by re-running `SN7()`. Key confirmed constants:

| Constant | Value | Meaning |
|----------|-------|---------|
| `$Of` | `30000` (ms) | Minimum gap between reactions (30 seconds) |
| `qOf` | `3` | Ring buffer depth (last 3 reactions stored for context) |
| `KOf` | `80` | Max lines of diff output before `large-diff` trigger fires |
| API timeout | `10000` (ms) | `AbortSignal.timeout(1e4)` on buddy_react call |

The SN7 function signature (reconstructed):
```
function SN7(messages, setCompanionReaction):
  if muted → return
  if named_match(last_message, companion.name):
    addressed = true, skip cooldown check
  trigger = detect_trigger(last_12_messages)
  if !addressed && !trigger && now - lastReactionTime < 30000 → return
  transcript = build_transcript(last_12_messages)
  if transcript.trim() == "" → return
  lastReactionTime = now
  call Bi$(...) → sets companionReaction via setCompanionReaction callback
```

**Key implication for Q2**: The bubble does NOT auto-dismiss on a timer. It persists until `companionReaction` is cleared. The next question is: what clears it? From the code, `setCompanionReaction` is called on each new reaction (replacing the old one), and appears to be set to `undefined` or `null` when muted or when no reaction fires. Empirical testing is needed to confirm whether the UI renders the previous reaction while a new one is loading, or blanks it immediately.

### Column Reservation Architecture

The layout formula (reconstructed from the component):
```
_t  = Rb7(LQ, Kt)          // companion reserved cols: f(terminalWidth, hasReaction)
yj  = LQ - LGf - _t        // text input width
KZ  = LQ - _t              // full usable width
```

Where:
- `LQ` = terminal columns (from `H6().columns`)
- `Kt` = `companionReaction !== undefined` (boolean, whether sprite is showing)
- `LGf`, `XGf`, `JGf` = layout constants (values not yet extracted — their assignments are in the same module but the binary minification did not expose them as simple assignments in string extraction)
- `Rb7(LQ, Kt)` = the `companionReservedColumns()` function analog

The function `Rb7` takes terminal width and a boolean indicating whether a companion reaction is active, and returns the number of columns to reserve. The sprite documented in the digest is **5 lines x 12 characters**, so the minimum expected reserved space is 12 + bubble padding. The exact threshold where `Rb7` returns 0 (hiding the sprite entirely) requires empirical testing.

---

## Prerequisites

Both Q2 and Q3 require the same setup:

1. **Claude Code v2.1.89 or later** — version 2.1.90 is confirmed to have the feature
2. **Pro or Max subscription** — buddy is gated behind tier check
3. **First-party distribution** — not Bedrock, Vertex, or Foundry
4. **Date on or after April 1, 2026** — time gate: `getMonth() >= 3 && getFullYear() >= 2026`
5. **Buddy not muted** — run `/buddy` first, confirm companion card appears. If previously muted, `/buddy on` unmutes (undocumented command)
6. **Terminal emulator with resizable columns** — tested terminals: any that support `stty cols` and/or drag-to-resize. Note which emulator you use.

### Environment Check

```bash
# Confirm version
claude --version

# Confirm buddy is live (should show companion card, not error)
/buddy

# Confirm terminal width
stty size   # output: rows cols
# or
tput cols
```

---

## Q2: Speech Bubble TTL

### Objective

Determine how long the speech bubble displays after a reaction fires, and whether duration varies by trigger type.

### Hypothesis

Based on binary analysis: the bubble likely **persists until the next reaction replaces it**, rather than auto-dismissing on a timer. There is no `setTimeout` or TTL constant in the bundle for bubble dismissal. Empirical tests should confirm or refute this.

### Test Procedure

#### Test 2.1 — `/buddy pet` trigger

1. Open a fresh Claude Code session
2. Ensure the terminal is at a normal width (>= 80 cols)
3. Run `/buddy pet` and start a stopwatch immediately
4. Do NOT type anything after the pet command
5. Record: time until bubble appears, whether it ever disappears on its own
6. Wait at least 5 minutes without interaction. Record whether the bubble is still visible

**What to record:**
- Bubble appears: immediately, or after API latency?
- Bubble text: note the content (to confirm it's a reaction)
- Bubble disappears: never (persists), or at what elapsed time?
- Repeat 3 times (reactions have a 30-second cooldown, so wait between attempts)

#### Test 2.2 — Bubble behavior across a new turn

1. Trigger a reaction (via `/buddy pet`)
2. Wait for the bubble to appear
3. Submit a new prompt to Claude (something short like "hello")
4. Record: does the bubble disappear immediately when you submit? After Claude responds? Does it update to a new reaction?

**What to record:**
- When does the previous bubble clear relative to the new turn cycle?
- Does a loading indicator appear where the bubble was during the API call?

#### Test 2.3 — Error trigger

1. Run a command that produces an error — either:
   - A shell command: `! node -e "throw new Error('test error')"` 
   - Or cause a test failure in a project with tests
2. Record whether the companion reacts (check for bubble)
3. If it does react, apply the same timing measurements as Test 2.1

**Note**: The error trigger regex is: `/\berror:|\bexception\b|\btraceback\b|\bpanicked at\b|\bfatal:|exit code [1-9]/i`

#### Test 2.4 — Addressed trigger (no cooldown)

The addressed trigger bypasses the 30-second cooldown. This is useful for rapid testing.

1. Find out your companion's name (shown in `/buddy` output)
2. Type a message that includes the companion's name, e.g. "Hey Shingle, what do you think?"
3. Submit the message
4. Record bubble appearance timing

**Expected**: The addressed trigger fires every time you include the name, regardless of cooldown. This makes it useful for repeated TTL tests without waiting 30 seconds between attempts.

### Measurement Method

**Preferred — video capture or screen recorder**: Start a screen recording before triggering the reaction. Review the recording frame-by-frame to measure bubble appearance and disappearance.

**Alternative — script(1) terminal session**: Record with timestamps:

```bash
# In a separate terminal, start recording
script -t /tmp/typescript 2>/tmp/timings typescript

# In the recorded session, run Claude Code
claude

# After testing, exit
exit

# Analyze timings
scriptreplay /tmp/timings /tmp/typescript
```

This captures ANSI sequences including when the buddy sprite region updates.

**Simple fallback**: Phone stopwatch. Start stopwatch when you see the bubble appear. Stop when it disappears (if it does).

### What to Fill In

| Test | Trigger | Bubble appear latency | Bubble disappear event | Duration (if timed) |
|------|---------|----------------------|----------------------|---------------------|
| 2.1a | pet | | | |
| 2.1b | pet (repeat 2) | | | |
| 2.2 | pet → new turn | | | |
| 2.3 | error | | | |
| 2.4 | addressed | | | |

---

## Q3: Narrow Terminal Behavior

### Objective

Determine what happens to the companion sprite and speech bubble when the terminal is narrowed below typical thresholds. Specifically: at what width does the sprite hide, at what width does the prompt become unusable, and whether reactions still fire (network calls) even when the UI may be hidden.

### Hypothesis

Based on binary analysis: `Rb7(LQ, Kt)` returns the reserved column count as a function of terminal width and reaction state. At some width threshold, it likely returns 0, hiding the sprite entirely. The text input width formula `yj = LQ - LGf - _t` means that as `_t` (reserved columns) decreases toward 0, the input area gains width. If `LGf` is, say, 2 (a left margin), then at a very narrow terminal the input area may overlap or be miscalculated.

### Test Procedure

#### Setup

Before each test, resize your terminal to the target width. Then trigger a reaction (use the addressed trigger — include your companion's name in a message) and observe the layout.

**Resizing methods:**

```bash
# Option A: resize with stty (may not work in all emulators)
stty cols 80   # set to 80, adjust as needed

# Option B: use resize utility (if available)
resize -s 40 80   # rows=40, cols=80

# Option C: drag the terminal window edge (most reliable)
# After resizing, verify with:
tput cols
```

#### Test 3.1 — Baseline at 80 columns

1. Set terminal to 80 columns
2. Start a Claude Code session
3. Trigger a reaction (addressed trigger: include companion name in message)
4. Take a screenshot
5. Observe and record all items in the "Observations" table below

#### Test 3.2 — 59 columns (just under typical threshold)

Repeat 3.1 procedure at 59 columns.

#### Test 3.3 — 50 columns

Repeat at 50 columns.

#### Test 3.4 — 40 columns

Repeat at 40 columns.

#### Test 3.5 — 30 columns (severely narrow)

Repeat at 30 columns.

#### Test 3.6 — 20 columns (extreme)

Repeat at 20 columns.

### Observations to Record

For each width, fill in the following table:

| Width | Sprite visible? | Sprite truncated? | Speech bubble appears? | Bubble truncated? | Prompt input usable? | Notes |
|-------|----------------|-------------------|----------------------|-------------------|---------------------|-------|
| 80    | | | | | | Baseline |
| 59    | | | | | | |
| 50    | | | | | | |
| 40    | | | | | | |
| 30    | | | | | | |
| 20    | | | | | | |

**For each row, also note:**
- Terminal emulator name and version
- Any visual artifacts (overlapping text, broken ANSI sequences, garbled output)
- Whether the prompt input accepts characters and returns readable output

### Checking Whether Reactions Still Fire

Even if the sprite is hidden visually, the `buddy_react` network call may still fire (since `Rb7` returns 0 for reserved columns but the trigger logic in `SN7` is independent of column count).

To check network activity at narrow widths:

```bash
# Start Claude Code under network trace
# Option A: tcpdump (requires sudo)
sudo tcpdump -n -A 'host api.anthropic.com and port 443' 2>&1 | grep -i "buddy_react" &

# Option B: check logs (if Claude Code logs to stdout in verbose mode)
claude --verbose 2>&1 | grep -i "buddy"

# Option C: use the proxy approach
# Set HTTP_PROXY=http://localhost:8080 and run mitmproxy in another window
```

Record: at what column widths (if any) do network requests stop being sent for buddy reactions?

### Expected vs Actual

Based on the binary analysis, the expected column thresholds are:

| Width | Expected behavior |
|-------|------------------|
| >= ~60 | Normal: sprite + bubble both visible, no truncation |
| ~40-59 | Sprite likely hidden (Rb7 returns 0), bubble may still appear as text-only |
| <= ~30 | Unpredictable: possible layout corruption or prompt unusability |
| <= ~20 | Likely complete UI degradation |

These are estimates based on the 12-char sprite width plus bubble padding. The actual threshold may differ. Record the **exact column count** where each transition occurs.

---

## Reporting Results

When you have run the tests, document results in a new file `/mnt/d/dev/p/claude-buddy-investigation/results/q2-q3-results.md` with this structure:

```markdown
# Q2/Q3 Empirical Results

**Date run**: YYYY-MM-DD
**Claude Code version**: 
**Terminal emulator**: 
**OS**: 

## Q2: Bubble TTL

### Summary
[One-sentence answer: does the bubble persist until next reaction, or does it timeout?]

### Raw data
[Fill in the test tables from above]

### Conclusion
- Bubble TTL: [persists until next turn / auto-dismisses after ~Xs / other]
- Varies by trigger type: [yes/no, details]
- Cleared at: [submission of new message / receipt of response / other]

## Q3: Narrow Terminal

### Summary
[One-sentence answer on graceful degradation vs corruption]

### Raw data
[Fill in the observations table from above]

### Key thresholds found
- Sprite hides below: [N] columns
- Bubble hides below: [N] columns
- Prompt becomes unusable below: [N] columns
- Network calls stop below: [N] columns (or "never stop")

### Screenshots
[Attach or link screenshots at each width]
```

---

## Notes on Test Validity

- Ensure buddy is not muted during tests (`/buddy off` disables all reactions). Run `/buddy` to check companion status before each test session.
- The 30-second cooldown (`$Of = 30000`) applies between non-addressed reactions. Use the addressed trigger (include companion name) to bypass this for rapid testing.
- API latency will affect bubble appear time. Do not count network latency as part of the bubble TTL — measure from when the bubble first appears, not from when you triggered the reaction.
- For narrow terminal tests, resize the terminal BEFORE starting Claude Code in that session, or resize and then trigger a re-render by causing a reaction. The layout is computed on each render cycle, so live resizing should work.
