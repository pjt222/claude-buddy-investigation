// strategy-scrape.mjs — Capture via terminal scrollback scraping
//
// Extracts the most recent Shingle bubble from the terminal scrollback buffer.
// Works by dumping the scrollback and matching the bubble box-drawing pattern.
//
// Requirements:
//   - tmux session: uses `tmux capture-pane` to read scrollback (preferred)
//   - OR script/typescript log file via SHINGLE_TERMINAL_LOG env var
//
// Launch Claude Code via tools/shingle-capture/launch.sh to enable this.

import { execSync } from "node:child_process";

// Strip ANSI escape sequences (colors, cursor movement, etc.)
const ANSI_RE = /\x1b\[[0-9;]*[a-zA-Z]|\x1b\].*?\x07|\x1b[()][0-9A-B]/g;

function stripAnsi(text) {
  return text.replace(ANSI_RE, "");
}

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
  // Strategy A: tmux capture-pane (default session: "claude")
  try {
    const pane = process.env.SHINGLE_TMUX_PANE || "claude";
    const scrollback = execSync(
      `tmux capture-pane -t "${pane}" -p -S -200 2>/dev/null`,
      { encoding: "utf-8", timeout: 3000 }
    );
    if (scrollback.trim()) return { source: "tmux", content: scrollback };
  } catch {
    // tmux not available or session doesn't exist
  }

  // Strategy B: explicit terminal log file (from `script` command)
  const logFile =
    process.env.SHINGLE_TERMINAL_LOG || "/tmp/shingle-terminal.log";
  try {
    const content = execSync(`tail -c 16384 "${logFile}" 2>/dev/null`, {
      encoding: "utf-8",
      timeout: 2000,
    });
    if (content.trim()) return { source: "logfile", content };
  } catch {
    // log file not available
  }

  throw new Error(
    "No terminal source. Launch with: bash tools/shingle-capture/launch.sh"
  );
}

/**
 * Extract the most recent bubble text from terminal content.
 */
function extractLastBubble(rawContent) {
  // Strip ANSI codes first (critical for script-mode logs)
  const content = stripAnsi(rawContent);
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
    if (match && match[1].trim()) {
      bubbleLines.push(match[1].trim());
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
    return { reaction: null, source: terminal.source, note: "no bubble found in scrollback" };
  }

  return { reaction, source: terminal.source };
}
