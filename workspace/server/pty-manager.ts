// pty-manager.ts — Spawns Claude CLI in a PTY, bridges I/O to Socket.IO
// Replaces WezTerm CLI polling with a directly embedded terminal.

import pty from "node-pty";
import type { Server } from "socket.io";
import { Events } from "../shared/protocol.ts";
import type { TerminalOutputPayload } from "../shared/protocol.ts";

const CLAUDE_ARGV = (process.env.CLAUDE_CMD || "claude --permission-mode bypassPermissions").split(/\s+/);
const CLAUDE_EXE = CLAUDE_ARGV.shift()!;

// Terminal response sequences that xterm.js auto-generates in reply to
// PTY queries. If forwarded back to the PTY, they create infinite loops.
// Filter these from the input (browser → PTY) path.
//
// CPR:  ESC [ row ; col R          (cursor position report)
// DA:   ESC [ ? digits c           (device attributes response)
// DA2:  ESC [ > digits ; digits c  (secondary device attributes)
// DSR:  ESC [ digits n             (device status report response)
// Mode: ESC [ ? digits ; digits $ y (mode report)
const TERMINAL_RESPONSE_RE =
  /\x1b\[\d+;\d+R|\x1b\[\?[\d;]*c|\x1b\[>[\d;]*c|\x1b\[\d+n|\x1b\[\?[\d;]*\$y/g;

let ptyProcess: pty.IPty | null = null;

export function spawnClaude(
  io: Server,
  onOutput: (data: string) => void
): void {
  if (ptyProcess) {
    console.log("  PTY already running, killing old process...");
    ptyProcess.kill();
  }

  console.log(`  Spawning: ${CLAUDE_EXE} ${CLAUDE_ARGV.join(" ")}`);

  ptyProcess = pty.spawn(CLAUDE_EXE, CLAUDE_ARGV, {
    name: "xterm-256color",
    cols: 120,
    rows: 36,
    cwd: process.env.CLAUDE_CWD || process.cwd(),
    env: {
      ...process.env,
      TERM: "xterm-256color",
      COLORTERM: "truecolor",
    } as Record<string, string>,
  });

  // Suppress terminal queries that trigger xterm.js auto-responses (infinite loop).
  // These are sequences where the terminal is expected to REPLY with data.
  const QUERY_RE = new RegExp([
    "\\x1b\\[6n",            // DSR: cursor position query
    "\\x1b\\[[0?]?c",        // DA1: device attributes
    "\\x1b\\[>c",            // DA2: secondary device attributes
    "\\x1b\\[=c",            // DA3: tertiary device attributes
    "\\x1b\\[\\?1;2c",       // DA response (sometimes echoed)
    "\\x1b\\[\\?u",          // Kitty keyboard query
    "\\x1b\\[\\?2026\\$p",   // Synchronized output query
  ].join("|"), "g");

  ptyProcess.onData((data: string) => {
    // Strip queries to prevent xterm.js auto-response loop
    const cleaned = data.replace(QUERY_RE, "");
    if (cleaned) {
      const payload: TerminalOutputPayload = { delta: cleaned, paneId: -1 };
      io.emit(Events.TERMINAL_OUTPUT, payload);
    }

    // Pass to transcript callback (will be stripped further there)
    onOutput(data);
  });

  ptyProcess.onExit(({ exitCode, signal }) => {
    console.log(`  Claude exited: code=${exitCode} signal=${signal}`);
    ptyProcess = null;
    io.emit(Events.TERMINAL_EXITED, { exitCode, signal });
  });

  console.log(`  PTY spawned: pid=${ptyProcess.pid}`);
}

export function writeInput(data: string): void {
  if (ptyProcess) {
    // Strip all terminal response sequences — only forward real user input
    const filtered = data.replace(TERMINAL_RESPONSE_RE, "");
    if (filtered) ptyProcess.write(filtered);
  }
}

export function resizePty(cols: number, rows: number): void {
  if (ptyProcess) {
    ptyProcess.resize(cols, rows);
  }
}

export function isRunning(): boolean {
  return ptyProcess !== null;
}

export function killPty(): void {
  if (ptyProcess) {
    ptyProcess.kill();
    ptyProcess = null;
  }
}
