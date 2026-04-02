// strategy-scrape.mjs — Capture via terminal scrollback scraping
//
// Extracts the most recent Shingle bubble from the terminal scrollback buffer.
// Works by dumping the scrollback and matching the bubble box-drawing pattern.
//
// Requirements:
//   - tmux session: uses `tmux capture-pane` to read scrollback
//   - OR script/typescript log file via SHINGLE_TERMINAL_LOG env var
//   - Falls back to reading /tmp/shingle-terminal.log if neither is available

import { readFile } from "node:fs/promises";
import { execSync } from "node:child_process";

// Bubble pattern: Shingle's speech bubble uses box-drawing chars
// ╭────────────────────────────────╮
// │ *ruffles feathers*             │
// │ Some reaction text here.       │
// ╰────────────────────────────────╯
const BUBBLE_OPEN = /╭[─]+╮/;
const BUBBLE_CLOSE = /╰[─]+╯/;
const BUBBLE_LINE = /│\s*(.*?)\s*│/;

/**
 * Try to get terminal content from available sources.
 */
function getTerminalContent() {
  // Strategy A: tmux capture-pane
  try {
    const pane = process.env.SHINGLE_TMUX_PANE || "";
    const target = pane ? `-t ${pane}` : "";
    const scrollback = execSync(
      `tmux capture-pane ${target} -p -S -200 2>/dev/null`,
      { encoding: "utf-8", timeout: 3000 }
    );
    if (scrollback.trim()) return { source: "tmux", content: scrollback };
  } catch {
    // tmux not available
  }

  // Strategy B: explicit terminal log file
  const logFile =
    process.env.SHINGLE_TERMINAL_LOG || "/tmp/shingle-terminal.log";
  try {
    // Read last 8KB (enough for several bubbles)
    const content = execSync(`tail -c 8192 "${logFile}" 2>/dev/null`, {
      encoding: "utf-8",
      timeout: 2000,
    });
    if (content.trim()) return { source: "logfile", content };
  } catch {
    // log file not available
  }

  // Strategy C: /dev/vcs virtual console (Linux only, rarely works in WSL)
  try {
    const content = execSync("script -q /dev/null -c 'echo'", {
      encoding: "utf-8",
      timeout: 1000,
    });
    if (content.trim()) return { source: "vcs", content };
  } catch {
    // not available
  }

  throw new Error(
    "No terminal source available. Set SHINGLE_TMUX_PANE or SHINGLE_TERMINAL_LOG."
  );
}

/**
 * Extract the most recent bubble text from terminal content.
 */
function extractLastBubble(content) {
  const lines = content.split("\n");
  let lastBubbleEnd = -1;

  // Find the last bubble closing line
  for (let i = lines.length - 1; i >= 0; i--) {
    if (BUBBLE_CLOSE.test(lines[i])) {
      lastBubbleEnd = i;
      break;
    }
  }

  if (lastBubbleEnd === -1) {
    return null;
  }

  // Walk backward to find the opening
  let lastBubbleStart = -1;
  for (let i = lastBubbleEnd - 1; i >= 0; i--) {
    if (BUBBLE_OPEN.test(lines[i])) {
      lastBubbleStart = i;
      break;
    }
  }

  if (lastBubbleStart === -1) {
    return null;
  }

  // Extract content lines between open and close
  const bubbleLines = [];
  for (let i = lastBubbleStart + 1; i < lastBubbleEnd; i++) {
    const match = lines[i].match(BUBBLE_LINE);
    if (match) {
      bubbleLines.push(match[1]);
    }
  }

  return bubbleLines.join("\n").trim() || null;
}

/**
 * Scrape the terminal for Shingle's most recent bubble.
 * @returns {{ reaction: string, source: string }}
 */
export async function scrapeCapture() {
  const terminal = getTerminalContent();
  const reaction = extractLastBubble(terminal.content);

  if (!reaction) {
    return { reaction: null, source: terminal.source, note: "no bubble found" };
  }

  return { reaction, source: terminal.source };
}
