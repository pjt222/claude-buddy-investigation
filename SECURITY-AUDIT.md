# Buddy API Security Audit

**Date:** 2026-04-03 (last updated: 2026-04-09)
**Scope:** All code in `claude-buddy-investigation` repository — CLI tool, MCP server, capture system, and documentation site
**Method:** Multi-agent deep analysis with manual source verification

---

## Executive Summary

The buddy system's **core architecture is sound** — the unidirectional trust boundary is properly enforced and the companion cannot influence the main agent. However, this audit identified **13 vulnerabilities** (1 since resolved) across 4 severity levels spanning the CLI tool, MCP server, capture system, and documentation frontend.

| Severity | Count | Key Finding |
|----------|-------|-------------|
| CRITICAL | 1 | Command injection in `strategy-scrape.mjs` |
| HIGH     | 2 (1 resolved) | Credential exposure in logs, ~~missing SRI~~ (RESOLVED), unfiltered transcript |
| MEDIUM   | 5 | Path traversal in CLI, TOCTOU races, file permissions, missing CSP, predictable temp files |
| LOW      | 3 | Unicode validation gaps, innerHTML pattern, year gate seasonal bug |
| OBSERVATION | 1 | API stat spoofing (intentional — "Two Owls" documented behavior) |

### Post-audit harness-level additions (tracked in the issue tracker)

The original repo-scoped audit baseline (14 items above) has been extended over time as the investigation expanded into the wider Claude Code harness binary. **16 post-audit findings** are tracked in the issue tracker, bringing the **audit-baseline tally to 30**: #31 AC3 (ghost-inbox forgery, 2026-04-14) + 6 mithril-probe harness findings (#73/#76 HIGH, #78/#80/#81/#85 MEDIUM, 2026-04-19) + #105 (HIGH, third-party telemetry processor, v126) + #106 (CRITICAL, brief stop-hook config-channel injection, v126) + #107 (HIGH, content-sharing tool, v128) + #108 (CRITICAL, permission-classifier inversion, v128, wire-confirmed v129) + #110 (CRITICAL, field-level identifier egress, v129, wire-confirmed) + #113 (CRITICAL, forced-downgrade — run-to-completion wire-confirmed v2.1.152 session-61) + #114 (HIGH, #31 AC3 partial-defense, v138) + #127 (CRITICAL, startup-notice ANSI/OSC8 injection, v140 — wire-confirmed v143/v145 session-59) + #136 (CRITICAL, server-pushed plugin-allowlist OAuth-bearer egress — gate-a wire-confirmed v2.1.152 session-61).

The 29-item audit-baseline tally by severity (per `docs/counts.js`): **6 critical / 9 high / 10 medium / 3 low / 1 observation**.

**Live GH-label re-derivation (2026-05-20, post-v145 round-1, session-59)**: 12 critical / 30 high-priority / 46 medium-priority / 8 low-priority = **96 severity-labeled across 135 repo issues**. The live tally counts ALL severity-labeled issues (including exploratory disclosure-candidates not tracked in the audit-baseline tally); it has been byte-stable since 2026-05-18 — no new issues filed v141–v145. See `docs/counts.js` for the two-axis tally and re-derivation procedure. Per-finding detail for the 15 post-audit items is in the **Post-Audit Harness-Level Findings** section below.

---

## CRITICAL Findings

### C1. Command Injection via Environment Variables in `strategy-scrape.mjs`

**File:** `tools/shingle-capture/strategy-scrape.mjs:30-35`
**Severity:** CRITICAL

The scrape strategy passes environment variables directly into `execSync()` shell commands without sanitization:

```javascript
const wezterm = process.env.WEZTERM_CLI || '/mnt/c/Program Files/WezTerm/wezterm.exe';
const paneId = process.env.WEZTERM_PANE || "";
const paneArg = paneId ? `--pane-id ${paneId}` : "";
const scrollback = execSync(
  `"${wezterm}" cli get-text ${paneArg} 2>/dev/null`,
  { encoding: "utf-8", timeout: 3000 }
);
```

**Attack vector:** An attacker who controls `WEZTERM_PANE` can inject arbitrary shell commands:

```bash
WEZTERM_PANE='"; rm -rf / #' node capture.mjs
# Executes: "wezterm" cli get-text --pane-id "; rm -rf / # 2>/dev/null
```

Similarly, `SHINGLE_TMUX_PANE` (line 44) is interpolated into a tmux command, and `SHINGLE_TERMINAL_LOG` (line 56-58) is passed to `tail`:

```javascript
const pane = process.env.SHINGLE_TMUX_PANE || "claude";
execSync(`tmux capture-pane -t "${pane}" -p -S -200 2>/dev/null`, ...);

const logFile = process.env.SHINGLE_TERMINAL_LOG || "/tmp/shingle-terminal.log";
execSync(`tail -c 16384 "${logFile}" 2>/dev/null`, ...);
```

All three are injectable via environment variable manipulation.

**Countermeasure:** Sanitize all inputs or use `execFileSync` (no shell interpretation):

```javascript
import { execFileSync } from "node:child_process";

// Safe: arguments passed as array, no shell interpretation
const scrollback = execFileSync(wezterm, ["cli", "get-text", "--pane-id", paneId], {
  encoding: "utf-8", timeout: 3000
});
```

---

## MEDIUM Findings

### M0. Path Traversal via `--config-dir` in `buddy-config.mjs`

**File:** `tools/buddy-config.mjs:47,51,22-24`
**Severity:** MEDIUM (downgraded from CRITICAL — local CLI tool with constrained write primitive)

The `--config-dir` flag accepts arbitrary filesystem paths without validation and sets them as `CLAUDE_CONFIG_DIR`:

```javascript
if (args[i] === '--config-dir' && args[i + 1]) { flags.configDir = args[++i]; }
// ...
if (flags.configDir) process.env.CLAUDE_CONFIG_DIR = flags.configDir;
```

This path is used for reads, writes, and backups throughout the tool:

```javascript
function resolveConfigDir() {
  const override = process.env.CLAUDE_CONFIG_DIR;
  return override || join(homedir(), '.claude');
}
```

**Attack vector:**

```bash
# Read arbitrary JSON files
node buddy-config.mjs show --config-dir /etc

# Write to arbitrary directories
node buddy-config.mjs rename Pwned --force --config-dir /tmp/malicious
```

**Countermeasure:** Validate that the config dir is within the user's home directory, or at minimum ensure the path is absolute and doesn't traverse upward:

```javascript
function validateConfigDir(dir) {
  const resolved = resolve(dir);
  const home = homedir();
  if (!resolved.startsWith(home)) {
    throw new Error(`Config dir must be within ${home}`);
  }
  return resolved;
}
```

**Note:** While this is a real path traversal, it requires explicit user invocation of `--config-dir` on a local CLI tool. The write primitive is constrained to JSON with a fixed structure and cannot overwrite files with different ownership. `mkdir -p` on privileged paths fails without root. Downgraded from CRITICAL to MEDIUM.

---

## HIGH Findings

### H1. OAuth Token Exposure in Capture Logs and Hook Payloads

**Files:**
- `tools/shingle-capture/util.mjs:43-66` — reads `accessToken` from credentials
- `tools/shingle-capture/hook-wrapper.sh:18` — dumps raw hook payload to `/tmp/shingle-hook-payload.json`

**Issue:** The hook wrapper writes the full hook payload to a world-readable temp file:

```bash
echo "$PAYLOAD" > "$PAYLOAD_DUMP"   # /tmp/shingle-hook-payload.json
```

While the hook payload itself may not contain the OAuth token directly, the capture log (previously at `/tmp/shingle-capture.jsonl`, now moved to `~/.claude/shingle-capture.jsonl`) could be world-readable if permissions are not set. The `readConfig()` function loads the OAuth access token into memory and passes it to API calls. If any error path or debug logging exposes this token, it could leak.

**Countermeasure:**
- Set restrictive permissions on temp files: `umask 077` in hook-wrapper.sh
- Use `mktemp` for temp files instead of predictable paths
- Never log credentials; explicitly redact `accessToken` from any error output

---

### H2. Missing Subresource Integrity (SRI) on CDN Script — RESOLVED

**File:** `docs/index.html:726`
**Severity:** HIGH
**Status:** RESOLVED (2026-04-09) — SRI hash and `crossorigin="anonymous"` added.

Three.js is now loaded with integrity verification:

```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"
        integrity="sha384-CI3ELBVUz9XQO+97x6nwMDPosPR5XvsxW2ua7N1Xeygeh1IxtgqtCkGfQY9WWdHu"
        crossorigin="anonymous"></script>
```

---

### OBS1. API Stat Spoofing — Server Trusts Client-Sent Parameters

**Files:**
- `tools/shingle-mcp/server.js:23-27` — hardcoded divergent stats
- `tools/shingle-capture/strategy-replay.mjs:13-18` — same divergent stats

**Severity:** OBSERVATION (not a vulnerability in this repo — intentional documented behavior)

**Observation:** The `buddy_react` API endpoint trusts whatever `stats`, `species`, `rarity`, `name`, and `personality` the client sends. There is no server-side validation against the hash-derived values. This repo intentionally exploits this to create the "Two Owls" phenomenon — MCP Shingle runs with tuned stats (PATIENCE 95, WISDOM 99) for calmer reactions than native Shingle (PATIENCE 81, WISDOM 36). This divergence is documented in `architecture.md` §BONES divergence.

```javascript
const BONES = {
  species: "owl",
  rarity: "common",
  stats: { DEBUGGING: 1, PATIENCE: 95, CHAOS: 1, WISDOM: 99, SNARK: 21 },
};
```

**Upstream note:** The API's trust of client-sent parameters is a design choice on Anthropic's server. Server-side re-derivation of companion parameters from the authenticated user's account hash would close this trust boundary gap, but this is outside this repo's scope.

---

### H4. Unfiltered Transcript Transmission to buddy_react API

**File:** Binary analysis (documented in `architecture.md` and `digest.md`)
**Severity:** HIGH

The native Claude Code client sends up to 5,000 characters of conversation transcript to the `buddy_react` endpoint without filtering for secrets, API keys, passwords, or PII:

```
transcript: $.slice(0, 5000)  // No sanitization
```

The MCP server and capture tools replicate this behavior.

**Impact:** Secrets discussed in a Claude Code session (API keys, passwords, credentials, PII) are transmitted to a separate API endpoint beyond the main conversation flow. Users are not warned.

**Countermeasure:**
- Document this behavior in user-facing help text for `/buddy`
- Recommend `/buddy off` when handling sensitive credentials
- Consider client-side regex filtering for known secret patterns (AWS keys, GitHub tokens, etc.)

---

## MEDIUM Findings

### M1. TOCTOU Race Conditions in File Operations

**File:** `tools/buddy-config.mjs:58-67,101-111`
**Severity:** MEDIUM

The `fileExists()` check followed by `readFile()` / `copyFile()` creates time-of-check-time-of-use (TOCTOU) windows:

```javascript
if (await fileExists(configPath)) {
  const raw = await readFile(configPath, 'utf-8');  // File could change between check and read
  return JSON.parse(raw);
}
```

```javascript
async function createBackup(label) {
  if (!(await fileExists(configPath))) return null;  // Check
  // ... time gap ...
  await copyFile(configPath, backupPath);             // Use — file could change
}
```

**Countermeasure:** Use a try/catch pattern instead of check-then-act:

```javascript
async function readConfig() {
  try {
    const raw = await readFile(resolveConfigPath(), 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') {
      // Fall back to backup
    }
    throw err;
  }
}
```

---

### M2. Insecure File Permissions on Config and Backup Directories

**File:** `tools/buddy-config.mjs:88,106`
**Severity:** MEDIUM

Directories and files are created without explicit permission modes:

```javascript
await mkdir(configDir, { recursive: true });    // Line 88 — no mode specified
await mkdir(backupDir, { recursive: true });    // Line 106 — no mode specified
```

Temp files written during atomic writes are also created with default permissions (line 97), potentially exposing companion config to other users on shared systems.

**Countermeasure:**

```javascript
await mkdir(configDir, { recursive: true, mode: 0o700 });
await writeFile(tmpPath, data, { encoding: 'utf-8', mode: 0o600 });
```

---

### M3. Missing Content Security Policy on Documentation Site

**File:** `docs/index.html`
**Severity:** MEDIUM

No CSP meta tag or HTTP header restricts script execution or resource loading on the GitHub Pages site.

**Countermeasure:**

```html
<meta http-equiv="Content-Security-Policy" content="
  default-src 'self';
  script-src 'self' https://cdnjs.cloudflare.com;
  style-src 'self';
  img-src 'self' data:;
  frame-ancestors 'none'
">
```

---

### M4. Addressed-Trigger Rate Limit Bypass

**Documented in:** `architecture.md`, `digest.md`
**Severity:** MEDIUM

The 30-second client-side cooldown (`$Of = 30000`) is bypassed when the user addresses the companion by name (`addressed: true`). This allows rapid-fire API calls:

```
"Hey Shingle, ..."  → reaction fires (no cooldown)
"Hey Shingle, ..."  → reaction fires (no cooldown)
→ Potential flood of buddy_react requests
```

**Partial mitigation already in place:** The MCP server (`server.js:17`) implements its own `COOLDOWN_MS = 5000` guard, limiting MCP-triggered reactions to one per 5 seconds regardless of `addressed` flag.

**Countermeasure (server-side):** Implement per-user server-side rate limiting (e.g., 5 requests/second) independent of the `addressed` flag.

---

### M5. Predictable Temp Filename Enables Symlink Attack

**File:** `tools/buddy-config.mjs:96`
**Severity:** MEDIUM

The atomic write pattern uses `Date.now()` for temp file naming:

```javascript
const tmpPath = configPath + '.tmp.' + Date.now();
```

`Date.now()` has millisecond resolution and is predictable. A local attacker can pre-create a symlink at `~/.claude/.claude.json.tmp.<predicted_timestamp>` pointing to an arbitrary file. When `writeFile` follows the symlink, JSON content is written to the symlink target, and `rename` then moves it into place.

This is distinct from M1 (TOCTOU on reads) — this covers the write path.

**Countermeasure:** Use `fs.mkdtemp` for the temp directory or open the temp file with `O_CREAT | O_EXCL` flags to fail if the path already exists:

```javascript
import { open } from 'node:fs/promises';
const fh = await open(tmpPath, 'wx'); // fails if exists (symlink or file)
await fh.writeFile(data);
await fh.close();
await rename(tmpPath, configPath);
```

---

## LOW Findings

### L1. Insufficient Input Validation for Unicode/Control Characters

**File:** `tools/buddy-config.mjs:131-142`
**Severity:** LOW

Name and personality validation checks length and whitespace but does not filter:
- Control characters (null bytes, escape sequences)
- Unicode directional overrides (RTL, LTR marks)
- Homograph characters
- Zero-width joiners/non-joiners

**Countermeasure:** Add a character class filter:

```javascript
if (/[\x00-\x1f\x7f\u200b-\u200f\u2028-\u202f\ufeff]/.test(name)) {
  return 'Name contains invalid characters.';
}
```

---

### L2. innerHTML with Template Literals in Documentation

**File:** `docs/app.js:152-155`
**Severity:** LOW

Species data is rendered via `innerHTML`:

```javascript
card.innerHTML = `
  <span class="species-emoji">${sp.emoji}</span>
  <span class="species-name">${sp.name}</span>
`;
```

Currently safe because `SPECIES_DATA` is hardcoded, but the pattern is risky if the data source ever changes to external input.

**Countermeasure:** Use `textContent` instead:

```javascript
const emojiSpan = document.createElement('span');
emojiSpan.className = 'species-emoji';
emojiSpan.textContent = sp.emoji;
card.appendChild(emojiSpan);
```

---

### L3. Date Gate Has Seasonal Bug — Companion Disabled January-March

**Location:** Availability gate function in the v2.1.90 binary
**Severity:** LOW

The availability gate checks `month >= 3 && year >= 2026`. The year check will remain true indefinitely. However, the month check evaluates to `false` during January (month 0), February (1), and March (2) of every year — including 2027 and beyond.

This means the companion will be **silently disabled from January 1 through March 31 every year**. This is almost certainly a bug: the intent was a one-time launch gate for April 2026, but the implementation creates a recurring seasonal restriction because the month and year checks are ANDed rather than testing a single date threshold.

**Countermeasure:** This is a bug in Anthropic's binary, not in this repo's code. Monitor binary updates for a fix (e.g., replacing the gate with `Date.now() >= 1711929600000` for a one-time threshold).

---

## Verified Secure

| Area | Assessment |
|------|-----------|
| **Unidirectional architecture** | Companion cannot write to conversation, modify files, invoke tools, or influence agent reasoning. Boundary is enforced architecturally. |
| **Transport security** | API calls use HTTPS with HSTS (1-year, includeSubDomains, preload). Cloudflare CDN fronts the endpoint. |
| **OAuth authentication** | `buddy_react` requires a valid OAuth bearer token. Missing or expired tokens cause silent bail-out (4 gates in the dispatch function). |
| **Muting behavior** | `/buddy off` sets a muted flag, which stops **both** UI display and network transmission. Muting is not cosmetic. |
| **No tracking in docs** | Documentation site contains no analytics, cookies, localStorage access, or data exfiltration. |

---

## Post-Audit Harness-Level Findings

The 14 audit-scoped items above cover the original repo-scoped audit. As the investigation expanded into the wider Claude Code harness binary (v2.1.107 → v2.1.145), 15 additional findings were filed in the issue tracker. They are summarised here for completeness — full reproduction details, MITM artefacts, and disclosure timelines live in the issue tracker. Numbering uses `PAn` (Post-Audit) alongside the canonical issue number. Flag and minified-identifier names are redacted; functional descriptions only.

**Cross-version persistence (session-59):** all 21 priority-finding literals are byte-stable v143→v145 — **no remediation observed on any tracked finding** across the v143/v144/v145 chain. Runtime re-probes (#113, #127) reproduce on v2.1.145 identically to v2.1.143. The net direction across the version window remains attack-surface-added, not removed.

### PA1 / #31 AC3 — Skill-Forked Subagent Inbox Forgery (CRITICAL)

**Discovered**: 2026-04-14 (empirical). **Class**: Authorisation bypass via attribution laundering. The subagent ghost-inbox / attribution-forgery class — a skill-forked subagent can silently create inbox messages, and the attribution can be laundered. A transcript-replay variant remained undefended through v138 despite an SDK-stdin parser-level defense added in v123.

**v145 status — UNDEFENDED**: v2.1.145 added a skill self-recursion guard, which is **orthogonal** — it blocks a forked skill from re-invoking *itself* in its own forked subagent context (same-skill self-recursion only). It does NOT touch the cross-agent inbox-forge path. The relevant forge-field and inbox-handler anchors are byte-stable v143→v145. **#31 AC3 remains undefended on v2.1.145.**

### PA2 / #73 — Global Query Off-Switch (HIGH)

**Discovered**: 2026-04-19 (mithril probe v2.1.114). **Class**: Server-flippable kill switch. A flag at the top of the main query executor — a single server-side flip can disable all queries cohort-wide.

### PA3 / #76 — Server-Disablable CLAUDE.md Injection (HIGH)

**Discovered**: 2026-04-19 (mithril probe v2.1.114). **Class**: Server-controlled context modification. A server-controlled flag can remotely disable CLAUDE.md injection — a silent project-context drop without user consent. The same class re-occurred in v2.1.121 with the `/team-onboarding` slash-command prompt body delivered via the same channel (#103).

### PA4 / #78 — Third-Party Logging Gate (MEDIUM, subset of #105)

**Discovered**: 2026-04-19 (v2.1.114). **Class**: Third-party telemetry surface. A third-party logging gate with a hardcoded public endpoint. Empirical wire-confirmation in v126 (#105) extended this to High once the full body shape (a 47-field fingerprint plus raw envelope identifiers) was confirmed.

### PA5 / #80 — Semantic Co-Work Memory Selector (MEDIUM)

**Discovered**: 2026-04-19 (v2.1.114). **Class**: Async vector lookup on user input. A semantic co-work memory selector running an async vector lookup on user turns. This cluster (with #81) was fully removed in v2.1.128 (auto-memory feature retired).

### PA6 / #81 — Silent Async Memory Extraction (MEDIUM)

**Discovered**: 2026-04-19 (v2.1.114). **Class**: Implicit data persistence. Silent async memory extraction from conversation turns. Removed in v2.1.128.

### PA7 / #85 — Multi-Session Coordinate Mode (MEDIUM)

**Discovered**: 2026-04-19 (v2.1.114). **Class**: Undocumented multi-Claude coordination. A multi-session coordinate mode — an undocumented multi-Claude coordination system / Computer Use config object (Pro/Max gated).

### PA8 / #105 — Third-Party Telemetry Processor (HIGH)

**Discovered**: 2026-05-02 (v2.1.126 MITM wire capture). **Class**: Third-party processor envelope-leak (extends an earlier finding). When the third-party logging gate is server-flipped on, a 110-event subset duplicates to a third-party processor (the gate rule was byte-stable v126→v138). The body retains `session_id` (every event), `subscription_type` (also search-indexed), `last_session_id` (cross-session correlation), and a 47-field system fingerprint. A later round found a partial remediation for a customer subset only.

### PA9 / #106 — Brief Stop-Hook Config-Channel Injection (CRITICAL)

**Discovered**: 2026-05-02 (v2.1.126 MITM canary). **Class**: Server-controlled string reaches model context verbatim. An empty-default server-controlled string-flag overrides the hardcoded Stop-hook reminder text. A MITM-injection canary empirically reaches the messages-API model context as `role:"user"` verbatim. No client-side length cap (a 64 KB canary reaches the model context). No certificate pinning at the config-eval channel.

### PA10 / #107 — Content-Sharing Tool With Public Share URL (HIGH)

**Discovered**: 2026-05-04 (v2.1.128). **Class**: Public file share via an agentic tool. A built-in agentic tool uploads a working-directory file to an Anthropic onboarding endpoint, gated by a server-controlled flag (server-flipped ON for the test account), and returns a share URL. An informal incognito test reported the URL as public; a later scrapling re-test from a no-cookies host got server-side redirects to the login page (the SPA shell serves identical bytes for login and the share route). Severity HIGH; promotion-gate to CRITICAL still open pending a fresh-profile incognito re-verify.

### PA11 / #108 — Permission-Classifier Fail-Closed Inversion (CRITICAL)

**Discovered**: 2026-05-04 (v2.1.128, Med-High); promoted CRITICAL 2026-05-06 via a MITM probe (v2.1.129). **Class**: Server-flippable safety-default inversion. A DEFAULT-TRUE flag controls the sandbox network classifier's fail-closed default. Server-flipping it false inverts to fail-open. The probe ran a 2-step rewrite chain (a config-eval inject plus a 503 for classifier requests) and produced a literal `(fail open)` line in the binary log. The auto-mode permission classifier site was wire-confirmed; the sandbox-network classifier site is deferred.

### PA12 / #110 — Field-Level Identifier Egress (CRITICAL)

**Discovered**: 2026-05-05 (v2.1.129, HIGH); promoted CRITICAL 2026-05-06 via a MITM probe. **Class**: Telemetry field-level identifier leak. A destructure-rename pattern in the first-party telemetry pipeline extracts payload values into local variables and re-attaches them as top-level event fields; a sibling redactor strips the residual but not the destructured raw values explicitly re-attached at egress. Empirically: a single `claude --print` invocation produced 356 raw `skill_name` (355 unique) + 9 `plugin_name` (2 unique third-party) + 9 `marketplace_name` (2 unique third-party) on 2 event-logging batch POSTs. A forward-compat slot for raw REPL input exists at the destructure but no emitter populates it through v138 (escalate watch if a setter is ever added).

### PA13 / #113 — Forced-Downgrade Primitive (CRITICAL) — RUN-TO-COMPLETION WIRE-CONFIRMED

**Discovered**: 2026-05-10 (v2.1.138 static decode). **Wire-confirmed**: 2026-05-20 (session-59, interactive TUI on v2.1.143; reproduced v2.1.145). **Promoted CRITICAL**: 2026-05-27 (session-61 docker session — run-to-completion on v2.1.152: the on-disk binary is actually swapped to the attacker-chosen older version via the auto-updater + npm install). **Class**: Server-pushed version-pin primitive driving an on-disk supply-chain swap. **Status**: OPEN — `critical`, `disclosure-candidate`, a wire-confirmed member of the disclosure bundle.

A typed-config reader returns a `{maxVersion, forceDowngradeEnabled}` object derived from a server-provided semver string; a sister primitive provides bidirectional version-pin via the same channel. User-side mitigation: a `~/.claude/settings.json` minimum-version floor blocks downgrades below it; the default is undefined, so most users are vulnerable. The documented auto-update mitigations (the auto-updates opt-out, release-channel settings) do NOT cover this server-controlled path — a user who "disabled auto-updates" per the official docs is still downgradable.

**Runtime evidence (session-59)**: PTY keystroke automation drove an interactive TUI under MITM with a forced-downgrade payload force-injected into every server config-eval response. The captured event-logging batch POST carried the forced-downgrade telemetry event decoding to a `{from_version, to_version, subscription_type}` triple; the TUI then rendered `Auto-updating…` — the client entered the downgrade flow, with the interactive flag set, with **no UI prompt and no user confirmation**.

**Run-to-completion (session-61, v2.1.152)**: the deferred "did-the-install-actually-complete?" gap is now closed. Same inject path on v2.1.152 drove the auto-updater through ALL four phases in one capture — config-eval inject lands → forced-downgrade telemetry fires → the apply path spawns `npm install -g @anthropic-ai/claude-code@<target>` (the MITM captured 7+ parallel `registry.npmjs.org` GETs against the package and the linux-x64 sub-package) → on-disk package at the npm global prefix is replaced. Post-probe `claude --version` reports the downgraded target; the npm global registry lists the older version. The binary on disk is actually swapped. The operator-visible signal during the swap is a single transient `Auto-updating…` line in the TUI status row with **identical wording to a benign upgrade** — no version named, no labelling as a downgrade, no prompt. Severity HIGH → **CRITICAL** on supply-chain primitive: a server-pushed config can pin any victim to an arbitrary older release, including versions with known CVEs or pre-defence behaviour for any other finding in the disclosure-candidate bundle.

### PA14 / #114 — Skip-Persistence Bypass on the AC3 Defense (HIGH)

**Discovered**: 2026-05-10 (v2.1.138 static decode); demoted to MEDIUM in a follow-up round; reverted to HIGH via an empirical SDK-wrapper survey. **Class**: Partial-defense bypass on the ghost-inbox transcript-replay variant. The message-chain insertion path has a bypass on the skip-persistence path. The skip-persistence path is reachable via an explicit no-session-persistence CLI flag, an SDK option, or an env var. A third-party SDK-wrapper survey found 97 unique public GitHub repos using the bypass flag; 5 of 7 sampled wrappers default unconditionally to the bypass-vulnerable mode (a large default-vulnerable share of the public ecosystem). Severity stays HIGH on empirical evidence.

### PA15 / #127 — TUI Startup-Notice ANSI/OSC8 Injection (CRITICAL) — WIRE-CONFIRMED

**Discovered**: 2026-05-13 (v2.1.140 static decode); promoted HIGH → CRITICAL the same day via a PTY-mounted MITM probe. **Re-confirmed**: 2026-05-20 (session-59, an independent PTY-driver scaffold on v2.1.143; reproduced v2.1.145). **Class**: Server-pushed UI-string injection with missing escape-sequence sanitization. **Status**: OPEN — `critical`, `disclosure-candidate`, a wire-confirmed member of the disclosure bundle.

A server-controlled string-flag is read via the config-eval channel; its default state on the wire is empty/dormant. When the server flips the flag on with a string value, the Ink notification component renders the value verbatim wrapped in a yellow SGR, **with no escape-sequence sanitization**. A multi-phase probe wire-confirmed: (i) the UI render path mounts in TUI mode; (ii) raw ANSI escapes pass through to the user's terminal stream; (iii) markdown is rendered as literal text (defensive); (iv) the length cap is ~75 visible characters (defensive) but ANSI escapes are zero-width and survive the cap. A follow-up phase demonstrated the most-impactful concrete attack: a server-pushed OSC 8 terminal hyperlink rendered as a mouse-clickable link with an attacker-chosen URL (the Ink layer even auto-enhanced the hyperlink). A single server config push delivers credential-phishing UI to a targeted user cohort. No additional client-side compromise is needed.

**Session-59 re-confirmation**: independently reproduced on the new PTY-driver scaffold. On both v2.1.143 and v2.1.145, an injected payload mixing a plain canary, an ANSI escape, and a bare URL rendered to the TUI notification area — the plain canary verbatim, the ANSI escape passed through **unsanitized**, the bare URL rendered. Two of the three CRITICAL promotion-gates are met; the unsanitized-ANSI result already enables cursor manipulation and screen overwrite.

### PA16 / #136 — Server-Pushed Plugin-Allowlist OAuth-Bearer Egress (CRITICAL) — GATE-A WIRE-CONFIRMED

**Discovered**: 2026-05-20 (v2.1.144 static decode, session-60). Genuinely new in v2.1.144 — the credential-return idiom did not exist in v2.1.143. **Gate-a wire-confirmed**: 2026-05-27 (session-61 docker session — passive MITM on v2.1.152 captured the production server pushing a non-empty 30-plugin allowlist by default to a standard first-party Pro account). **Class**: Server-pushed allowlist → live OAuth bearer egress into plugin hook subprocess environment. **Status**: OPEN — `critical`, `disclosure-candidate`. Both promotion-gates from the issue body now resolved with empirical evidence.

A typed server-pushed flag (server-controlled plugin-name allowlist) feeds a credential-injection helper: for each plugin on the list, the helper returns `{ANTHROPIC_AUTH_TOKEN: <accessToken>}` — the user's **live OAuth bearer**. The caller merges that token into the env of the subprocess spawned to run the plugin's `hooks/hooks.json` command. A server flip can opt arbitrary on-allowlist plugins into bearer-exfil with no user prompt, no policy-tier UI, and no signed-source assertion at the spawn site.

**Gate (a) resolved POSITIVE (session-61)**: passive MITM capture of a fresh server config-eval response with NO injection observed the production server pushing the allowlist with **30 plugin name-prefixes** by default — the official Anthropic-marketplace plugins (workflow + code-review + output-styles plus 12 LSP language-server adapters). The verbatim list matches a subset of the publicly-documented `anthropics/claude-plugins-official` marketplace catalogue: `security-guidance`, `code-review`, `commit-commands`, `code-simplifier`, `hookify`, `feature-dev`, `frontend-design`, `pr-review-toolkit`, `skill-creator`, `plugin-dev`, `agent-sdk-dev`, `mcp-server-dev`, `claude-code-setup`, `claude-md-management`, `playground`, `ralph-loop`, `explanatory-output-style`, `learning-output-style`, plus 12 `*-lsp` adapters (`clangd-lsp`, `csharp-lsp`, `gopls-lsp`, `jdtls-lsp`, `kotlin-lsp`, `lua-lsp`, `php-lsp`, `pyright-lsp`, `ruby-lsp`, `rust-analyzer-lsp`, `swift-lsp`, `typescript-lsp`).

**Gate (b) resolved NEGATIVE (session-60)**: a marketplace-name validator reserves the 9 hardcoded Anthropic marketplace IDs and rejects non-`anthropics/` sources with a "reserved" error. Spoofing a malicious plugin under an `anthropics/`-prefixed marketplace name is therefore not possible from the static path.

**Why CRITICAL**: the issue body declared promotion to CRITICAL on EITHER gate. Gate-(a) wire-confirmed on the production channel = surface is currently active in production with 30 plugins, today, every standard Pro account. Active attack vectors:
- **Supply-chain compromise** of any of the 30 official plugins (single PR → mass bearer egress at next hook fire for every user with that plugin installed).
- **MITM on the config-eval channel** (#106-class, no cert pinning): on-path attacker substitutes the pushed allowlist to add any other Anthropic-marketplace plugin's prefix; that plugin's hooks then receive the bearer.
- **Invisible to the user**: the plugin install flow does not warn that the plugin will receive the live OAuth bearer in its hook env.
- Per the OAuth-harness-bypass result-set the bearer alone is sufficient for full account compromise (inference, file listing, tool-use, reaction API).

**Persistence**: byte-stable v2.1.144 → v2.1.152 (the allowlist-flag literal count and the validator structure are byte-identical across 6 binary releases over 13 days; no remediation observed).

---

> **Out of post-audit scope** (relabeled `informational`, not in the audit-baseline tally): **#115** — a server-flippable mid-conversation-system substring-on-conversation-content predicate (v2.1.138). **Runtime-confirmed NEGATIVE and relabeled `disclosure-candidate` → `informational` (session-59).** Session-58 saw the predicate not fire on `--print`; session-59 drove a full interactive two-turn TUI with the canary injected into the flag AND present in the conversation body — the predicate still did not fire, and the beta-header set was byte-identical between the baseline and canary turns. The probe was re-run with a *valid model id* as the injected value to rule out a model-validator rejecting a synthetic canary — the beta-header diff was still null. The substring-trigger primitive as hypothesised is **not exercisable** by config-value injection on v2.1.143/v2.1.145, independent of input class and mode. The static decode stays catalogued; the runtime primitive is confirmed not exercisable, so the finding is no longer a disclosure candidate.
>
> **REMEDIATED + CLOSED in v2.1.156 (session-62, 2026-05-29).** The mid-conversation-system substring flag and its entire mechanism are gone from the binary across v152→v153→v156 — and **removed, not renamed**: no substring/includes-style predicate flag appears in the v153→v156 additions. GH #115 closed `completed`. Since #115 was already out-of-scope `informational`, the audit-baseline tally and the live label counts are unchanged.

---

## Countermeasure Summary

### Immediate (CRITICAL)

1. **Replace `execSync` with `execFileSync`** in `strategy-scrape.mjs` to eliminate shell interpretation of environment variables

### Short-term (HIGH)

2. **Set restrictive permissions** on temp/log files in hook-wrapper.sh (`umask 077`, use `mktemp`)
3. ~~**Add SRI hash** to Three.js CDN script in `docs/index.html`~~ — RESOLVED (2026-04-09)
4. **Document transcript privacy risk** in user-facing `/buddy` help text

### Medium-term (MEDIUM)

5. **Validate `--config-dir`** paths in `buddy-config.mjs` — reject paths outside `$HOME`
6. **Eliminate TOCTOU** — use try/catch instead of check-then-act in file operations
7. **Set explicit file modes** (`0o700` for dirs, `0o600` for files) in buddy-config.mjs
8. **Add CSP meta tag** to documentation site
9. **Use `O_EXCL` for temp files** in buddy-config.mjs to prevent symlink attacks
10. **Server-side rate limiting** for `buddy_react` API (independent of `addressed` flag)

### Best practice (LOW)

11. **Filter control/Unicode characters** in name/personality validation
12. **Replace innerHTML** with safe DOM methods in documentation JavaScript
13. **Monitor date gate** — companion disabled January-March due to month check bug in binary

---

## Appendix: Files Audited

| File | Lines | Vulnerabilities Found |
|------|------:|----------------------|
| `tools/shingle-capture/strategy-scrape.mjs` | 124 | C1 (command injection) |
| `tools/buddy-config.mjs` | 486 | M0 (path traversal), M1 (TOCTOU), M2 (permissions), M5 (symlink), L1 (validation) |
| `tools/shingle-capture/hook-wrapper.sh` | 88 | H1 (credential exposure) |
| `tools/shingle-mcp/server.js` | 198 | OBS1 (stat spoofing — intentional) |
| `tools/shingle-capture/strategy-replay.mjs` | 69 | OBS1 (stat spoofing — intentional) |
| `tools/shingle-capture/util.mjs` | 90 | H1 (credential handling) |
| `tools/shingle-capture/capture.mjs` | 63 | — (clean) |
| `tools/shingle-capture/launch.sh` | 48 | — (clean) |
| `docs/index.html` | 729 | ~~H2 (missing SRI)~~ RESOLVED, M3 (missing CSP) |
| `docs/app.js` | 195 | L2 (innerHTML) |
| `docs/style.css` | 851 | — (clean) |
