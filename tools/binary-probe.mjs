#!/usr/bin/env node

// binary-probe.mjs — Offset-aware Claude Code binary probing helper
//
// Wraps `strings -t d` + offset-windowed re-extraction for repeatable
// binary investigation. Produced after Thread C + Skills API probes
// (2026-04-13) where the same extract → window → enumerate pattern was
// repeated by hand; this generalizes it.
//
// Commands:
//   scan    — print `offset  string` lines for every occurrence of a regex
//   window  — dump a byte-window of UTF-8-printable strings around one or
//             more offsets (for context around a hit)
//   enum    — enumerate unique matches of a regex with offset list + count
//   methods — list obj-method call patterns (e.g. `.skills.create(`) for a
//             given SDK-style surface, to distinguish used vs ghost surfaces
//
// All commands default to the latest binary under
// ~/.local/share/claude/versions/<semver>. Override with --binary <path>.
//
// Usage:
//   node tools/binary-probe.mjs scan '<gated-feature-prefix>_[a-z_]+' --minlen 8
//   node tools/binary-probe.mjs window 12345 67890 --radius 2048
//   node tools/binary-probe.mjs enum 'CLAUDE_CODE_[A-Z_]+'
//   node tools/binary-probe.mjs methods skills --surfaces create,retrieve,list
//   node tools/binary-probe.mjs scan 'anthropic-beta' --binary ~/.local/share/claude/versions/2.1.105

import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { spawnSync } from "node:child_process";

const VERSIONS_DIR = join(homedir(), ".local/share/claude/versions");
const DEFAULT_MIN_LEN = 6;
const DEFAULT_WINDOW_RADIUS = 1024;
const STRINGS_MAX_BUFFER = 200 * 1024 * 1024;

// --- Arg parsing (minimal; zero deps) ---

function parseArgs(argv) {
  const cmd = argv[0];
  const positional = [];
  const flags = {};
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      positional.push(a);
    }
  }
  return { cmd, positional, flags };
}

// --- Binary resolution ---

async function resolveBinary(flagPath) {
  if (flagPath) return flagPath;
  const entries = await readdir(VERSIONS_DIR);
  const versions = entries
    .filter((e) => /^\d+\.\d+\.\d+$/.test(e))
    .sort((a, b) => {
      const pa = a.split(".").map(Number);
      const pb = b.split(".").map(Number);
      for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
      return 0;
    });
  if (versions.length === 0) {
    throw new Error(`No versions found in ${VERSIONS_DIR}`);
  }
  return join(VERSIONS_DIR, versions[versions.length - 1]);
}

// --- Strings extraction ---

function runStrings(binaryPath, minLen = DEFAULT_MIN_LEN) {
  const result = spawnSync("strings", ["-t", "d", "-n", String(minLen), binaryPath], {
    encoding: "utf-8",
    maxBuffer: STRINGS_MAX_BUFFER,
    timeout: 120000,
  });
  if (result.status !== 0) {
    throw new Error(
      `strings exited ${result.status}: ${result.stderr?.slice(0, 200) || "(no stderr)"}`
    );
  }
  return result.stdout;
}

// Parse a single `strings -t d` line: "<spaces><decimal-offset> <content>".
// Returns { offset: number, text: string } or null if malformed.
function parseLine(line) {
  const m = /^\s*(\d+)\s(.*)$/s.exec(line);
  if (!m) return null;
  return { offset: Number(m[1]), text: m[2] };
}

function* iterLines(output) {
  let start = 0;
  for (let i = 0; i < output.length; i++) {
    if (output.charCodeAt(i) === 10) {
      yield output.slice(start, i);
      start = i + 1;
    }
  }
  if (start < output.length) yield output.slice(start);
}

// --- Commands ---

function cmdScan({ positional, flags, binaryPath }) {
  const pattern = positional[1];
  if (!pattern) throw new Error("scan: missing regex pattern");
  const re = new RegExp(pattern);
  const minLen = Number(flags.minlen || flags.n || DEFAULT_MIN_LEN);
  const limit = flags.limit ? Number(flags.limit) : Infinity;
  const output = runStrings(binaryPath, minLen);
  let hits = 0;
  for (const line of iterLines(output)) {
    const parsed = parseLine(line);
    if (!parsed) continue;
    if (re.test(parsed.text)) {
      console.log(`${String(parsed.offset).padStart(10)}  ${parsed.text}`);
      hits++;
      if (hits >= limit) break;
    }
  }
  console.error(`[scan] ${hits} match(es) for /${pattern}/`);
}

function cmdEnum({ positional, flags, binaryPath }) {
  const pattern = positional[1];
  if (!pattern) throw new Error("enum: missing regex pattern");
  const re = new RegExp(pattern, "g");
  const minLen = Number(flags.minlen || flags.n || DEFAULT_MIN_LEN);
  const output = runStrings(binaryPath, minLen);
  const seen = new Map(); // match → { count, offsets: [] }
  const offsetCap = Number(flags["offset-cap"] || 5);
  for (const line of iterLines(output)) {
    const parsed = parseLine(line);
    if (!parsed) continue;
    for (const m of parsed.text.matchAll(re)) {
      const key = m[0];
      const entry = seen.get(key) || { count: 0, offsets: [] };
      entry.count++;
      if (entry.offsets.length < offsetCap) {
        entry.offsets.push(parsed.offset + (m.index || 0));
      }
      seen.set(key, entry);
    }
  }
  const rows = [...seen.entries()].sort((a, b) => b[1].count - a[1].count);
  console.log(`# ${rows.length} unique match(es) for /${pattern}/`);
  console.log(`# count  offset(s){up to ${offsetCap}}  match`);
  for (const [match, { count, offsets }] of rows) {
    console.log(`${String(count).padStart(5)}  [${offsets.join(",")}]  ${match}`);
  }
}

function cmdWindow({ positional, flags, binaryPath }) {
  const offsets = positional.slice(1).map(Number);
  if (offsets.length === 0) throw new Error("window: need one or more offsets");
  if (offsets.some((o) => !Number.isFinite(o))) throw new Error("window: invalid offset");
  const radius = Number(flags.radius || DEFAULT_WINDOW_RADIUS);
  const minLen = Number(flags.minlen || flags.n || DEFAULT_MIN_LEN);
  const output = runStrings(binaryPath, minLen);

  // Bucket strings by offset. O(n log n) via sort would be nicer but lines
  // are already offset-sorted in `strings -t d` output, so linear works.
  const all = [];
  for (const line of iterLines(output)) {
    const parsed = parseLine(line);
    if (parsed) all.push(parsed);
  }

  for (const target of offsets) {
    console.log(`\n=== window around offset ${target} (±${radius} bytes) ===`);
    // Include any line whose span [offset, offset+text.length] INTERSECTS
    // the target window. Minified JS produces very long single lines, so a
    // pure start-offset check misses lines that begin far before the target
    // but extend past it.
    for (const { offset, text } of all) {
      const spanEnd = offset + text.length;
      if (spanEnd < target - radius) continue;
      if (offset > target + radius) break;
      const containsTarget = offset <= target && spanEnd >= target;
      const marker = containsTarget ? ">>" : "  ";
      console.log(`${marker} ${String(offset).padStart(10)}  ${text}`);
    }
  }
}

// Discover bundled-skill body regions via `var X=`# ` / `var X="# ` anchors.
// Each anchor marks the start of a skill-body template literal or string;
// the region extends to the next anchor (or BUNDLED_SKILL_MAX_BODY bytes,
// whichever is smaller). Used by cmdMethods to exclude code-in-doc false
// positives. See monitoring-2026-04-14.md for the calibration story.
const BUNDLED_SKILL_MAX_BODY = 500_000; // 500 KB per body safety cap

function discoverBundledSkillRanges(output) {
  const anchorRe = /var\s+[A-Za-z0-9_$]+\s*=\s*[`"]#\s/g;
  const anchors = [];
  for (const line of iterLines(output)) {
    const parsed = parseLine(line);
    if (!parsed) continue;
    for (const m of parsed.text.matchAll(anchorRe)) {
      anchors.push(parsed.offset + (m.index || 0));
    }
  }
  anchors.sort((a, b) => a - b);
  const ranges = [];
  for (let i = 0; i < anchors.length; i++) {
    const start = anchors[i];
    const nextAnchor = anchors[i + 1];
    const end =
      nextAnchor !== undefined && nextAnchor - start < BUNDLED_SKILL_MAX_BODY
        ? nextAnchor
        : start + BUNDLED_SKILL_MAX_BODY;
    ranges.push([start, end]);
  }
  return { anchors, ranges };
}

function mkIsInSkillBody(ranges, includeDocs) {
  return function isInSkillBody(offset) {
    if (includeDocs) return false;
    for (const [start, end] of ranges) {
      if (start > offset) break; // ranges are sorted ascending
      if (offset >= start && offset < end) return true;
    }
    return false;
  };
}

function cmdMethods({ positional, flags, binaryPath }) {
  const surface = positional[1];
  if (!surface) throw new Error("methods: missing surface (e.g. 'skills')");
  const methods = (flags.surfaces || "create,retrieve,list,delete,update")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const minLen = Number(flags.minlen || flags.n || DEFAULT_MIN_LEN);
  const includeDocs = Boolean(flags["include-doc-regions"]);
  const output = runStrings(binaryPath, minLen);

  const { anchors, ranges } = discoverBundledSkillRanges(output);
  const isInSkillBody = mkIsInSkillBody(ranges, includeDocs);

  // Two distinct checks:
  //  (A) endpoint strings: `/v1/<surface>` — presence of the API path
  //  (B) method call patterns: `.<surface>.<method>(` — actual invocations
  const endpointRe = new RegExp(`/v1/${surface}[/?]?`, "g");
  const methodRes = methods.map((m) => ({
    name: m,
    re: new RegExp(`[a-zA-Z_$][\\w$]*\\.${surface}\\.${m}\\(`, "g"),
  }));

  const endpointHits = [];
  const methodHits = Object.fromEntries(methods.map((m) => [m, []]));
  const excludedMethodHits = Object.fromEntries(methods.map((m) => [m, 0]));

  for (const line of iterLines(output)) {
    const parsed = parseLine(line);
    if (!parsed) continue;
    for (const m of parsed.text.matchAll(endpointRe)) {
      endpointHits.push({ offset: parsed.offset + (m.index || 0), context: parsed.text });
    }
    for (const { name, re } of methodRes) {
      for (const m of parsed.text.matchAll(re)) {
        const absOffset = parsed.offset + (m.index || 0);
        if (isInSkillBody(absOffset)) {
          excludedMethodHits[name]++;
          continue;
        }
        methodHits[name].push({
          offset: absOffset,
          pattern: m[0],
          context: parsed.text.slice(0, 200),
        });
      }
    }
  }

  console.log(`=== Surface probe: ${surface} ===\n`);
  console.log(
    `Discovered ${anchors.length} bundled-skill anchor(s), ${ranges.length} exclusion range(s)` +
      `${includeDocs ? " (BYPASSED via --include-doc-regions)" : ""}.\n`
  );
  console.log(`Endpoint string /v1/${surface}: ${endpointHits.length} occurrence(s)`);
  for (const h of endpointHits.slice(0, 10)) {
    const preview = h.context.length > 100 ? h.context.slice(0, 100) + "…" : h.context;
    console.log(`  ${String(h.offset).padStart(10)}  ${preview}`);
  }
  if (endpointHits.length > 10) console.log(`  … +${endpointHits.length - 10} more`);

  console.log(`\nMethod call patterns (.${surface}.METHOD(...)):`);
  let totalCalls = 0;
  let totalExcluded = 0;
  for (const m of methods) {
    const hits = methodHits[m];
    totalCalls += hits.length;
    totalExcluded += excludedMethodHits[m];
    const excludedNote = excludedMethodHits[m] > 0 ? ` (+${excludedMethodHits[m]} doc-excluded)` : "";
    console.log(`  .${surface}.${m}( → ${hits.length}${excludedNote}`);
    for (const h of hits.slice(0, 5)) {
      console.log(`    ${String(h.offset).padStart(10)}  ${h.pattern}`);
    }
  }

  console.log("");
  if (totalExcluded > 0 && !includeDocs) {
    console.log(
      `[filter] ${totalExcluded} method-call match(es) excluded because their offsets ` +
        `fall inside bundled-skill body regions (code-in-documentation false positives). ` +
        `Re-run with --include-doc-regions to see them.\n`
    );
  }
  if (endpointHits.length > 0 && totalCalls === 0) {
    console.log(
      `VERDICT: /v1/${surface} is bundled (${endpointHits.length} endpoint strings) ` +
        `but NOT invoked by the CLI (0 method calls outside bundled-skill docs). ` +
        `Candidate GHOST surface — same pattern as managed-agents and skills (2026-04-13).`
    );
  } else if (totalCalls > 0) {
    console.log(`VERDICT: /v1/${surface} appears LIVE — ${totalCalls} method call pattern(s) in CLI code.`);
  } else {
    console.log(`VERDICT: /v1/${surface} not present in binary.`);
  }
}

// Probe for SDK surfaces whose live-ness is expressed through class-constructor
// instantiation (e.g. `new <sdk-class-symbol>()` for the Files API class) rather than the
// dotted `obj.surface.method(` shape that cmdMethods detects. Complement to
// cmdMethods for surfaces that ship as a class + constructor chain.
function cmdConstructors({ positional, flags, binaryPath }) {
  const classPattern = positional[1];
  if (!classPattern) {
    throw new Error(
      "constructors: missing class name or regex (identifier rotates per minifier build, consult private notes)"
    );
  }
  const minLen = Number(flags.minlen || flags.n || DEFAULT_MIN_LEN);
  const includeDocs = Boolean(flags["include-doc-regions"]);
  const limit = flags.limit ? Number(flags.limit) : Infinity;
  const output = runStrings(binaryPath, minLen);

  const { anchors, ranges } = discoverBundledSkillRanges(output);
  const isInSkillBody = mkIsInSkillBody(ranges, includeDocs);

  // Match `new ClassName(` — word boundary before `new` avoids matching
  // `renew`/`nonew`. The class name is captured so we can group per-class
  // when the pattern matches multiple classes (e.g. `[a-zA-Z_$][\w$]+`).
  const re = new RegExp(`\\bnew\\s+(${classPattern})\\s*\\(`, "g");

  const liveByClass = {};
  const excludedByClass = {};

  for (const line of iterLines(output)) {
    const parsed = parseLine(line);
    if (!parsed) continue;
    for (const m of parsed.text.matchAll(re)) {
      const absOffset = parsed.offset + (m.index || 0);
      const className = m[1];
      const bucket = isInSkillBody(absOffset) ? excludedByClass : liveByClass;
      if (!bucket[className]) bucket[className] = [];
      if (bucket[className].length < limit) {
        bucket[className].push({
          offset: absOffset,
          pattern: m[0],
          context: parsed.text.slice(0, 200),
        });
      }
    }
  }

  const allClasses = new Set([...Object.keys(liveByClass), ...Object.keys(excludedByClass)]);
  const rows = [...allClasses]
    .map((name) => ({
      name,
      live: (liveByClass[name] || []).length,
      excluded: (excludedByClass[name] || []).length,
      samples: (liveByClass[name] || []).slice(0, 5),
    }))
    .sort((a, b) => b.live - a.live || b.excluded - a.excluded);

  console.log(`=== Constructor probe: /\\bnew\\s+(${classPattern})\\s*\\(/ ===\n`);
  console.log(
    `Discovered ${anchors.length} bundled-skill anchor(s), ${ranges.length} exclusion range(s)` +
      `${includeDocs ? " (BYPASSED via --include-doc-regions)" : ""}.\n`
  );

  if (rows.length === 0) {
    console.log(`No constructor pattern matched.`);
    return;
  }

  console.log(`Matches by class name (sorted by live-hit count):\n`);
  console.log(`  LIVE  DOC-EX  CLASS`);
  for (const row of rows) {
    const excludedNote = row.excluded > 0 ? String(row.excluded).padStart(5) : "    —";
    console.log(`  ${String(row.live).padStart(4)}  ${excludedNote}  ${row.name}`);
    for (const s of row.samples) {
      console.log(`    ${String(s.offset).padStart(10)}  ${s.pattern}`);
    }
  }

  const totalLive = rows.reduce((acc, r) => acc + r.live, 0);
  const totalExcluded = rows.reduce((acc, r) => acc + r.excluded, 0);
  console.log("");
  if (totalExcluded > 0 && !includeDocs) {
    console.log(
      `[filter] ${totalExcluded} constructor match(es) excluded because their offsets ` +
        `fall inside bundled-skill body regions. Use --include-doc-regions to see them.\n`
    );
  }
  if (totalLive === 0 && totalExcluded > 0) {
    console.log(
      `VERDICT: no live class-constructor instantiations outside bundled-skill docs. ` +
        `The class(es) appear only in documentation examples.`
    );
  } else if (totalLive > 0) {
    console.log(
      `VERDICT: ${rows.filter((r) => r.live > 0).length} class(es) present in SDK-setup code — ` +
        `${totalLive} live \`new\` call(s). NOTE: beta-client constructors typically ` +
        `instantiate ALL subclients together (multiple subclient classes constructed in the same ` +
        `parent constructor body), so instantiation does NOT by itself prove that the CLI uses ` +
        `the resulting subclient. Pair this with \`methods\` probe + direct-endpoint-POST ` +
        `search for conclusive live-ness.`
    );
  } else {
    console.log(`VERDICT: class pattern not present in binary.`);
  }
}

// Discover the per-version mapping from subclient property names (files,
// messages, completions, …) to the minified class identifiers that back
// them. Motivated by minifier-driven class-name rotation across CLI
// versions (identifier rotates per minifier build, consult private notes);
// a binary probe pinned to a specific minified name breaks silently on the
// next update. This command emits a stable subclient→class map that tools
// can consume to re-pin their probes.
//
// Pattern: `this.<subclient>=new <Class>(...)` — usually appears inside a
// client/beta-client constructor body. Minifier whitespace collapses to
// zero between `=` and `new`, so the regex tolerates an optional space.
function cmdSdkDiscover({ positional, flags, binaryPath }) {
  const subclientFilter = positional[1]; // optional: narrow to a specific subclient
  const minLen = Number(flags.minlen || flags.n || DEFAULT_MIN_LEN);
  const includeDocs = Boolean(flags["include-doc-regions"]);
  const jsonOut = Boolean(flags.json);
  const output = runStrings(binaryPath, minLen);

  const { anchors, ranges } = discoverBundledSkillRanges(output);
  const isInSkillBody = mkIsInSkillBody(ranges, includeDocs);

  // Require that the subclient name starts with a lower-case letter — upper
  // first letters would match template type params and collide with all the
  // minified class names that start with a capital.
  const assignRe = /\bthis\.([a-z][\w$]*)\s*=\s*new\s+([A-Za-z_$][\w$]*)\s*\(/g;

  // subclient -> { class -> [offsets] }
  const map = {};
  let excluded = 0;

  for (const line of iterLines(output)) {
    const parsed = parseLine(line);
    if (!parsed) continue;
    for (const m of parsed.text.matchAll(assignRe)) {
      const absOffset = parsed.offset + (m.index || 0);
      if (isInSkillBody(absOffset)) {
        excluded++;
        continue;
      }
      const [, subclient, klass] = m;
      if (subclientFilter && subclient !== subclientFilter) continue;
      if (!map[subclient]) map[subclient] = {};
      if (!map[subclient][klass]) map[subclient][klass] = [];
      map[subclient][klass].push(absOffset);
    }
  }

  if (jsonOut) {
    // Flatten to { subclient: { class: count } } for easy diffing.
    const flat = {};
    for (const [sub, classes] of Object.entries(map)) {
      flat[sub] = {};
      for (const [klass, offsets] of Object.entries(classes)) {
        flat[sub][klass] = offsets.length;
      }
    }
    console.log(JSON.stringify({ binary: binaryPath, subclients: flat }, null, 2));
    return;
  }

  const subs = Object.keys(map).sort();
  console.log(`=== SDK subclient discovery ===\n`);
  console.log(
    `Discovered ${anchors.length} bundled-skill anchor(s), ${ranges.length} exclusion range(s)` +
      `${includeDocs ? " (BYPASSED via --include-doc-regions)" : ""}.`
  );
  if (excluded > 0 && !includeDocs) {
    console.log(`[filter] ${excluded} assignment(s) excluded from bundled-skill bodies.`);
  }
  console.log("");
  if (subs.length === 0) {
    console.log(
      `No "this.<subclient>=new <Class>(" assignments found.` +
        (subclientFilter ? ` (filter: ${subclientFilter})` : "")
    );
    return;
  }
  console.log(`SUBCLIENT         CLASS(ES)  [count × first-offset]`);
  for (const sub of subs) {
    const classes = map[sub];
    const klasses = Object.entries(classes).sort((a, b) => b[1].length - a[1].length);
    const primary = klasses[0];
    const extra = klasses.slice(1);
    const [klass, offsets] = primary;
    console.log(
      `${sub.padEnd(16)}  ${klass.padEnd(10)} [${offsets.length}× @ ${offsets[0]}]`
    );
    for (const [k, offs] of extra) {
      console.log(`${" ".repeat(16)}  ${k.padEnd(10)} [${offs.length}× @ ${offs[0]}]`);
    }
  }
  console.log("");
  console.log(
    `Use this map to re-pin per-version binary probes. The minified class identifier for any ` +
      `given subclient rotates per minifier build — pass the current value to \`constructors <Class>\`.`
  );
}

// Enumerate `this._client.post("/v1/<path>", ...)` invocations. This shape
// is how the SDK surfaces actually reach the wire — more direct evidence of
// "this CLI will POST to that endpoint" than either method-call shape or
// constructor instantiation. Complements cmdMethods (dotted calls) and
// cmdConstructors (class setup). Groups hits by path and notes which ones
// look like they sit INSIDE a class body (heuristic: within 300 chars of a
// nearby `class ` or `constructor(` anchor in the same line).
function cmdPostPatterns({ positional, flags, binaryPath }) {
  const pathFilter = positional[1]; // optional: only show posts matching this path substring
  const minLen = Number(flags.minlen || flags.n || DEFAULT_MIN_LEN);
  const includeDocs = Boolean(flags["include-doc-regions"]);
  const output = runStrings(binaryPath, minLen);

  const { anchors, ranges } = discoverBundledSkillRanges(output);
  const isInSkillBody = mkIsInSkillBody(ranges, includeDocs);

  // Match .post("<anything>"...) to discover all post URLs, then keep only
  // those whose URL starts with /v1/. Most hits are the minified SDK path;
  // some may be user-agent literal definitions inside docs, which the
  // skill-body exclusion handles.
  const postRe = /\.post\(\s*["`]([^"`]+)["`]/g;
  const classAnchorRe = /\b(class\s+[A-Z_$][\w$]*|constructor\s*\()/;

  // path -> [ { offset, inClassBody, context } ]
  const byPath = new Map();
  let totalHits = 0;
  let excludedDocHits = 0;

  for (const line of iterLines(output)) {
    const parsed = parseLine(line);
    if (!parsed) continue;
    for (const m of parsed.text.matchAll(postRe)) {
      const url = m[1];
      if (!url.startsWith("/v1/") && !url.startsWith("/api/")) continue;
      if (pathFilter && !url.includes(pathFilter)) continue;
      const absOffset = parsed.offset + (m.index || 0);
      if (isInSkillBody(absOffset)) {
        excludedDocHits++;
        continue;
      }
      totalHits++;
      // Heuristic: is there a class/constructor anchor within 300 chars
      // before this post() call on the same line?
      const matchStart = m.index || 0;
      const lookback = parsed.text.slice(Math.max(0, matchStart - 300), matchStart);
      const inClassBody = classAnchorRe.test(lookback);
      const contextStart = Math.max(0, matchStart - 60);
      const contextEnd = Math.min(parsed.text.length, matchStart + 60);
      if (!byPath.has(url)) byPath.set(url, []);
      byPath.get(url).push({
        offset: absOffset,
        inClassBody,
        context: parsed.text.slice(contextStart, contextEnd),
      });
    }
  }

  console.log(`=== POST call enumeration ===\n`);
  console.log(
    `Discovered ${anchors.length} bundled-skill anchor(s), ${ranges.length} exclusion range(s)` +
      `${includeDocs ? " (BYPASSED via --include-doc-regions)" : ""}.`
  );
  if (excludedDocHits > 0 && !includeDocs) {
    console.log(`[filter] ${excludedDocHits} POST call(s) excluded from bundled-skill bodies.`);
  }
  console.log("");

  if (byPath.size === 0) {
    console.log(
      `No .post("/v1/…") calls found outside bundled-skill docs` +
        (pathFilter ? ` (filter: ${pathFilter})` : "") +
        `.`
    );
    return;
  }

  const rows = [...byPath.entries()]
    .map(([url, hits]) => {
      const inClass = hits.filter((h) => h.inClassBody).length;
      return { url, total: hits.length, inClass, outsideClass: hits.length - inClass, hits };
    })
    .sort((a, b) => b.total - a.total);

  console.log(`PATH                                              TOTAL  IN-CLASS  OUT`);
  for (const r of rows) {
    console.log(
      `  ${r.url.padEnd(48)}  ${String(r.total).padStart(5)}  ${String(r.inClass).padStart(8)}  ${String(
        r.outsideClass
      ).padStart(3)}`
    );
  }

  console.log(`\nSample sites (first 3 per path):`);
  for (const r of rows) {
    console.log(`\n  ${r.url}`);
    for (const h of r.hits.slice(0, 3)) {
      const marker = h.inClassBody ? "class" : "free ";
      console.log(`    [${marker}] @ ${String(h.offset).padStart(10)}  …${h.context}…`);
    }
  }

  console.log("");
  console.log(
    `Heuristic note: "IN-CLASS" means a \`class X\` or \`constructor(\` anchor appears ` +
      `within 300 chars before the .post() call on the same line. Minified JS lines are ` +
      `often very long so the heuristic is approximate; treat "OUT" hits as likely utility/free ` +
      `functions and "IN-CLASS" hits as likely SDK-class methods. Total hits: ${totalHits}.`
  );
}

// --- Main ---

async function main() {
  const { cmd, positional, flags } = parseArgs(process.argv.slice(2));
  if (!cmd || cmd === "--help" || cmd === "-h") {
    console.log(`binary-probe.mjs — offset-aware Claude Code binary probing

Commands:
  scan <regex>         Print "<offset>  <string>" for every match
  enum <regex>         Enumerate unique matches with counts and offsets
  window <offset...>   Dump string context ±radius around one or more offsets
  methods <surface>    Probe an SDK surface for endpoint strings AND method-call
                       patterns — distinguishes live from bundled-but-dead API.
                       Only detects the obj.surface.method( shape.
  constructors <pat>   Probe for class-constructor instantiation patterns
                       (e.g. new <sdk-class-symbol>() for Files API). Complements methods
                       for SDK surfaces that ship as a class instantiated
                       via the beta client chain. Accepts a class-name regex.
  sdk-discover [sub]   Emit a subclient→class map (this.<X>=new <Y>(...)) for
                       the current binary. Makes future per-version probes
                       transparent across minifier rotations. Optional arg
                       restricts to a single subclient (e.g. 'files').
  post-patterns [sub]  Enumerate .post("/v1/…") and .post("/api/…") call sites,
                       partitioned by "inside class body" vs "outside"
                       (heuristic). Optional arg filters by URL substring.

Common flags:
  --binary <path>     Binary to probe (default: latest in ${VERSIONS_DIR})
  --minlen <n>        Min string length for strings(1) (default: ${DEFAULT_MIN_LEN})
  --radius <n>        window: bytes around target offset (default: ${DEFAULT_WINDOW_RADIUS})
  --limit <n>         scan/constructors: cap output
  --offset-cap <n>    enum: offsets to show per match (default: 5)
  --surfaces <list>   methods: comma-separated method names
                      (default: create,retrieve,list,delete,update)
  --include-doc-regions  Disable bundled-skill body exclusion (shows
                         code-in-documentation false positives; default: filter)
  --json              sdk-discover: JSON output for diffing across versions

Examples:
  node tools/binary-probe.mjs scan 'CLAUDE_CODE_[A-Z_]+'
  node tools/binary-probe.mjs enum '/v1/[a-z]+' --offset-cap 10
  node tools/binary-probe.mjs window 123456 --radius 4096
  node tools/binary-probe.mjs methods skills
  node tools/binary-probe.mjs methods agents --include-doc-regions
  node tools/binary-probe.mjs constructors '<sdk-class-symbol>'
  node tools/binary-probe.mjs constructors '[A-Za-z_][A-Za-z0-9_]*[A-Z][A-Za-z0-9_]+'
  node tools/binary-probe.mjs sdk-discover
  node tools/binary-probe.mjs sdk-discover files
  node tools/binary-probe.mjs sdk-discover --json
  node tools/binary-probe.mjs post-patterns
  node tools/binary-probe.mjs post-patterns messages
`);
    return;
  }

  const binaryPath = await resolveBinary(flags.binary);
  console.error(`[binary-probe] using ${binaryPath}`);

  const ctx = { positional: [cmd, ...positional], flags, binaryPath };
  switch (cmd) {
    case "scan":
      cmdScan(ctx);
      break;
    case "enum":
      cmdEnum(ctx);
      break;
    case "window":
      cmdWindow(ctx);
      break;
    case "methods":
      cmdMethods(ctx);
      break;
    case "constructors":
      cmdConstructors(ctx);
      break;
    case "sdk-discover":
      cmdSdkDiscover(ctx);
      break;
    case "post-patterns":
      cmdPostPatterns(ctx);
      break;
    default:
      throw new Error(`unknown command: ${cmd} (try --help)`);
  }
}

main().catch((err) => {
  console.error(`binary-probe failed: ${err.message}`);
  process.exit(1);
});
