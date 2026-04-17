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
