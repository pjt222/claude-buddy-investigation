// index.ts — Buddy Workspace backend entry point
// Mode: PTY (default) embeds Claude CLI directly via node-pty
//        WEZTERM (BUDDY_PANE_ID env var) mirrors an external WezTerm pane

import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { Transcript } from "./transcript.ts";
import { callBuddyReact, getCooldownRemaining } from "./buddy-api.ts";
import { spawnClaude, writeInput, resizePty, isRunning } from "./pty-manager.ts";
import {
  loadSession,
  listPresets,
  getActiveBuddies,
  getSessionInfo,
  getCurrentSession,
} from "./session-manager.ts";
import { evaluateSkills, recordError, resetSession } from "./skill-engine.ts";
import { PaneWatcher } from "./pane-watcher.ts";
import {
  stripAnsi,
  stripForTranscript,
  extractBubbleText,
} from "./transcript-filter.ts";
import {
  classifyContent,
  TriggerQueue,
  COOLDOWN_BY_PRIORITY,
  type TriggerPriority,
} from "./trigger-priority.ts";
import { analyzeBuddyConvergence } from "./convergence.ts";
import { Events } from "../shared/protocol.ts";
import type {
  UserInputPayload,
  BuddyReactionPayload,
  StatusPayload,
} from "../shared/protocol.ts";

import { join as pathJoin } from "node:path";
import { existsSync, readFileSync } from "node:fs";

const PORT = parseInt(process.env.BUDDY_PORT || "3777", 10);
const IS_PROD = process.env.NODE_ENV === "production";
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: IS_PROD ? undefined : { origin: /^http:\/\/localhost:\d+$/, methods: ["GET", "POST"] },
});

// REST API — registered before SPA fallback so /api/* routes work in production
app.get("/api/status", (_req, res) => {
  const buddies = getActiveBuddies();
  const cooldowns: Record<string, number> = {};
  for (const b of buddies) {
    cooldowns[b.identity.name] = getCooldownRemaining(b.identity.name);
  }
  res.json({
    connected: true,
    claudePaneId: isRunning() ? -1 : null,
    session: getSessionInfo(),
    buddyCooldowns: cooldowns,
  } satisfies StatusPayload);
});

// In production, serve the Vite-built frontend from dist/
const distDir = pathJoin(import.meta.dirname, "..", "dist");
if (IS_PROD && existsSync(distDir)) {
  app.use(express.static(distDir));
  // SPA fallback — serve index.html for non-API routes
  app.get("*", (_req, res) => {
    res.sendFile(pathJoin(distDir, "index.html"));
  });
}

const transcriptStore = new Transcript();
const transcriptDir = pathJoin(import.meta.dirname, "..", ".transcript");
transcriptStore.initPersistence(transcriptDir);
transcriptStore.loadFromDisk();

// --- Buddy reaction triggering ---

let reactionDebounce: ReturnType<typeof setTimeout> | null = null;
let accumulatedOutput = "";
let batchInFlight = false; // Prevents overlapping buddy API batches
let convergenceTimer: ReturnType<typeof setTimeout> | null = null;

async function triggerBuddyReactions(transcript: string, reason: TriggerPriority): Promise<void> {
  const buddies = getActiveBuddies();
  if (buddies.length === 0) return;

  // Gate: skip if a previous batch is still in-flight (per-buddy cooldowns
  // in buddy-api.ts would prevent duplicate emissions, but this avoids
  // wasted API calls and convergence pollution entirely).
  if (batchInFlight) {
    console.log(`  [trigger] skipped ${reason} — batch already in-flight`);
    return;
  }
  batchInFlight = true;

  // Cancel any prior convergence timer so a new batch starts clean
  if (convergenceTimer) {
    clearTimeout(convergenceTimer);
    convergenceTimer = null;
  }

  if (reason === "error") {
    recordError();
  }

  const skillDecisions = evaluateSkills(buddies, reason);
  const skillMap = new Map(skillDecisions.map((d) => [d.buddy.identity.name, d]));

  // Snapshot transcript length before this batch so convergence only
  // analyzes reactions from THIS batch, not earlier ones.
  const transcriptLengthBefore = transcriptStore.getRecent(999).length;

  // Track completion of all buddy calls
  let completed = 0;
  const totalBuddies = buddies.length;

  // Serialize buddy calls with 1.5s stagger to avoid 429 rate limits
  let staggerDelay = 0;
  for (const buddy of buddies) {
    const delay = staggerDelay + buddy.delayMs;
    staggerDelay += 1500;
    setTimeout(async () => {
      try {
        const decision = skillMap.get(buddy.identity.name);
        const result = await callBuddyReact(
          buddy.identity,
          transcript,
          reason,
          buddy.cooldownMs,
          decision ? { skill: decision.skill, skillContext: decision.context } : undefined
        );

        if (result.error) {
          console.log(`  [${buddy.identity.name}] error: ${result.error}`);
        }
        if (result.reaction) {
          recordApiReaction(buddy.identity.name, result.reaction);
          const reactionPayload: BuddyReactionPayload = {
            name: buddy.identity.name,
            species: buddy.identity.species,
            tier: buddy.tier,
            slot: buddy.slot,
            reaction: result.reaction,
            trigger: reason,
            skill: result.skill,
            timestamp: Date.now(),
          };

          io.emit(Events.BUDDY_REACTION, reactionPayload);

          const entry = transcriptStore.add("buddy", result.reaction, {
            buddyName: buddy.identity.name,
            buddyTier: buddy.tier,
            channel: "api",
            trigger: reason,
            skill: result.skill,
          });
          io.emit(Events.TRANSCRIPT_ENTRY, entry);

          console.log(`  ${buddy.identity.name}: ${result.reaction.slice(0, 60)}...`);
        }
      } finally {
        completed++;
        if (completed === totalBuddies) {
          batchInFlight = false;

          // Run convergence analysis now that all buddies have responded.
          // Only look at entries added during THIS batch.
          const allRecent = transcriptStore.getRecent(999);
          const batchEntries = allRecent.slice(transcriptLengthBefore);
          const result = analyzeBuddyConvergence(batchEntries);
          if (result.converged.length > 0 && result.buddyCount >= 2) {
            const convergencePayload = {
              topics: result.converged.map((t) => t.topic),
              buddies: [...new Set(result.converged.flatMap((t) => t.buddies))],
              totalReactions: result.totalReactions,
              timestamp: Date.now(),
            };
            io.emit(Events.CONVERGENCE_SIGNAL, convergencePayload);

            const topTopics = result.converged.slice(0, 3).map((t) =>
              `${t.topic} (${t.buddies.join(", ")})`
            ).join("; ");
            const entry = transcriptStore.add("buddy", `[convergence] ${topTopics}`, {
              buddyName: "system",
              channel: "api",
              trigger: reason,
            });
            io.emit(Events.TRANSCRIPT_ENTRY, entry);
            console.log(`  [convergence] ${result.converged.length} topics across ${result.buddyCount} buddies`);
          }
        }
      }
    }, delay);
  }
}

function emitStatus(): void {
  const buddies = getActiveBuddies();
  const cooldowns: Record<string, number> = {};
  for (const b of buddies) {
    cooldowns[b.identity.name] = getCooldownRemaining(b.identity.name);
  }

  const status: StatusPayload = {
    connected: true,
    claudePaneId: isRunning() ? -1 : null,
    session: getSessionInfo(),
    buddyCooldowns: cooldowns,
  };
  io.emit(Events.STATUS_UPDATE, status);
}

// --- Handle PTY output for transcript + buddy reactions ---

// Buffer raw PTY output to catch bubbles that span multiple chunks
let rawBuffer = "";
let bubbleDebounce: ReturnType<typeof setTimeout> | null = null;
let lastBubbleText = ""; // dedup

// Track recent API-triggered bubble buddy reactions for dedup against native bubbles.
// The bubble buddy name comes from ~/.claude/.claude.json and may not be "Shingle".
const recentApiReactions: Array<{ text: string; timestamp: number }> = [];
const API_REACTION_DEDUP_WINDOW = 60000; // 60s window

function recordApiReaction(buddyName: string, reactionText: string): void {
  // Only track bubble-tier buddies (whose native bubbles appear in the PTY stream)
  const bubbleBuddy = getActiveBuddies().find((b) => b.tier === "bubble");
  if (!bubbleBuddy || bubbleBuddy.identity.name !== buddyName) return;
  recentApiReactions.push({ text: reactionText, timestamp: Date.now() });
  // Prune old entries
  const cutoff = Date.now() - API_REACTION_DEDUP_WINDOW;
  while (recentApiReactions.length > 0 && recentApiReactions[0].timestamp < cutoff) {
    recentApiReactions.shift();
  }
}

function isDuplicateOfApiReaction(bubbleText: string): boolean {
  const cutoff = Date.now() - API_REACTION_DEDUP_WINDOW;
  const normalized = bubbleText.toLowerCase().replace(/\s+/g, " ").trim();
  return recentApiReactions.some((r) => {
    if (r.timestamp < cutoff) return false;
    const apiNormalized = r.text.toLowerCase().replace(/\s+/g, " ").trim();
    // Exact match or one contains the other (bubbles are often truncated)
    return apiNormalized === normalized ||
      apiNormalized.includes(normalized) ||
      normalized.includes(apiNormalized);
  });
}

function scanForBubble(): void {
  const bubbleText = extractBubbleText(rawBuffer);
  if (bubbleText && bubbleText !== lastBubbleText) {
    // Skip if this bubble text duplicates a recent API reaction
    if (isDuplicateOfApiReaction(bubbleText)) {
      console.log(`  [bubble] Shingle: dedup skipped (matches API reaction)`);
      lastBubbleText = bubbleText;
    } else {
      lastBubbleText = bubbleText;
      const bubbleBuddy = getActiveBuddies().find((b) => b.tier === "bubble");
      const bubbleName = bubbleBuddy?.identity.name || "Companion";
      const entry = transcriptStore.add("buddy", bubbleText, {
        buddyName: bubbleName,
        buddyTier: "bubble",
        channel: "native",
        trigger: "turn",
      });
      io.emit(Events.TRANSCRIPT_ENTRY, entry);
      console.log(`  [bubble] Shingle: ${bubbleText.slice(0, 60)}`);
    }
  }
  // Keep only last 4KB to prevent unbounded growth
  if (rawBuffer.length > 4096) {
    rawBuffer = rawBuffer.slice(-2048);
  }
}

// Quality gate: does this text look like real Claude output (not TUI chrome)?
function isSubstantiveContent(text: string): boolean {
  const alphaCount = (text.match(/[a-zA-Z]/g) || []).length;
  // 8 chars allows short messages like "Done." while still filtering raw escape debris
  if (alphaCount < 8) return false;
  if (alphaCount / text.length < 0.4) return false;
  // Must contain at least one word of 4+ letters (not just fragments)
  if (!/[a-zA-Z]{4,}/.test(text)) return false;
  return true;
}

// Adaptive reaction cooldown — shorter for errors/large-diffs, longer for normal turns.
// A single-slot queue ensures the highest-priority suppressed trigger replays after cooldown.
let lastReactionTriggerTime = 0;
const triggerQueue = new TriggerQueue();

function fireReactions(priority: TriggerPriority): void {
  lastReactionTriggerTime = Date.now();
  triggerQueue.clear();

  const buddies = getActiveBuddies();
  console.log(`  [trigger] ${priority} — ${buddies.length} buddies active`);

  const recentTranscript = transcriptStore
    .getRecent(12)
    .map((e) => `${e.source}: ${e.content.slice(0, 300)}`)
    .join("\n");
  triggerBuddyReactions(recentTranscript, priority);
  emitStatus();
}

function handleTerminalOutput(rawData: string): void {
  // Accumulate raw output for bubble scanning
  rawBuffer += rawData;
  if (bubbleDebounce) clearTimeout(bubbleDebounce);
  bubbleDebounce = setTimeout(scanForBubble, 500);

  const clean = stripForTranscript(rawData);
  if (!clean || clean.length <= 2) return;

  accumulatedOutput += "\n" + clean;
  if (reactionDebounce) clearTimeout(reactionDebounce);
  reactionDebounce = setTimeout(() => {
    const content = accumulatedOutput.trim();
    accumulatedOutput = "";

    const substantive = isSubstantiveContent(content);

    // Always add to transcript if there's any content (but skip pure junk)
    if (content.length > 10) {
      const truncated = content.length > 500 ? content.slice(0, 500) + "..." : content;
      const entry = transcriptStore.add("claude", truncated);
      io.emit(Events.TRANSCRIPT_ENTRY, entry);
      console.log(`  [transcript] claude: ${truncated.slice(0, 60)}...`);
    }

    if (!substantive) return;

    // Classify content before cooldown check so priority is known
    const priority = classifyContent(content);
    const cooldown = COOLDOWN_BY_PRIORITY[priority];
    const now = Date.now();
    const elapsed = now - lastReactionTriggerTime;

    if (elapsed < cooldown) {
      // Suppressed — queue for replay if it's the highest priority so far
      triggerQueue.enqueue(priority, now);
      const remaining = cooldown - elapsed;
      triggerQueue.scheduleReplay(remaining, (queued) => {
        console.log(`  [trigger] replaying queued ${queued.priority}`);
        fireReactions(queued.priority);
      });
      console.log(`  [trigger] queued ${priority} — replay in ${Math.ceil(remaining / 1000)}s`);
      emitStatus();
      return;
    }

    fireReactions(priority);
  }, 3000);
}

// --- Socket.IO ---

io.on("connection", (socket) => {
  console.log(`  Client connected: ${socket.id}`);

  // Send initial state
  emitStatus();
  socket.emit(Events.TRANSCRIPT_HISTORY, transcriptStore.getRecent());

  // Terminal input from xterm.js (raw keystrokes)
  socket.on(Events.TERMINAL_INPUT, (data: string) => {
    writeInput(data);
  });

  // High-level user input from InputBar
  socket.on(Events.USER_INPUT, (payload: UserInputPayload) => {
    const entry = transcriptStore.add("user", payload.text);
    io.emit(Events.TRANSCRIPT_ENTRY, entry);
    writeInput(payload.text + "\r");

    // User input always triggers buddy reactions (respects adaptive cooldown)
    const now = Date.now();
    const elapsed = now - lastReactionTriggerTime;
    if (elapsed >= COOLDOWN_BY_PRIORITY.turn) {
      fireReactions("turn");
    }
  });

  // Terminal resize
  socket.on(Events.TERMINAL_RESIZE, (size: { cols: number; rows: number }) => {
    resizePty(size.cols, size.rows);
  });

  // Session switching
  socket.on(Events.SESSION_SWITCH, (payload: { name: string }) => {
    try {
      loadSession(payload.name);
      resetSession();
      console.log(`  Session switched to: ${payload.name}`);
      io.emit(Events.SESSION_CHANGED, getSessionInfo());
      emitStatus();
    } catch (err) {
      console.error(`  Session switch failed: ${(err as Error).message}`);
    }
  });

  // Transcript rotation — start a fresh file
  socket.on(Events.TRANSCRIPT_ROTATE, () => {
    const newPath = transcriptStore.rotate();
    io.emit(Events.TRANSCRIPT_HISTORY, []);
    emitStatus();
    console.log(`  Transcript rotated by client${newPath ? `: ${newPath}` : ""}`);
  });

  // Test prompt — read the active preset's test prompt and send to PTY
  socket.on(Events.TEST_PROMPT, () => {
    const preset = getCurrentSession();
    if (!preset?.testPrompt) {
      console.log("  No test prompt for current session");
      return;
    }
    const repoRoot = pathJoin(import.meta.dirname, "..", "..");
    const promptPath = pathJoin(repoRoot, preset.testPrompt);
    try {
      const promptText = readFileSync(promptPath, "utf-8").trim();
      const entry = transcriptStore.add("user", `[test-prompt] ${promptText.slice(0, 200)}...`);
      io.emit(Events.TRANSCRIPT_ENTRY, entry);
      // Send text first, then submit after a delay so the PTY input buffer settles
      writeInput(promptText);
      setTimeout(() => writeInput("\r"), 200);
      console.log(`  Test prompt sent: ${preset.testPrompt}`);
    } catch (err) {
      console.error(`  Failed to read test prompt: ${(err as Error).message}`);
    }
  });

  // List available presets
  socket.on(Events.LIST_PRESETS, () => {
    socket.emit(Events.PRESETS_LIST, listPresets());
  });

  socket.on("disconnect", () => {
    console.log(`  Client disconnected: ${socket.id}`);
  });
});

// --- Start ---

const WEZTERM_PANE_ID = process.env.BUDDY_PANE_ID ? parseInt(process.env.BUDDY_PANE_ID, 10) : null;
const MODE = WEZTERM_PANE_ID !== null ? "wezterm" : "pty";

console.log(`\nBuddy Workspace Server (${MODE} mode)`);

if (MODE === "wezterm") {
  // WezTerm fallback: poll an external pane instead of spawning our own PTY
  const watcher = new PaneWatcher(WEZTERM_PANE_ID!, (delta, fullText) => {
    // Emit terminal output to frontend
    io.emit(Events.TERMINAL_OUTPUT, { delta, paneId: WEZTERM_PANE_ID });
    // Feed into transcript + buddy reactions
    handleTerminalOutput(delta);
  });
  watcher.start();
  console.log(`  WezTerm pane: ${WEZTERM_PANE_ID}`);
} else {
  // Default: spawn Claude CLI in embedded PTY
  spawnClaude(io, handleTerminalOutput);
}

// Load default session
const presets = listPresets();
if (presets.length > 0) {
  const defaultPreset = presets.includes("deep-focus") ? "deep-focus" : presets[0];
  try {
    loadSession(defaultPreset);
    const buddies = getActiveBuddies();
    console.log(`  Session: ${defaultPreset} (${buddies.length} buddies)`);
    buddies.forEach((b) => console.log(`    ${b.tier}: ${b.identity.name} (${b.identity.species})`));
  } catch (err) {
    console.error(`  Failed to load session: ${(err as Error).message}`);
  }
} else {
  console.log("  No session presets found in tools/sessions/");
}

httpServer.listen(PORT, () => {
  console.log(`  Backend: http://localhost:${PORT}`);
  if (IS_PROD) {
    console.log(`  Frontend: http://localhost:${PORT} (serving dist/)`);
  } else {
    console.log(`  Frontend: http://localhost:5173 (Vite dev server)`);
  }
  console.log("");
});
