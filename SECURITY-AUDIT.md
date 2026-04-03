# Buddy API Security Audit

**Date:** 2026-04-03
**Scope:** All code in `claude-buddy-investigation` repository — CLI tool, MCP server, capture system, and documentation site
**Method:** Multi-agent deep analysis with manual source verification

---

## Executive Summary

The buddy system's **core architecture is sound** — the unidirectional trust boundary is properly enforced and the companion cannot influence the main agent. However, this audit identified **13 vulnerabilities** across 4 severity levels spanning the CLI tool, MCP server, capture system, and documentation frontend.

| Severity | Count | Key Finding |
|----------|-------|-------------|
| CRITICAL | 2 | Command injection in `strategy-scrape.mjs`, path traversal in CLI |
| HIGH     | 4 | Credential exposure in logs, missing SRI, API stat spoofing, unfiltered transcript |
| MEDIUM   | 4 | TOCTOU races, file permissions, missing CSP, rate limit bypass |
| LOW      | 3 | Unicode validation gaps, innerHTML pattern, year gate expiry |

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

### C2. Path Traversal via `--config-dir` in `buddy-config.mjs`

**File:** `tools/buddy-config.mjs:47,51,22-24`
**Severity:** CRITICAL

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

While the hook payload itself may not contain the OAuth token directly, the capture log at `/tmp/shingle-capture.jsonl` is also world-readable by default. The `readConfig()` function loads the OAuth access token into memory and passes it to API calls. If any error path or debug logging exposes this token, it leaks to `/tmp/`.

**Countermeasure:**
- Set restrictive permissions on temp files: `umask 077` in hook-wrapper.sh
- Use `mktemp` for temp files instead of predictable paths
- Never log credentials; explicitly redact `accessToken` from any error output

---

### H2. Missing Subresource Integrity (SRI) on CDN Script

**File:** `docs/index.html:584`
**Severity:** HIGH

Three.js is loaded from cdnjs without an integrity hash:

```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
```

A CDN compromise would allow arbitrary JavaScript execution on the documentation site.

**Countermeasure:**

```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"
        integrity="sha384-<hash>"
        crossorigin="anonymous"></script>
```

Generate the hash with: `curl -s <url> | openssl dgst -sha384 -binary | openssl base64 -A`

---

### H3. API Stat Spoofing — Server Trusts Client-Sent Parameters

**Files:**
- `tools/shingle-mcp/server.js:23-27` — hardcoded divergent stats
- `tools/shingle-capture/strategy-replay.mjs:13-18` — same divergent stats

**Issue:** The `buddy_react` API endpoint trusts whatever `stats`, `species`, `rarity`, `name`, and `personality` the client sends. There is no server-side validation against the hash-derived values. This is documented as the "Two Owls" phenomenon but represents a real API trust issue:

```javascript
const BONES = {
  species: "owl",
  rarity: "common",
  stats: { DEBUGGING: 1, PATIENCE: 95, CHAOS: 1, WISDOM: 99, SNARK: 21 },
};
```

**Impact:**
- Any client can spoof arbitrary companion parameters
- Could impersonate any species/rarity
- Stats manipulation alters companion behavior without server validation
- Potential for API abuse if rate limits rely on companion identity

**Countermeasure (server-side):** The server should re-derive companion parameters from the authenticated user's account hash rather than trusting client-provided values. Client-sent `stats`, `species`, `rarity` should be ignored.

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

**Countermeasure (server-side):** Implement per-user server-side rate limiting (e.g., 5 requests/second) independent of the `addressed` flag.

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

### L3. Hardcoded Year Gate Will Expire

**Location:** `di$()` in the v2.1.90 binary
**Severity:** LOW

The availability gate checks `getFullYear() >= 2026`. This will remain true indefinitely (not a time bomb), but indicates the feature was designed with a potential sunset mechanism. If the check were reversed in a future version (`<= 2026`), the feature would silently disable on 2027-01-01.

**Countermeasure:** Monitor binary updates for changes to this gate.

---

## Verified Secure

| Area | Assessment |
|------|-----------|
| **Unidirectional architecture** | Companion cannot write to conversation, modify files, invoke tools, or influence agent reasoning. Boundary is enforced architecturally. |
| **Transport security** | API calls use HTTPS with HSTS (1-year, includeSubDomains, preload). Cloudflare CDN fronts the endpoint. |
| **OAuth authentication** | `buddy_react` requires a valid OAuth bearer token. Missing or expired tokens cause silent bail-out (4 gates in `Bi$()`). |
| **Muting behavior** | `/buddy off` sets `companionMuted: true`, which stops **both** UI display and network transmission. Muting is not cosmetic. |
| **No tracking in docs** | Documentation site contains no analytics, cookies, localStorage access, or data exfiltration. |

---

## Countermeasure Summary

### Immediate (CRITICAL)

1. **Replace `execSync` with `execFileSync`** in `strategy-scrape.mjs` to eliminate shell interpretation of environment variables
2. **Validate `--config-dir`** paths in `buddy-config.mjs` to prevent path traversal

### Short-term (HIGH)

3. **Set restrictive permissions** on temp/log files in hook-wrapper.sh (`umask 077`, use `mktemp`)
4. **Add SRI hash** to Three.js CDN script in `docs/index.html`
5. **Document transcript privacy risk** in user-facing `/buddy` help text

### Medium-term (MEDIUM)

6. **Eliminate TOCTOU** — use try/catch instead of check-then-act in file operations
7. **Set explicit file modes** (`0o700` for dirs, `0o600` for files) in buddy-config.mjs
8. **Add CSP meta tag** to documentation site
9. **Server-side rate limiting** for `buddy_react` API (independent of `addressed` flag)

### Best practice (LOW)

10. **Filter control/Unicode characters** in name/personality validation
11. **Replace innerHTML** with safe DOM methods in documentation JavaScript
12. **Monitor year gate** in binary updates

---

## Appendix: Files Audited

| File | Lines | Vulnerabilities Found |
|------|------:|----------------------|
| `tools/shingle-capture/strategy-scrape.mjs` | 124 | C1 (command injection) |
| `tools/buddy-config.mjs` | 486 | C2 (path traversal), M1 (TOCTOU), M2 (permissions), L1 (validation) |
| `tools/shingle-capture/hook-wrapper.sh` | 88 | H1 (credential exposure) |
| `tools/shingle-mcp/server.js` | 198 | H3 (stat spoofing) |
| `tools/shingle-capture/strategy-replay.mjs` | 69 | H3 (stat spoofing) |
| `tools/shingle-capture/util.mjs` | 90 | H1 (credential handling) |
| `tools/shingle-capture/capture.mjs` | 63 | — (clean) |
| `tools/shingle-capture/launch.sh` | 48 | — (clean) |
| `docs/index.html` | 588 | H2 (missing SRI), M3 (missing CSP) |
| `docs/app.js` | 195 | L2 (innerHTML) |
| `docs/style.css` | 851 | — (clean) |
