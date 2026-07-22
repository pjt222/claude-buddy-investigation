# Buddy API Security Audit

**Date:** 2026-04-03 (last updated: 2026-07-22 — current binary v2.1.217, coverage through v2.1.217, session 81)
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

The original repo-scoped audit baseline (14 items above) has been extended over time as the investigation expanded into the wider Claude Code harness binary. **16 post-audit findings** are tracked in the issue tracker, bringing the **audit-baseline tally to 30**: #31 AC3 (ghost-inbox forgery, 2026-04-14) + 6 mithril-probe harness findings (#73/#76 HIGH, #78/#80/#81/#85 MEDIUM, 2026-04-19) + #105 (HIGH, third-party telemetry processor, v126) + #106 (CRITICAL, brief stop-hook config-channel injection, v126) + #107 (HIGH, content-sharing tool, v128) + #108 (CRITICAL, permission-classifier inversion, v128, wire-confirmed v129 — REMEDIATED UPSTREAM v179, retained in census) + #110 (CRITICAL, field-level identifier egress, v129, wire-confirmed) + #113 (CRITICAL, forced-downgrade — run-to-completion wire-confirmed v2.1.152 session-61) + #114 (HIGH, #31 AC3 partial-defense, v138) + #127 (HIGH, startup-notice styled-text spoofing, v140 — Critical/ANSI vector REFUTED by the session-70 byte-test) + #136 (CRITICAL, server-pushed plugin-allowlist OAuth-bearer egress — gate-a wire-confirmed v2.1.152 session-61).

The 30-item audit-baseline tally by severity (per `docs/counts.js`): **7 critical / 9 high / 10 medium / 3 low / 1 observation**. (The +1 critical / +1 item vs the prior 29-item census is #136, promoted CRITICAL session-61; #127 sits in the HIGH bucket after its session-70 demotion.)

**Live GH-label re-derivation (2026-07-22, post-v217, session-81)**: 15 critical / 38 high-priority / 61 medium-priority / 15 low-priority = **128 severity-labeled across 169 repo issues**. The v2.1.216–v2.1.217 window added **two new harness findings** — **#169** (HIGH, v2.1.216: a server-pushed configuration string reaches model context verbatim through the built-in multiple-choice question tool's instruction text) and **#169** (LOW, v2.1.217: the subagent recursion-depth ceiling became a server-pushed integer with no upper bound) — with **zero regressions**. #169 is now the most recent new HIGH, displacing #165 (server-push plugin-instruction override into model context, v207–v212).

*Prior snapshot (2026-07-20, post-v215, session-80)*: 14 critical / 38 high-priority / 59 medium-priority / 14 low-priority = 125 severity-labeled across 165 repo issues. That window added **zero new harness findings**; its single +1 low was a **watch-tracker issue** (#166) opened to carry a server-selectable system-prompt-text-variant family that was deliberately *not* filed as a finding (see the v2.1.213–v2.1.215 note). The earlier medium/low/issue-count movement vs the 14/37/53/11-across-155 snapshot was a **catch-up folding an earlier issue batch** into the labelled census — it was NOT a burst of new findings.

The live tally counts ALL severity-labeled issues (including exploratory disclosure-candidates not tracked in the audit-baseline tally); it is re-derived DIRECTLY from the issue tracker each version-bump session, not by arithmetic over prior values. See `docs/counts.js` for the two-axis tally and re-derivation procedure. Per-finding detail for the 16 audit-baseline post-audit items — plus the five newer catalogue entries #154/#155/#165/#168/#169 (filed v179/v187/v207–v212/v216/v217, tracked only in the live tally) — is in the **Post-Audit Harness-Level Findings** section below.

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

The 14 audit-scoped items above cover the original repo-scoped audit. As the investigation expanded into the wider Claude Code harness binary (v2.1.107 → v2.1.217), post-audit findings were filed in the issue tracker. The audit-baseline census freezes **16** of them (the 30-item tally above); the five newest — **#154** and **#155** (filed v179/v187, session-69), **#165** (filed v207–v212, session-79), and **#168** / **#169** (filed v216/v217, session-81) — are catalogued here for completeness but are tracked only in the live GH-label tally, **not** the frozen-30 audit baseline. They are summarised here — full reproduction details, MITM artefacts, and disclosure timelines live in the issue tracker. Numbering uses `PAn` (Post-Audit) alongside the canonical issue number. Flag and minified-identifier names are redacted; functional descriptions only.

**Cross-version persistence (session-59):** all 21 priority-finding literals are byte-stable v143→v145 — **no remediation observed on any tracked finding** across the v143/v144/v145 chain. Runtime re-probes (#113, #127) reproduce on v2.1.145 identically to v2.1.143.

**Update through v2.1.217 (sessions 61–81):** the rolling per-version audit carried the priority-finding set forward to v2.1.217 with **one upstream remediation** — the default-true sandbox-classifier fail-open inversion (#108) was **removed at v2.1.179** (0 occurrences v179 through v217; retained in the finding census as a remediated Critical). Five new findings were filed across the window: **#154** CRITICAL (v179) and **#155** HIGH (v187) (see PA17/PA18), **#165** HIGH (v207–v212 window, session-79 — a server-push plugin-instruction override reaching model context via a trusted first-party plugin's instructions; see PA19), and, in the v216–v217 window (session-81), **#168** CRITICAL (a server-pushed configuration string reaching model context verbatim through the built-in multiple-choice question tool, wire-confirmed at session-82; see PA20) plus **#169** LOW (an unbounded server-pushed subagent recursion-depth ceiling; see PA21). The session-70 byte-test **demoted #127 Critical → High**. Every version-bump session from v2.1.193 through v2.1.206 (sessions 71–78) added **zero new findings, zero remediations, and zero regressions**; the v2.1.207 → v2.1.212 window (session-79) added **one new HIGH (#165)**, **zero regressions**, and **six hardening wins** — a transient model-context prompt route (gated behind a remote/co-work entrypoint, never reachable on a plain local session) removed one release after it appeared; a new default-off toggle that **adds authentication** to the server-controlled config channel; the memory subsystem's secret-skip guard hardened through a refactor to **hard-block** secret-bearing memory writes (fail-closed); the file-edit read-before-write guard-skip made **non-server-flippable** (the server can no longer force-skip it; write-path residual stays Low, tracked as #152); a new guard that **code-enforces the never-reuse-the-default-branch rule** for the cloud/teleport auto-PR path (partially closing the prior background-push watch item, W-BGPUSH); and the background-daemon anti-downgrade guard made **unconditional** (no server flag on its predicate). v196 carried a single hardening default-flip (an anti-MITM guard on artifact upload now defaults ON) plus a benign first-party plugin binary-asset provisioning path. v198 was a major feature release (browser automation went GA; background subagents that can auto-commit/push and open a **DRAFT** pull request; a new gateway upstream provider; a host-managed-credentials file reader; a chart-design skill; a design-consent endpoint), and v199/v200 added request-body compression, stacked slash-commands, a teleport repo-host verification guard, a SendMessage-misroute recipient guard, and a background "observer agents" capability — **all reviewed benign** (details in the v197–v200 note at the end of this section). The v213–v215 window (session-80) again added **zero new findings, zero remediations, and zero regressions**; it was, however, the **first non-pure-code window since v198** — every native section of the binary moved, fully **attributed** to a bundler/runtime **build-revision** bump under an unchanged semantic version (details in the v213–v215 note). The v216–v217 window (session-81) broke the flat run: **two new findings (#168 CRITICAL, #169 LOW), zero regressions, and the densest run of upstream remediation since v205** — three of the shipped fixes are **sandbox escapes of exactly the shape this investigation probes for** (symlink-following at the project configuration directory on workflow/scheduled-task writes, background-session isolation not canonicalizing symlinked working directories, and worktree-isolated subagents redirecting git back into the shared checkout), alongside a managed-settings fix that stops a lower-scope override redirecting telemetry away from an organisation's managed collector endpoint — directly relevant to the standing telemetry findings (#92 / #105 / #110). It was a **pure-JavaScript** window (details in the v216–v217 note). The v201–v206 window continued the flat trend (details in the v201–v206 note): v202 shipped a diagram-in-Artifacts feature that itself **ships an XSS sanitizer** for the rendered diagram output (a security-positive), v203 carried a ~5 MiB code **shrink** (a preview/render engine retired after the diagram path landed), v205 added a **security-positive** auto-mode exfil-command awareness enrichment, and v206 added a server-controlled staged-tool-call kill-switch plus a guarded end-conversation lifecycle tool — **all reviewed benign**. Standing anchors **#106 / #154 / #151 / #127 / #155 reproduce byte-identical through v2.1.217** — all twelve standing finding anchors are byte-stable across the v216–v217 window, and the memory subsystem's secret-skip guard remains intact at a flat occurrence count on both the organisation-memory and the new session-memory write paths (the ±1 anchor drifts at v205 and again in the v207–v212 window all decoded benign — see the v201–v206 and v207–v212 notes). The **#110** field-egress anchors **fell** at v2.1.213 (two counts dropped) — the shape a remediation takes, so it was **decoded rather than welcomed**: five inline plugin-command telemetry emits were collapsed into **one shared helper** (a DRY refactor); all five events still fire with **identical payloads and identical per-event counts**, so **#110 STANDS, unremediated** (see PA12). **#31 AC3 stays undefended (Critical)** — the v199 SendMessage-misroute fix is a recipient-side guard, orthogonal to the sender-side attribution forgery AC3 exploits, and the v205 and v207–v212 attribution-anchor rises are new *legitimate* error-path producers with the exploited consumer byte-identical. **Structural correction (session-73):** the earlier "unchanged since v181 / rebuild of one source tag" framing was **wrong** — it tracked a runtime-embedded constant that only rotates on a runtime bump, not the application build id. The app build id in fact **changes every release**, so **v181 → v217 are genuine per-release builds, not rebuilds of a single frozen source tag**; the bundled runtime was separately stable across v181 → v212, took a **build-revision** bump at v2.1.213 under an unchanged semantic version (the build-identity check was tightened accordingly — see the v213–v215 note), and is **flat again across v216 → v217**. Net direction across the full window: attack surface roughly flat — one safety inversion removed, one new CRITICAL (#168 at v216, promoted from High on wire confirmation) and one new HIGH (#165 at v207–v212) plus one new LOW (#169 at v217) filed, and runs of hardening wins in the v207–v212, v213–v215 and v216–v217 windows, against no regressions.

### PA1 / #31 AC3 — Skill-Forked Subagent Inbox Forgery (CRITICAL)

**Discovered**: 2026-04-14 (empirical). **Class**: Authorisation bypass via attribution laundering. The subagent ghost-inbox / attribution-forgery class — a skill-forked subagent can silently create inbox messages, and the attribution can be laundered. A transcript-replay variant remained undefended through v138 despite an SDK-stdin parser-level defense added in v123.

**v145 status — UNDEFENDED**: v2.1.145 added a skill self-recursion guard, which is **orthogonal** — it blocks a forked skill from re-invoking *itself* in its own forked subagent context (same-skill self-recursion only). It does NOT touch the cross-agent inbox-forge path. The relevant forge-field and inbox-handler anchors are byte-stable v143→v145. **#31 AC3 remains undefended on v2.1.145.**

**v2.1.217 status — still UNDEFENDED, but the nesting surface narrowed (session-81):** the subagent recursion-depth ceiling became configurable (see PA21 / #169), and the **shipped default dropped from a hardcoded 5 to 1** — strictly shrinking the nesting breadth this finding's laundering chain relies on. That is a **posture improvement, not a defense**: the sender-side attribution-forgery path itself is unchanged, and its anchors are byte-stable across the window. The countervailing note is that the same ceiling is now **server-pushable with no upper clamp**, so the narrowed default is not guaranteed.

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

### PA11 / #108 — Permission-Classifier Fail-Closed Inversion (CRITICAL) — REMEDIATED UPSTREAM v179

**Discovered**: 2026-05-04 (v2.1.128, Med-High); promoted CRITICAL 2026-05-06 via a MITM probe (v2.1.129). **Class**: Server-flippable safety-default inversion. A DEFAULT-TRUE flag controls the sandbox network classifier's fail-closed default. Server-flipping it false inverts to fail-open. The probe ran a 2-step rewrite chain (a config-eval inject plus a 503 for classifier requests) and produced a literal `(fail open)` line in the binary log. The auto-mode permission classifier site was wire-confirmed; the sandbox-network classifier site is deferred.

**REMEDIATED UPSTREAM at v2.1.179 (session-69)**: the default-true safety gate behind this inversion was **removed from the binary** — the server-flippable fail-open path no longer exists (0 occurrences v2.1.179 through v2.1.217). This is the first upstream remediation observed in the rolling per-version audit. The finding is retained in the audit-baseline census as a **remediated Critical** (it still counts toward the 7-critical census tally above).

### PA12 / #110 — Field-Level Identifier Egress (CRITICAL)

**Discovered**: 2026-05-05 (v2.1.129, HIGH); promoted CRITICAL 2026-05-06 via a MITM probe. **Class**: Telemetry field-level identifier leak. A destructure-rename pattern in the first-party telemetry pipeline extracts payload values into local variables and re-attaches them as top-level event fields; a sibling redactor strips the residual but not the destructured raw values explicitly re-attached at egress. Empirically: a single `claude --print` invocation produced 356 raw `skill_name` (355 unique) + 9 `plugin_name` (2 unique third-party) + 9 `marketplace_name` (2 unique third-party) on 2 event-logging batch POSTs. A forward-compat slot for raw REPL input exists at the destructure but no emitter populates it through v138 (escalate watch if a setter is ever added).

**v2.1.213 anchor drop — DECODED, NOT a remediation (session-80)**: two of the raw-field anchors **fell** (the plugin-name and marketplace-name occurrence counts dropped by four each). A falling anchor is exactly the shape an upstream fix takes, so it was decoded before being read as good news: v2.1.212's **five inline plugin-command telemetry emits were collapsed into a single shared helper** — a **DRY refactor**, not a redaction change. All five events still fire, with **identical payloads** and **identical per-event counts**; the raw fields still reach the telemetry egress. **#110 STANDS, unremediated.** This is recorded on the finding thread so a future audit does not misread the lower occurrence count as evidence of a fix.

### PA13 / #113 — Forced-Downgrade Primitive (CRITICAL) — RUN-TO-COMPLETION WIRE-CONFIRMED

**Discovered**: 2026-05-10 (v2.1.138 static decode). **Wire-confirmed**: 2026-05-20 (session-59, interactive TUI on v2.1.143; reproduced v2.1.145). **Promoted CRITICAL**: 2026-05-27 (session-61 docker session — run-to-completion on v2.1.152: the on-disk binary is actually swapped to the attacker-chosen older version via the auto-updater + npm install). **Class**: Server-pushed version-pin primitive driving an on-disk supply-chain swap. **Status**: OPEN — `critical`, `disclosure-candidate`, a wire-confirmed member of the disclosure bundle.

A typed-config reader returns a `{maxVersion, forceDowngradeEnabled}` object derived from a server-provided semver string; a sister primitive provides bidirectional version-pin via the same channel. User-side mitigation: a `~/.claude/settings.json` minimum-version floor blocks downgrades below it; the default is undefined, so most users are vulnerable. The documented auto-update mitigations (the auto-updates opt-out, release-channel settings) do NOT cover this server-controlled path — a user who "disabled auto-updates" per the official docs is still downgradable.

**Runtime evidence (session-59)**: PTY keystroke automation drove an interactive TUI under MITM with a forced-downgrade payload force-injected into every server config-eval response. The captured event-logging batch POST carried the forced-downgrade telemetry event decoding to a `{from_version, to_version, subscription_type}` triple; the TUI then rendered `Auto-updating…` — the client entered the downgrade flow, with the interactive flag set, with **no UI prompt and no user confirmation**.

**Run-to-completion (session-61, v2.1.152)**: the deferred "did-the-install-actually-complete?" gap is now closed. Same inject path on v2.1.152 drove the auto-updater through ALL four phases in one capture — config-eval inject lands → forced-downgrade telemetry fires → the apply path spawns `npm install -g @anthropic-ai/claude-code@<target>` (the MITM captured 7+ parallel `registry.npmjs.org` GETs against the package and the linux-x64 sub-package) → on-disk package at the npm global prefix is replaced. Post-probe `claude --version` reports the downgraded target; the npm global registry lists the older version. The binary on disk is actually swapped. The operator-visible signal during the swap is a single transient `Auto-updating…` line in the TUI status row with **identical wording to a benign upgrade** — no version named, no labelling as a downgrade, no prompt. Severity HIGH → **CRITICAL** on supply-chain primitive: a server-pushed config can pin any victim to an arbitrary older release, including versions with known CVEs or pre-defence behaviour for any other finding in the disclosure-candidate bundle.

### PA14 / #114 — Skip-Persistence Bypass on the AC3 Defense (HIGH)

**Discovered**: 2026-05-10 (v2.1.138 static decode); demoted to MEDIUM in a follow-up round; reverted to HIGH via an empirical SDK-wrapper survey. **Class**: Partial-defense bypass on the ghost-inbox transcript-replay variant. The message-chain insertion path has a bypass on the skip-persistence path. The skip-persistence path is reachable via an explicit no-session-persistence CLI flag, an SDK option, or an env var. A third-party SDK-wrapper survey found 97 unique public GitHub repos using the bypass flag; 5 of 7 sampled wrappers default unconditionally to the bypass-vulnerable mode (a large default-vulnerable share of the public ecosystem). Severity stays HIGH on empirical evidence.

### PA15 / #127 — TUI Startup-Notice Styled-Text Spoofing (HIGH — Critical REFUTED session-70)

**Discovered**: 2026-05-13 (v2.1.140 static decode); briefly bumped HIGH → CRITICAL in session-59 on a PTY-mounted MITM probe, then **DEMOTED Critical → High on 2026-06-25 (session-70)** by a byte-level re-test on the v2.1.191 image. **Class**: Server-pushed UI-string spoofing in the trusted TUI notification banner. **Status**: OPEN — `high-priority`.

A server-controlled string-flag is read via the server-to-client config-eval channel; its default state on the wire is empty/dormant. When the server flips the flag on with a string value, the notification string is rendered into the terminal banner through the Ink `<Text>` component. The session-59 probe reported "unsanitized ANSI escapes reached the terminal plus a bare phishing URL" and promoted the finding to Critical — but the **session-70 byte-level re-test refuted that**: the Ink/chalk render path **strips** the dangerous escape classes (cursor movement, clipboard write, DSR status-report, and the OSC 8 hyperlink) — **only colour survives**. The earlier "unsanitized ANSI" result was a substring grep that matched one benign colour SGR class; the dangerous classes were never actually exercised and are in fact removed by the renderer. The Critical cloaked-link / phishing / cursor-overwrite vector is therefore **not reachable**.

**Residual (HIGH)**: a server config push can still place server-controlled, colour-styled text into a banner the user trusts as first-party — a styled-text spoofing surface — but with **no cloaked link, no clipboard write, no model-context reach, and no credential reach**. GitHub relabelled #127 `critical` → `high-priority`. #127 is the sibling of #155 (PA18): both ride the same sanitizing Ink `<Text>` render path, and both had their Critical/OSC8 vector refuted by the same byte-test.

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

**Persistence**: byte-stable v2.1.144 → v2.1.152 (the allowlist-flag literal count and the validator structure are byte-identical across 6 binary releases over 13 days; no remediation observed). The credential-return idiom remains present through v2.1.217; the v198 host-managed-credentials file reader (see the v197–v200 note below) is the **best-hardened** member of this plugin-credential family (#136/#140/#151) — owner-only-permission + schema + process-liveness + expiry checks at the use-site, tokens held in memory and kept out of the inheritable subprocess environment, double-gated behind two operator-set environment variables with no server-push source — and does not relax #136.

### PA17 / #154 — Server-Pushed System-Prompt String → /v1/messages `system` Field (CRITICAL) — WIRE-CONFIRMED

**Discovered**: 2026-06 (v2.1.179 static decode, session-69). **Wire-confirmed**: session-69 (interactive TUI under MITM). **Class**: Server-controlled string reaches the model's *system* context verbatim. **Status**: OPEN — `critical`, `disclosure-candidate`. **Census note**: catalogued in the live GH-label tally only; not part of the frozen-30 audit baseline.

A new server-pushed string-flag (empty default, **no length cap**) is wired **verbatim** into the system-prompt dynamic-section builder, so a server-flipped value reaches the `/v1/messages` **`system`** field as `role:system` content. This is the #106 class — a server-controlled string entering model context, no length cap, no certificate pinning on the config-push channel — but with a **distinct flag and a distinct sink**: #106 injects `role:"user"`, whereas #154 injects the **system prompt** itself, the highest-trust position in the request. An interactive-TUI MITM probe injected a marker into the flag and observed it arrive in the `system` field of the outbound `/v1/messages` body verbatim. A single server config push can therefore prepend arbitrary instructions to the system prompt of a targeted user cohort, with no user prompt and no additional client-side compromise.

### PA18 / #155 — Server-Pushed Startup-Banner String Array (HIGH — Critical REFUTED)

**Discovered**: 2026-06 (v2.1.187 static decode, session-69). **Class**: Server-pushed, schema-validated terminal-string array rendered in the startup banner. **Status**: OPEN — `high-priority`. **Census note**: catalogued in the live GH-label tally only; not part of the frozen-30 audit baseline.

A new server-pushed, schema-validated array of terminal strings is rendered in the **startup banner** via the Ink `<Text>` component. A byte-level test (the same render path as #127) showed the Ink/chalk layer **strips** the dangerous escape classes (cursor, clipboard, DSR status-report, OSC 8 hyperlink) — **only colour survives** — so the Critical / phishing / OSC8 vector is **REFUTED**. **Residual (HIGH)**: server-controlled, colour-styled text spoofing in the trusted startup banner, with no cloaked link, clipboard, model-context, or credential reach. Sibling of #127 (PA15); both share the sanitizing render path.

### PA19 / #165 — Server-Pushed Plugin-Instruction Override → Model Context (HIGH)

**Discovered**: 2026-07-17 (v2.1.207–v2.1.212 window, session-79, static decode). **Class**: Server-controlled string reaches model context verbatim, attributed to a trusted first-party plugin. **Status**: OPEN — `high-priority`. **Census note**: catalogued in the live GH-label tally only; not part of the frozen-30 audit baseline.

A server-controlled configuration value can **override an official-marketplace or built-in plugin's model-facing text** — the plugin's MCP server-instructions plus the tool, parameter, prompt, and skill descriptions handed to the model — and the override text lands in model context **verbatim**. The payload is **type-validated only** (no content sanitization); the primary server-instructions field is length-capped but **not escaped**, and the other description maps are **uncapped**. This is a new instance of the **server-push-into-model-context class** (kin to the stop-hook injection #106 and the system-prompt injection #154) but with a **distinct flag, config key, and sink role**: the injected text is attributed to a **trusted first-party plugin's instructions**, so it inherits that plugin's implied trust in the model's eyes.

**Filed HIGH, not Critical**, because it is **default-off**, gated to **official / built-in plugins only** (a third-party plugin cannot be targeted), **fails safe** to the built-in text on a malformed payload, and is **not yet wire-confirmed**. Wire-confirmation — a MITM canary reaching the `/v1/messages` body through a plugin-instruction field — is the natural escalation and would move it toward the #106/#154 Critical tier.

### PA20 / #168 — Server-Pushed String → Multiple-Choice Question Tool Instructions (CRITICAL, wire-confirmed)

**Discovered**: 2026-07-22 (v2.1.216 static decode, session-81). **Class**: Server-controlled string reaches model context verbatim. **Status**: OPEN — `high-priority`. **Census note**: catalogued in the live GH-label tally only; not part of the frozen-30 audit baseline.

A **string-typed value on the server-to-client feature-configuration channel**, with an **empty default**, is interpolated **verbatim** into the instruction text of the **built-in multiple-choice question tool** — the tool Claude Code uses to ask the user to pick between options. That instruction text ships to the model on the `/v1/messages` endpoint, so a server flip places server-authored text directly into model context.

Two properties make it notable. First, **validation is a type check and a whitespace trim — no length cap, no schema, no allowlist**. Second, a **sibling value serving the same builder is read only inside a model-eligibility gate, whereas this one is read UNCONDITIONALLY**, so it applies to **every account regardless of model or tier**. The **empty default** means the mechanism is dormant until a server flip, making it invisible both in normal operation and in a static review of shipped behaviour. It **appends to** rather than overrides the base instruction text — a mitigation, but not a change of class.

This is the same primitive family as the previously reported server-pushed-string findings **#106 / #154 / #165**. **Filed HIGH, then WIRE-CONFIRMED and promoted to CRITICAL** (session-82, on v2.1.217): an injected value on the configuration channel arrived in the outbound `/v1/messages` request inside the question tool's own description field, spliced *mid-instruction* between two paragraphs of the genuine text with no delimiter, attribution, or quoting; the model-eligibility-gated sibling arrived at its default in the same capture, confirming the unconditional read on the wire.

**Suggested remediation**: cap the length; constrain the value to a **server-side allowlist of known variants** or an **enum index** rather than free text; and apply the same eligibility gate its sibling already has.

### PA21 / #169 — Unbounded Server-Pushed Subagent Recursion-Depth Ceiling (LOW)

**Discovered**: 2026-07-22 (v2.1.217 static decode, session-81). **Class**: Server-pushed resource-limit knob with no upper clamp. **Status**: OPEN — `low-priority`. **Census note**: catalogued in the live GH-label tally only; not part of the frozen-30 audit baseline.

The limit on **how deeply subagents may nest** stopped being a compiled-in constant. It now resolves as **operator environment variable → server-pushed integer (same configuration channel) → local default**, and the validator accepts **any integer ≥ 1 with no upper clamp**. The same accessor additionally decides whether **nested workers are handed the spawn capability at all**.

**Two things keep this LOW.** It is explicitly **not a permission or sandbox inversion** — no authorisation decision changes, only resource breadth. And the **shipped posture actually IMPROVED**: the previous release compared against a hardcoded depth of **5**, while v2.1.217 defaults to **1**, which strictly **shrinks** the nesting surface that the standing subagent-attribution finding (**#31**) depends on. Anthropic **documents both operator overrides** — a maximum subagent spawn depth and a maximum concurrent-subagents count (the latter defaulting to 20) — in the public changelog. **The finding is the unbounded REMOTE knob, not the default.**

**A candidate third issue here was checked and REFUTED**: the environment branch returns its value without an inline guard, which looked as though a malformed value could disable the cap entirely — but the environment registry entry is a **validated positive-integer parser**, so a bad value never reaches the comparison.

**Suggested remediation**: clamp the server-pushed value against a **compiled-in ceiling** rather than accepting it outright.

---

> **v2.1.196 note — zero new findings; one hardening flip + a benign feature (session-72, 2026-06-30):** the rolling audit found **no new findings** at v196 and **one hardening default-flip** — an anti-MITM guard on artifact upload was flipped default-OFF → ON (now on by default = a *strengthening*, the inverse of a fail-open). DEFAULT-TRUE boolean moved 27 → 28 (30 total with the 2 typed); a new runner-side MCP-policy-exempt gate is gated behind the cloud-runner environment and an already-bypass-permissions mode, so it is inert on the local CLI; and a subagent-context-omission gate was removed (its behaviour baked to the prior default). The headline new feature is **benign**: a plugin **binary-asset provisioning path** that fetches **sha256-pinned** binaries into a plugin's `bin/` from a **first-party content-addressed store**, gated to **official marketplaces only**, **default-off**, and the harness does **not execute** the placed files (execution stays mediated by the plugin's own already-trusted hooks). It was, as of v196, the best-hardened member of the plugin-credential family (#136/#140/#151) yet seen — logged as a WATCH, not a finding (the v198 host-managed-credentials file reader later took that crown; see the v197–v200 note). Also benign at v196: a read-only structured-output "report findings" tool for the code-review flow (local render, no egress) and a 1-bit A/B gate over two hard-coded skill-tool description strings. **Structural**: v196 is a genuine per-release build (the application build id changes every release; the bundled runtime is separately stable) that added ≈1 MiB of pure code, with no asset/native markers. [Corrected session-73: the earlier "source tag unchanged since v181 / rebuild of one tag" reading tracked a runtime-embedded constant that only rotates on a runtime bump, not the application build id.]
>
> **Out of post-audit scope** (relabeled `informational`, not in the audit-baseline tally): **#115** — a server-flippable mid-conversation-system substring-on-conversation-content predicate (v2.1.138). **Runtime-confirmed NEGATIVE and relabeled `disclosure-candidate` → `informational` (session-59).** Session-58 saw the predicate not fire on `--print`; session-59 drove a full interactive two-turn TUI with the canary injected into the flag AND present in the conversation body — the predicate still did not fire, and the beta-header set was byte-identical between the baseline and canary turns. The probe was re-run with a *valid model id* as the injected value to rule out a model-validator rejecting a synthetic canary — the beta-header diff was still null. The substring-trigger primitive as hypothesised is **not exercisable** by config-value injection on v2.1.143/v2.1.145, independent of input class and mode. The static decode stays catalogued; the runtime primitive is confirmed not exercisable, so the finding is no longer a disclosure candidate.
>
> **REMEDIATED + CLOSED in v2.1.156 (session-62, 2026-05-29).** The mid-conversation-system substring flag and its entire mechanism are gone from the binary across v152→v153→v156 — and **removed, not renamed**: no substring/includes-style predicate flag appears in the v153→v156 additions. GH #115 closed `completed`. Since #115 was already out-of-scope `informational`, the audit-baseline tally and the live label counts are unchanged.

---

> **v2.1.197 – v2.1.200 note — zero new findings; zero remediations; zero regressions (sessions 73–74, 2026-07-03):**
>
> **v197** (session-73) was a genuine small feature build (model-catalogue preparation for the next model). Two new benign surfaces: (1) a server-pushed config-cache key holding a **promo-expiry date**, **hard-sanitized** — re-parsed through a date formatter that discards the raw string — and shown **only in the model-picker UI**, so it never reaches model/system context or a permission gate; (2) a **documentation-only API endpoint** (reference text inside a bundled skill, with no in-harness caller and no local reachability). DEFAULT-TRUE flat.
>
> **v198–v200** (session-74). **v198** is a major feature release: browser automation went **GA** (out of scope for the server-channel audit — the browser tooling pre-dates v198, and the diff adds no server-controlled browser gate); background subagents now run in the background by default and, when launched from the background-agents view, **auto-commit/push and open a DRAFT pull request** on finishing code work; plus a new gateway upstream provider, a host-managed-credentials file reader, a chart-design skill, and a design-consent endpoint. **v199** added fixes, request-body compression, stacked slash-commands, a new **teleport repo-host verification guard**, and a **SendMessage-misroute recipient guard**. **v200** (npm `next`) added a background **observer-agents** capability plus background-agent auth-mismatch guards. All ~5.78 MiB of growth reconciles as compiled-bundle code (no embedded blob); the bundled runtime is unchanged; **genuine per-release builds**.
>
> **All new surfaces reviewed benign:** (a) the **host-managed-credentials file reader** is the best-hardened member of the credential family (#136) — owner-only-permission + schema + process-liveness + expiry checks at the use-site, tokens held in memory and kept **out of the inheritable subprocess environment**, double-gated behind two operator-set environment variables with **no server-push source**; not reachable from a plain local session. (b) **Parked-permission resume** for background / away-from-keyboard agents is **fail-closed** — a deferred permission only auto-resolves by replaying the user's own persisted answer; a timeout cancels and re-asks (no auto-approve). (c) The **background auto-push / draft-PR** path is worktree-isolated and DRAFT-only, and the merge/force-capable auto-approve allowlist is scoped to a user-invoked commit-push-PR command, absent from the background path. (d) The **away-from-keyboard question auto-advance** submits **only** answers the user already selected (unanswered questions become "skipped", never auto-picked) and is explicitly barred from plan / permission approval. (e) The **teleport repo-host telemetry** sits inside a **new repo-binding guard** that refuses on a repo mismatch — added defense, not a masked hole; the #99 teleport-chain layer is unchanged. (f) The **design-consent endpoint** sends only a boolean; artifact upload stays user-invoked and gated behind design-OAuth login + recorded consent + the default-on anti-MITM upload guard. (g) The **observer-agents** capability (a background agent that watches another) has a default-true gate that is **inert** behind an operator experimental environment variable — no server-push can enable it alone — and an observer influences the observed agent only through a harness-mediated report channel (the inbox / SendMessage path is blocked).
>
> **Two new WATCH items (functional, not findings):** *W-BGPUSH* — the background auto-push / draft-PR path is gated, but the never-push-to-main / no-force / no-merge boundary is **prompt-level, not code-enforced**. *W-OBSERVER* — the observer-agents default-true gate is inert behind an operator experimental environment variable; re-check if a future release drops that env gate.
>
> **DEFAULT-TRUE moved 30 → 32** (boolean 28 → 30, typed flat at 2) via two new default-true gates, **both benign** — one only toggles the explore/plan helper agents, so turning it OFF *reduces* capability rather than inverting a safety default; the other is the observer-agents gate, inert behind the operator env. **Neither is a safety-gate inversion.**
>
> **#31 AC3 re-checked (v199):** the SendMessage-misroute fix is a **recipient-side** guard (it refuses a silent re-send to a reused name after the resolved member has left) — **orthogonal** to the sender-side attribution forgery #31 AC3 exploits. #31 AC3 stays **UNDEFENDED (Critical)**, neither mitigated nor regressed. Standing findings **#106 / #110 / #154 / #151 / #127 / #155 reproduce byte-identical v197 → v200**; **#108 stays removed** (0 occurrences). No status changes.

---

> **v2.1.201 – v2.1.206 note — zero new findings; zero remediations; zero regressions (sessions 77–78, 2026-07-10):**
>
> **v201** (session-77) was a **near-pure refactor** — a genuine per-release build with net-zero size growth and no new surface once greedy-grep artefacts are discounted. **v202** shipped the **diagram-in-Artifacts** feature (≈ +10 MiB = a diagram-rendering + parser + HTML-sanitizer stack); notably it **ships an XSS sanitizer** for the rendered diagram SVG/HTML output — a **security-positive**. Two other v202 surfaces reviewed benign: (a) a cloud-runner **agent-proxy that MEDIATES credentials** — it injects a sentinel placeholder token into the tool subprocess environment and keeps the **real** credential **out** of it (the inverse of a credential leak); (b) a **refusal-fallback auto-retry** — a server-pushed boolean that swaps to a fallback model on an availability refusal, **not** a text-into-model-context primitive (distinct from #106). DEFAULT-TRUE moved **32 → 33** via a diagram-render capability toggle (non-#108).
>
> **v203** (session-78) carried the real delta of the window: a ~5 MiB code **SHRINK** — a preview/render engine was **retired** after the diagram path landed (pure code removal, no embedded blob; a shrink can neither add nor mask a finding, and all standing anchors stay byte-stable). Four safety-relevant candidates all decoded **benign**: (a) an auto-mode **edit-classification** capability, **default-OFF** — when enabled it routes edits to *more* scrutiny, the **inverse** of the removed #108 fail-open, not a safety inversion; (b) a **new default-true daemon-side downgrade-refusal guard** (security-positive: the background daemon refuses to self-restart into an *older* on-disk build; server-disableable, but disabling only reverts to prior behaviour — #113-adjacent, no new reach); (c) a new provider-auth environment variable for an already-scaffolded provider backend (operator-set, held in the credential-redaction lists); (d) a **resume-integrity filter** that **drops unlinked transcript records** on resume (the opposite of an attribution injection). DEFAULT-TRUE **33 → 34** (the daemon downgrade-refusal guard).
>
> **v204** (session-78) was a **mechanical rebuild** — a tiny code re-chunk with zero flag / environment / gate changes.
>
> **v205** (session-78) headline is a **security-positive auto-mode exfil-command awareness enrichment**: the auto-mode safety classifier now flags **exfil-capable** git / gh commands (push, remote set-url/add, PR/issue create, release upload, fork) and enriches its permission decision with the repo's public/private visibility (default-off, client-computed, sanitized) and git-status **paths** (default-off, paths / status only — **never** file content, length-capped, sent to the **first-party** classifier, no third-party sink). It is a **risk hint, not a decision** — no visibility branch flips a permission — analogous to the v160 two-stage classifier; **net-defensive**.
>
> **v206** (session-78) is a feature build (≈ +1.49 MiB compiled code): server-controlled **staged-tool-call gating** (a **kill-switch** — turning it off **refuses** the staged call, a capability reduction, not a fail-open), a new **end-conversation** agent-lifecycle tool (guarded — a subagent **cannot** end the parent conversation; local-only, no egress), a plan-review UI, and a telemetry cluster. DEFAULT-TRUE **34 → 35** (the staged-call kill-switch).
>
> **Two standing-finding anchors drifted by ±1 at v205 — BOTH decode benign:** the **#110** field-egress anchor fell by one occurrence (a semantics-preserving hoist of a telemetry emit above a branch — the egress is **unchanged, NOT remediated**); the **#31 AC3** attribution anchor rose by one (a **new legitimate producer** — an end-conversation abort branch stamping the field from a **real** source id — and the consumer that #31 exploits is **byte-identical**, so the gap is neither worsened nor fixed). An enable-gate **graduation** at v206: a design-integration enable environment variable was removed while the consent + guard boundary on its egress stayed **byte-stable** (feature-GA, not a masked hole).
>
> **Two new WATCH items (functional, not findings):** the v203 daemon downgrade-refusal guard is **server-disableable** (net-positive, #113-adjacent — disabling only reverts to prior behaviour); the v205 auto-mode exfil-awareness enrichment (net-defensive). **DEFAULT-TRUE across the window: 32 (v200) → 33 (v202) → 34 (v203) → 35 (v206)** — 33 boolean + 2 typed; **all additions benign, none a safety-gate inversion**. Standing findings **#106 / #110 / #154 / #151 / #127 / #155 reproduce byte-identical v200 → v206**; **#108 stays removed** (0 occurrences); **#31 AC3 stays UNDEFENDED (Critical)** — the v205 anchor rise is a legitimate new producer and the exploited consumer is byte-identical. All **genuine per-release builds**; the bundled runtime is unchanged. No status changes; the live label tally holds at 14 / 37 / 53 / 11 across 155 issues.

---

> **v2.1.207 – v2.1.212 note — one new finding (#165 HIGH); zero regressions; multiple hardening wins (session-79, 2026-07-17):**
>
> The window is **six genuine per-release builds** (a distinct application build id each), with the bundled runtime unchanged. The entire **+5.27 MiB** of growth is compiled application code confined to the bundle section (section-localized; the native-code and read-only-data sections are byte-identical across the installed releases, and **no embedded blob** appears in any of the six string-pair diffs).
>
> **One new finding — #165 (HIGH)** — a **server-push plugin-instruction override into model context** (see PA19): a server-controlled configuration value can override an official-marketplace or built-in plugin's model-facing text (the MCP server-instructions plus the tool / parameter / prompt / skill descriptions handed to the model), and the override lands in model context **verbatim** — **type-validated only** (the server-instructions field is length-capped but **unescaped**, the other maps are **uncapped**). It is a new instance of the #106 / #154 **server-push-into-model-context class** with a **distinct flag, config key, and sink role**, the injection attributed to a **trusted first-party plugin**. Filed **HIGH** (default-off, official / built-in plugins only — third-party plugins cannot be targeted, fails safe to the built-in text on a malformed payload, and not yet wire-confirmed); wire-confirmation is the natural escalation toward the #106 / #154 Critical tier.
>
> **Hardening this window (six wins):** (a) a **transient v207 feature** that briefly routed a server-pushed prompt string into model context — gated behind a remote / co-work entrypoint, **never reachable on a plain local session** — was **removed one release later**; (b) a **new default-off toggle ADDS authentication** to the server-controlled config channel; (c) the **memory subsystem's secret-skip guard survived and hardened a refactor** — it now **hard-blocks** secret-bearing memory writes, **fail-closed**; (d) the **read-before-write guard-skip** on the file-edit tool became **non-server-flippable** — the server can no longer force-skip it (the write-path residual stays Low, tracked as #152); (e) a new guard **code-enforces the never-reuse-the-default-branch rule** for the cloud / teleport auto-PR path — **partially closing the prior background-push watch item (W-BGPUSH)**; (f) the **anti-downgrade guard on the background daemon is now unconditional** (no server flag on its predicate).
>
> **Census: DEFAULT-TRUE 35 → 43** — **all eight additions benign**: each server OFF-flip either *reduces* capability or is a reliability / UI / approval-fail-closed toggle; **none inverts a permission decision**. Standing findings **#106 / #110 / #154 / #151 / #127 / #155 reproduce byte-stable v206 → v212**; the **#108** sandbox-classifier gate **stays removed** (zero occurrences); **#31 AC3 stays UNDEFENDED (Critical)** — its attribution anchor moved by a **single benign new error-path producer** whose exploited consumer is **byte-identical**. Live tally **14C / 38H / 59M / 13L across 164 issues** — the medium / low / issue-count movement vs the prior 14 / 37 / 53 / 11 across 155 snapshot is a **catch-up folding an earlier issue batch** into the labelled census (re-derived **directly from the tracker**, not by arithmetic), NOT a burst of new findings; the only new HIGH is #165.
>
> **Tooling:** a per-version delta-extractor **blind spot** was found and fixed — a minified accessor identifier that legitimately contains a dollar sign was excluded by the extractor's character class, which had briefly made a **stable** server-push config-key set read as **removed** (a false-removal artefact, corrected).

---

> **v2.1.213 – v2.1.215 note — zero new findings; zero remediations; zero regressions (session-80, 2026-07-20):**
>
> Three **genuine per-release builds** (a distinct application build id each). Method: a lead-owned factual spine plus a **16-unit decode-and-adversarially-verify fan-out**, followed by **two independent contrarian refinement passes** over the surviving residuals.
>
> **This was NOT a pure-code window — the first since v198.** Every native section of the binary moved and one runtime-internal section was dropped. The shift is fully **ATTRIBUTED** to a **bundler/runtime BUILD-REVISION bump under an unchanged semantic version**: the compiled-application-code share grew ≈ **1.34 MiB** while the binary as a whole grew only ≈ **1.09 MiB**, because the native side **shrank**. No embedded-executable markers appear in the new strings. The distinction is now tracked per window: an **attributed** native shift (the bundled runtime's revision moved) is expected and benign; an **unattributed** one would indicate first-party native code and is a decode trigger.
>
> **A standing-finding anchor FELL — and the drop decoded benign.** Two of the **#110** raw-field-egress anchors dropped. Because that is the shape a remediation takes, it was **decoded rather than welcomed**: v2.1.212's five inline plugin-command telemetry emits were collapsed into **one shared helper** — a **DRY refactor**. All five events still fire with **identical payloads and identical per-event counts**. **#110 STANDS, unremediated** (see PA12); the finding thread records this so a future audit does not misread the lower number as a fix.
>
> **Census:** DEFAULT-TRUE gates **43, FLAT** (41 boolean + 2 typed) — re-derived at **member level** rather than by count alone, since a count-stable set can still hide a swap; the added and removed sets were **both empty**. Server-pushed config-cache keys **9, flat** — the accessor identifier rotated again and was located **by definition body**, so the extractor was verified **not blind**. All other standing anchors byte-stable; the **#108** anchor stays at **zero** (remediated at v179).
>
> **Two WATCH items, neither filed as a finding** (both survived contrarian refinement as watch-only): (1) **Server-selectable system-prompt text variants** — a family of gates whose condition is an **OR**, not an AND, so a **server flag alone suffices**; one member omits a cautionary clause from tool-use guidance that the prior version rendered **unconditionally**, making a previously-unconditional guard **server-suppressible**. It is **NOT #106-class**: the server contributes only a boolean or a three-value enum, and **every rendered sentence is a literal already compiled into the client** — no server-authored text reaches model context. Watch-only because a fourth member of the family **predates this window** and because **#106 / #154 / #165 strictly dominate** it; tracked as a new **low-severity tracker issue (#166)**. (2) **A remote grant auto-resolving a local permission prompt** — **default-off**, triple-bounded in reach, **no durable allow-rule**, and the awaited grant is itself a **real user action on another first-party surface**, so it **relocates** an approval rather than fabricating one.
>
> **Hardening confirmed this window:** an **environment opt-out that hard-disables all model substitution, fail-closed** (a flagged message **pauses the session** rather than silently switching models); and the **full retirement of the morning-brief surface with zero successor**, completing the removal begun at v208.
>
> **Benign new surfaces:** a **local-only configuration-import command** with an unusually defensive apply path (refuses paths escaping the source directory, refuses project-scope writes under a symlink, never overwrites an existing target, and does not port hook definitions); **organization-memory literals that are telemetry, not flags** (server-to-local mirroring only, **no upload path added**); an **operator-environment-only first-party cloud provider** that **no server flag can reach**; and an **OpenTelemetry content-length control that returns a minimum**, so it can only **shorten** emitted content, never lengthen it.
>
> **Documentation-gap analysis refreshed (2026-07-20)** against the official Claude Code documentation corpus (170 pages), replacing the 2026-05-20 assessment. **The asymmetry narrowed but did not close.** Three prior gaps closed outright: the server-to-client feature-flag channel is now **named on the record as Anthropic's feature-flag service, with a documented opt-out environment variable (`DISABLE_GROWTHBOOK`)**; the teleport CLI flag is now fully documented; and the pre-tool-use hook's **input-REWRITE** surface is documented in detail. What did **not** move: across all 170 pages there is still **nothing** describing a server-pushed string that reaches the model's context or system prompt (**#106 / #154 / #165**), a server-pushed notice rendered in the terminal (**#127 / #155**), or a server-initiated version **DOWNGRADE** (**#113**) — and the Anthropic-bound operational-metrics channel is still described only by what it **excludes**, never by the identity metadata it carries (**#92 / #110**). Notably, the docs now make **affirmative security claims in two places where this repository holds contrary evidence** (background marketplace refresh disabling git credential helpers, and a teammate's relayed approval being treated as untrusted), which **strengthens** rather than weakens the disclosure posture for **#151** and **#31**.
>
> **Redaction tooling rebuilt (session-80).** The publish-time enforcer was inverted from a **hand-enumerated list of known-secret tokens** to **scan-and-subtract**: it now extracts every internal-shaped identifier from the public mirror and subtracts everything the **official documentation publishes**, so a newly-invented internal name is caught **on day one** instead of whenever someone remembers to add it. The governing rule is explicit — **a name published in the official docs is not sensitive and is used verbatim**. The publish-time redactors additionally **fail closed**, aborting the build rather than emitting an identifier no mapping table happens to cover. This immediately caught a class of leak the enumerated list had structurally **never looked for**.
>
> **Live tally: 14 critical / 38 high / 59 medium / 14 low across 165 issues** — the single +1 low is the **#166 watch tracker**; **zero new harness findings** this window.

---

> **v2.1.216 – v2.1.217 note — two new findings (#168 CRITICAL, #169 LOW); zero regressions; the most remediation-dense window since v2.1.205 (session-81, 2026-07-22):**
>
> Channel movement: npm `stable` advanced **v2.1.205 → v2.1.206**; `latest` = `next` = **v2.1.217**.
>
> **New finding — #168 (HIGH, v2.1.216):** a **server-pushed configuration string reaches model context verbatim** through the built-in **multiple-choice question tool's** instruction text — empty default, **no length cap and no schema or allowlist**, and read **unconditionally** where its sibling value is gated behind a model-eligibility check. Same primitive family as **#106 / #154 / #165**; filed HIGH, then wire-confirmed and promoted to **CRITICAL** at session-82 (the injected value arrived in the outbound request inside the question tool's own description field, spliced mid-instruction). Full detail in **PA20**.
>
> **New finding — #169 (LOW, v2.1.217):** the **subagent recursion-depth ceiling** became a **server-pushed integer with no upper clamp** (operator environment variable → server-pushed integer → local default). It is explicitly **not** a permission or sandbox inversion, and the **shipped posture improved** — the default fell from a hardcoded 5 to **1**, shrinking the nesting surface **#31** depends on. The finding is the **unbounded remote knob**, not the default. A third candidate in the same accessor — an environment branch returning without an inline guard — was **REFUTED** (the environment registry entry is a validated positive-integer parser, so a malformed value never reaches the comparison). Full detail in **PA21**.
>
> **Build shape: a pure-JavaScript window.** The compiled native sections are **byte-identical across all three builds**, the section count is unchanged, the embedded runtime build revision is **flat**, and there are **zero embedded executable blobs** in the new strings. The binary grew **+3.18 MiB** while printable text grew only ≈ **566 KB (17%)**; the binary-to-strings growth ratios are **6.2× and 5.4×** across the two increments — **consistent**, the signature of embedded bytecode scaling with source rather than a hidden payload. The new source splits across roughly **eight modest subsystems**: no mega-feature, **no new versioned API endpoints, and no new egress hosts**.
>
> **Remediation shipped upstream this window is unusually dense.** Three of the fixes are **sandbox escapes of exactly the shape this investigation probes for**: (a) workflow saves and scheduled-task writes **following a symlink at the project configuration directory**, which could redirect writes outside the project; (b) **background session isolation not canonicalizing symlinked working directories**, which could let a session escape its workspace folder; and (c) **worktree-isolated subagents redirecting git into the shared checkout** via `git -C`, `--git-dir`, or the `GIT_DIR` / `GIT_WORK_TREE` environment variables. Alongside those: Bash command permission checking for **compound statements with redirects** inside `&&` lists or negations; **read-only commands on Windows reaching network paths** without a permission prompt; permission validation of commands containing **invisible Unicode characters**; a **stale daemon lockfile** that could terminate an unrelated process; and a **managed-settings fix** so that lower-scope signal-specific overrides can no longer **redirect telemetry away from an organisation's managed collector endpoint** (`OTEL_EXPORTER_OTLP_ENDPOINT`) — directly relevant to the standing telemetry findings (**#92 / #105 / #110**).
>
> **One candidate was REFUTED rather than filed, and is recorded as a WATCH.** An **environment-supplied session-provenance string**, when set to a particular value and combined with a **server-authored marker**, does skip the **organisation-policy entitlement layer** of the gate governing whether dynamic workflow scripts may run. The mechanism is real and new — but **no feature-flag read participates**: the discriminator is a process environment string plus a boolean literal set at one call site, so it is **not a server-flippable flag inversion**. Local reachability is effectively nil (the marker is set only by the remote-event launch handler, which requires remote transport plus two cloud-runner environment identifiers, then validates a hash- and size-checked artefact pointer, and the script still passes size and control-character filters), and the **enterprise-strongest layer — the managed-settings disable — is unchanged**. Net assessment: the server bypassing **its own** entitlement layer is a **design choice, not an attacker primitive**.
>
> **Two family-name traps were also refuted, which is worth recording as method.** Two of this window's new configuration flags **share a naming prefix** with previously reported findings, and in both cases the shared prefix turned out to be **meaningless**. One sits in the same naming family as a confirmed server-pushed **system-prompt injection**, but its call site only selects between **two compiled-in English wordings** of a "this tool is not available" hint — **no server-supplied string is involved**. The other appeared adjacent to a **model-identifier comparison**, suggesting it might reroute which model serves a request; the adjacency is **minifier placement** — the declarations and the predicate have separate callers, and no reader in that block touches model selection, catalogue eligibility, or request routing. A third new flag that looked like an **auto-mode permission gate** turned out to be a **telemetry EVENT name, not a feature flag**; the **auto-mode safety classifier still fails CLOSED** when unavailable, verified directly.
>
> **Census, re-derived from the binaries rather than carried forward.** DEFAULT-TRUE gates moved **43 → 45**, re-derived at **member level** so a swap cannot hide beneath a flat total: the added set is **exactly two flags** and the removed set is **empty**. Both additions are **benign** — one gates **local housekeeping of bridge placeholder records**, the other gates **whether MCP tool errors throw versus return as an error object**, where the default-TRUE branch is the **stricter** of the two (so the shipped default is a small **hardening**). Neither reaches a permission, sandbox, egress, or credential sink. Server-push configuration-cache keys are **flat at 9 with identical members**. **All twelve standing finding anchors are byte-stable across the window**, and the memory subsystem's **secret-skip guard remains intact** at a flat occurrence count on **both** the organisation-memory and the **new session-memory** write paths.
>
> **Live tally: 15 critical / 38 high / 61 medium / 15 low across 169 issues** — the +1 high is **#169**, the +1 low is **#169**; re-derived directly from the issue tracker, not by arithmetic.

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
