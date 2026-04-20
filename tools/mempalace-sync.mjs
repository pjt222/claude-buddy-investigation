#!/usr/bin/env node

// mempalace-sync.mjs — Sync Shingle capture logs into MemPalace
//
// Reads JSONL capture entries (from shingle-capture) and files each reaction
// as a structured drawer in the mempalace under wing "shingle" with per-trigger
// rooms (turn, pet, error, test-fail, etc.).
//
// Also records entity-relationship triples in the knowledge graph:
//   (Shingle, reacted-<trigger>, <reaction-text>)
//
// Usage:
//   node tools/mempalace-sync.mjs [capture-log] [--palace-dir <path>] [--dry-run]
//
// Requirements:
//   pip install mempalace
//   mempalace init <palace-dir>    (run once)
//
// The tool shells out to `mempalace` CLI for portability — no Python interop needed.

import { readFile, writeFile, stat } from "node:fs/promises";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { join, resolve } from "node:path";
import { homedir } from "node:os";

const exec = promisify(execFile);

const DEFAULT_LOG =
  process.env.SHINGLE_CAPTURE_LOG || join(homedir(), ".claude", "shingle-capture.jsonl");
const DEFAULT_PALACE =
  process.env.MEMPALACE_DIR || join(homedir(), ".shingle-palace");
const WING = "shingle";

// Known trigger types — used for allowlisting KG predicates
const KNOWN_TRIGGERS = {
  turn: "reactions",
  hatch: "milestones",
  pet: "affection",
  "test-fail": "debugging",
  error: "debugging",
  "large-diff": "code-review",
  // Debunked in v2.1.90 binary analysis — kept for forward compat
  // if future versions re-enable these triggers
  complete: "milestones",
  idle: "ambient",
  silence: "ambient",
};

// --- Argument parsing ---

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { logPath: DEFAULT_LOG, palaceDir: DEFAULT_PALACE, dryRun: false };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--palace-dir" && args[i + 1]) {
      opts.palaceDir = args[++i];
    } else if (args[i] === "--dry-run") {
      opts.dryRun = true;
    } else if (args[i] === "--help" || args[i] === "-h") {
      printUsage();
      process.exit(0);
    } else if (!args[i].startsWith("-")) {
      opts.logPath = args[i];
    }
  }

  // H1: Path traversal guard — palace dir must be inside $HOME
  const resolvedPalace = resolve(opts.palaceDir);
  const home = homedir();
  if (!resolvedPalace.startsWith(home + "/") && resolvedPalace !== home) {
    console.error(`Error: --palace-dir must be inside home directory (${home})`);
    process.exit(1);
  }
  opts.palaceDir = resolvedPalace;

  return opts;
}

function printUsage() {
  console.log(`
mempalace-sync — Sync Shingle capture logs into MemPalace

Usage:
  node tools/mempalace-sync.mjs [capture-log] [options]

Options:
  --palace-dir <path>   MemPalace directory (default: ~/.shingle-palace)
  --dry-run             Show what would be synced without writing
  --help, -h            Show this message

Environment:
  SHINGLE_CAPTURE_LOG   Capture log path (default: ~/.claude/shingle-capture.jsonl)
  MEMPALACE_DIR         Palace directory override

Examples:
  node tools/mempalace-sync.mjs
  node tools/mempalace-sync.mjs ~/.claude/shingle-capture.jsonl --dry-run
  node tools/mempalace-sync.mjs --palace-dir ~/my-palace
`);
}

// --- JSONL parsing ---

function parseEntries(content) {
  return content
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line, i) => {
      try {
        return JSON.parse(line);
      } catch {
        console.error(`  Skipping malformed line ${i + 1}`);
        return null;
      }
    })
    .filter(Boolean);
}

function extractReactions(entries) {
  const reactions = [];
  for (const entry of entries) {
    const ts = entry.timestamp || entry.ts || new Date().toISOString();
    const strategy = entry.strategy || "unknown";
    const entryTrigger = entry.trigger || entry.reason || "turn";

    // Entries may have a top-level reaction or nested results array
    if (entry.reaction) {
      reactions.push({
        timestamp: ts,
        strategy,
        trigger: sanitizeTrigger(entryTrigger),
        reaction: entry.reaction,
        latencyMs: entry.latencyMs || null,
      });
    }

    if (Array.isArray(entry.results)) {
      for (const r of entry.results) {
        if (r.reaction) {
          reactions.push({
            timestamp: ts,
            strategy: r.strategy || strategy,
            trigger: sanitizeTrigger(r.trigger || r.reason || entryTrigger),
            reaction: r.reaction,
            latencyMs: r.latencyMs || null,
          });
        }
      }
    }
  }
  return reactions;
}

// M6: Allowlist trigger values for safe KG predicate construction
function sanitizeTrigger(trigger) {
  if (KNOWN_TRIGGERS[trigger] !== undefined) return trigger;
  console.error(`  Unknown trigger "${trigger}" — defaulting to "turn"`);
  return "turn";
}

// --- MemPalace CLI wrappers ---

async function mempalaceExec(palaceDir, args) {
  try {
    const { stdout } = await exec("mempalace", args, {
      cwd: palaceDir,
      timeout: 15000,
    });
    return stdout.trim();
  } catch (err) {
    throw new Error(
      `mempalace ${args[0]} failed: ${err.stderr || err.message}`
    );
  }
}

async function checkPalaceExists(palaceDir) {
  try {
    await mempalaceExec(palaceDir, ["status"]);
    return true;
  } catch {
    return false;
  }
}

async function checkDuplicate(palaceDir, content) {
  try {
    const result = await mempalaceExec(palaceDir, [
      "search",
      "--",
      content.slice(0, 200),
    ]);
    // If search returns a high-similarity match, skip it
    const match = result.match(/similarity[:\s]+([\d.]+)/i);
    if (match && parseFloat(match[1]) > 0.95) {
      return true;
    }
  } catch {
    // Search failure is not fatal — proceed with filing
  }
  return false;
}

// C1 fix: Use spawn with manual stdin piping instead of promisify(execFile)
// which does not support the `input` option.
async function addDrawer(palaceDir, wing, room, content) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "mempalace",
      ["add", "--wing", wing, "--room", room, "--stdin"],
      { cwd: palaceDir }
    );
    const out = [];
    const err = [];
    child.stdout.on("data", (d) => out.push(d));
    child.stderr.on("data", (d) => err.push(d));
    child.on("close", (code) =>
      code === 0
        ? resolve(Buffer.concat(out).toString().trim())
        : reject(
            new Error(
              `mempalace add exited ${code}: ${Buffer.concat(err).toString()}`
            )
          )
    );
    child.on("error", reject);
    child.stdin.end(content);

    // Timeout guard
    setTimeout(() => {
      child.kill();
      reject(new Error("mempalace add timed out (15s)"));
    }, 15000);
  });
}

async function addKgTriple(palaceDir, subject, predicate, object) {
  return mempalaceExec(palaceDir, [
    "kg",
    "add",
    "--",
    subject,
    predicate,
    object,
  ]);
}

// --- Drawer content formatting ---

function formatDrawerContent(reaction) {
  // M5 fix: blockquote every line for multi-line reactions
  const quoted = reaction.reaction
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");

  const lines = [
    `# Shingle reaction (${reaction.trigger})`,
    ``,
    quoted,
    ``,
    `- Timestamp: ${reaction.timestamp}`,
    `- Trigger: ${reaction.trigger}`,
    `- Strategy: ${reaction.strategy}`,
  ];
  if (reaction.latencyMs) {
    lines.push(`- API latency: ${reaction.latencyMs}ms`);
  }
  return lines.join("\n");
}

function triggerToRoom(trigger) {
  return KNOWN_TRIGGERS[trigger] || "reactions";
}

// --- Timestamp normalization (M4-fix) ---

function toEpochMs(ts) {
  if (ts == null) return null;
  if (typeof ts === "number") return ts;
  const ms = new Date(ts).getTime();
  return Number.isNaN(ms) ? null : ms;
}

// --- Sync cursor for idempotency (M4) ---

function cursorPath(palaceDir) {
  return join(palaceDir, ".sync-cursor.json");
}

async function readCursor(palaceDir) {
  try {
    const raw = await readFile(cursorPath(palaceDir), "utf-8");
    return JSON.parse(raw);
  } catch {
    return { lastTimestamp: null, syncedCount: 0 };
  }
}

async function writeCursor(palaceDir, cursor) {
  await writeFile(
    cursorPath(palaceDir),
    JSON.stringify(cursor, null, 2) + "\n",
    "utf-8"
  );
}

// --- Main sync ---

async function main() {
  const opts = parseArgs();

  console.log(`\nMemPalace Sync for Shingle`);
  console.log(`  Capture log: ${opts.logPath}`);
  console.log(`  Palace dir:  ${opts.palaceDir}`);
  if (opts.dryRun) console.log(`  Mode:        DRY RUN`);
  console.log(``);

  // M7: Validate input file is a regular file (not symlink, directory, device)
  let fileStat;
  try {
    fileStat = await stat(opts.logPath);
  } catch (err) {
    if (err.code === "ENOENT") {
      console.error(`Capture log not found: ${opts.logPath}`);
      console.error(`\nRun a capture session first:`);
      console.error(`  source tools/capture-setup.sh`);
      console.error(`  bash tools/shingle-capture/launch.sh`);
      process.exit(1);
    }
    throw err;
  }

  if (!fileStat.isFile()) {
    console.error(`Capture log is not a regular file: ${opts.logPath}`);
    process.exit(1);
  }

  const content = await readFile(opts.logPath, "utf-8");
  const entries = parseEntries(content);
  const reactions = extractReactions(entries);

  if (reactions.length === 0) {
    console.log("No reactions found in capture log.");
    process.exit(0);
  }

  // M4: Skip already-synced reactions using cursor
  const cursor = opts.dryRun ? { lastTimestamp: null, syncedCount: 0 } : await readCursor(opts.palaceDir);
  const cursorEpoch = toEpochMs(cursor.lastTimestamp);
  const newReactions = cursorEpoch
    ? reactions.filter((r) => toEpochMs(r.timestamp) > cursorEpoch)
    : reactions;

  console.log(`Found ${reactions.length} reaction(s) total, ${newReactions.length} new since last sync\n`);

  if (newReactions.length === 0) {
    console.log("Nothing new to sync.");
    process.exit(0);
  }

  // Check mempalace is available
  if (!opts.dryRun) {
    const exists = await checkPalaceExists(opts.palaceDir);
    if (!exists) {
      console.error(`Palace not initialized at ${opts.palaceDir}`);
      console.error(`\nRun once:`);
      console.error(`  pip install mempalace`);
      console.error(`  mempalace init ${opts.palaceDir}`);
      process.exit(1);
    }
  }

  // Sync each reaction
  let synced = 0;
  let skipped = 0;
  let lastSyncedTimestamp = cursor.lastTimestamp;

  for (const reaction of newReactions) {
    const room = triggerToRoom(reaction.trigger);
    const drawerContent = formatDrawerContent(reaction);

    if (opts.dryRun) {
      console.log(`  [dry-run] ${WING}/${room}: "${reaction.reaction.slice(0, 60)}..."`);
      synced++;
      continue;
    }

    // Deduplicate (fallback — cursor is primary idempotency guard)
    const isDup = await checkDuplicate(opts.palaceDir, reaction.reaction);
    if (isDup) {
      skipped++;
      continue;
    }

    try {
      // H2 fix: Write KG triple first. If it fails, no orphan drawer is created.
      // Orphan triples (KG without drawer) are independently queryable and less harmful
      // than orphan drawers (drawer without KG) which block future retries via dedup.
      await addKgTriple(
        opts.palaceDir,
        "Shingle",
        `reacted-${reaction.trigger}`,
        reaction.reaction.slice(0, 100)
      );

      await addDrawer(opts.palaceDir, WING, room, drawerContent);

      synced++;
      lastSyncedTimestamp = toEpochMs(reaction.timestamp) || reaction.timestamp;
      process.stdout.write(".");
    } catch (err) {
      console.error(`\n  Failed to sync entry: ${err.message}`);
    }
  }

  // Update cursor
  if (!opts.dryRun && lastSyncedTimestamp) {
    await writeCursor(opts.palaceDir, {
      lastTimestamp: lastSyncedTimestamp,
      syncedCount: cursor.syncedCount + synced,
    });
  }

  console.log(`\n\nDone: ${synced} synced, ${skipped} duplicates skipped`);

  // Summary by room
  const roomCounts = {};
  for (const r of newReactions) {
    const room = triggerToRoom(r.trigger);
    roomCounts[room] = (roomCounts[room] || 0) + 1;
  }
  console.log(`\nBy room:`);
  for (const [room, count] of Object.entries(roomCounts).sort(
    (a, b) => b[1] - a[1]
  )) {
    console.log(`  ${WING}/${room}: ${count}`);
  }
}

main().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
