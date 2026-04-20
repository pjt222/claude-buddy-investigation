// pane-watcher.ts — Polls WezTerm pane visible screen, diffs output, emits events

import { getText } from "./wezterm.ts";

// ANSI strip regex from strategy-scrape.mjs:9
const ANSI_RE =
  /\x1b\[[0-9;]*[a-zA-Z]|\x1b\].*?\x07|\x1b[()][0-9A-B]/g;

function stripAnsi(text: string): string {
  return text.replace(ANSI_RE, "");
}

function normalize(text: string): string {
  return text
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trimEnd();
}

export type OutputCallback = (delta: string, fullText: string) => void;

export class PaneWatcher {
  private paneId: number;
  private interval: ReturnType<typeof setInterval> | null = null;
  private previousNormalized = "";
  private onOutput: OutputCallback;
  private tickMs: number;

  constructor(paneId: number, onOutput: OutputCallback, tickMs = 500) {
    this.paneId = paneId;
    this.onOutput = onOutput;
    this.tickMs = tickMs;
  }

  start(): void {
    if (this.interval) return;

    // Capture initial screen as baseline — don't emit it
    try {
      this.previousNormalized = normalize(stripAnsi(getText(this.paneId)));
    } catch {
      this.previousNormalized = "";
    }

    this.interval = setInterval(() => this.tick(), this.tickMs);
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  setPaneId(paneId: number): void {
    this.paneId = paneId;
    this.previousNormalized = "";
  }

  private tick(): void {
    let raw: string;
    try {
      raw = normalize(stripAnsi(getText(this.paneId)));
    } catch {
      return;
    }

    // Identical screen — nothing changed
    if (raw === this.previousNormalized) return;

    const prev = this.previousNormalized;
    this.previousNormalized = raw;

    // WezTerm get-text returns the visible screen only (not scrollback).
    // The screen redraws entirely on each Claude output. We need to find
    // what's new by locating the overlap between old and new screens.

    // Strategy: find the longest suffix of the old screen that appears
    // as a prefix-region in the new screen. Everything after that overlap
    // in the new screen is genuinely new output.
    const delta = this.extractNewContent(prev, raw);

    if (delta.trim()) {
      this.onOutput(delta, raw);
    }
  }

  private extractNewContent(prev: string, curr: string): string {
    if (!prev) return ""; // First read — no delta

    const prevLines = prev.split("\n").filter((l) => l.trim());
    const currLines = curr.split("\n").filter((l) => l.trim());

    if (prevLines.length === 0) return "";
    if (currLines.length === 0) return "";

    // Find the last meaningful line of the previous screen in the current screen.
    // Start from the bottom of the previous screen (most likely to still be visible).
    for (let i = prevLines.length - 1; i >= Math.max(0, prevLines.length - 15); i--) {
      const needle = prevLines[i].trim();
      if (needle.length < 3) continue; // Skip short/decorative lines

      // Find this line in the current screen
      const currIdx = currLines.findIndex((l) => l.trim() === needle);
      if (currIdx >= 0) {
        // Everything after this line in the current screen is new
        const newLines = currLines.slice(currIdx + 1).filter((l) => l.trim());
        return newLines.join("\n");
      }
    }

    // No overlap found — screens are completely different.
    // This happens when a lot of output scrolled past. Emit a summary.
    // Take the last few non-decorative lines as the delta.
    const meaningful = currLines.filter(
      (l) => l.trim() && !/^[─━═┌┐└┘├┤┬┴┼╭╮╰╯│]+$/.test(l.trim()) && !/^[⏵❯>$#]/.test(l.trim())
    );

    if (meaningful.length > 0) {
      return meaningful.slice(-8).join("\n");
    }

    return "";
  }
}
