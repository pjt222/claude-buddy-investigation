// wezterm.ts — WezTerm CLI wrapper
// Uses execFileSync with args arrays (no shell) for security (C1 compliance).

import { execFileSync } from "node:child_process";

const WEZTERM =
  process.env.WEZTERM_CLI ||
  "/mnt/c/Program Files/WezTerm/wezterm.exe";

function run(args: string[], timeout = 3000): string {
  return execFileSync(WEZTERM, ["cli", ...args], {
    encoding: "utf-8",
    timeout,
  }).trim();
}

export interface PaneInfo {
  pane_id: number;
  tab_id: number;
  window_id: number;
  workspace: string;
  title: string;
  cwd: string;
  cols: number;
  rows: number;
  is_active: boolean;
}

export function listPanes(): PaneInfo[] {
  const output = run(["list", "--format", "json"]);
  return JSON.parse(output);
}

export function getText(paneId: number): string {
  return run(["get-text", "--pane-id", String(paneId)]);
}

export function sendText(paneId: number, text: string): void {
  execFileSync(WEZTERM, ["cli", "send-text", "--pane-id", String(paneId), "--no-paste", "--", text], {
    encoding: "utf-8",
    timeout: 3000,
  });
}

export function findClaudePane(): PaneInfo | null {
  const panes = listPanes();
  // Look for a pane whose title contains "claude" or is running the claude CLI
  return (
    panes.find((p) => /claude/i.test(p.title) && p.is_active) ||
    panes.find((p) => /claude/i.test(p.title)) ||
    null
  );
}
