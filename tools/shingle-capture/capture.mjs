#!/usr/bin/env node

// capture.mjs — Modular Shingle bubble capture
//
// Two strategies, selected via SHINGLE_CAPTURE_STRATEGY env var:
//   "replay"    — call buddy_react API directly (parallel reaction, not identical to native)
//   "scrape"    — grep terminal scrollback for bubble pattern
//   "both"      — run both, log which succeeded
//
// Output: appends JSON lines to SHINGLE_CAPTURE_LOG (default: /tmp/shingle-capture.jsonl)
//
// Usage as hook:
//   Called by Claude Code Stop hook after each response.
//   Reads last ~20 lines of conversation context from stdin or SHINGLE_LAST_CONTEXT env var.

import { replayCapture } from "./strategy-replay.mjs";
import { scrapeCapture } from "./strategy-scrape.mjs";
import { appendLog, readContext } from "./util.mjs";

const STRATEGY = process.env.SHINGLE_CAPTURE_STRATEGY || "both";

async function main() {
  const context = await readContext();
  const results = [];

  if (STRATEGY === "replay" || STRATEGY === "both") {
    try {
      const reaction = await replayCapture(context);
      results.push({ strategy: "replay", ...reaction });
    } catch (err) {
      results.push({ strategy: "replay", error: err.message });
    }
  }

  if (STRATEGY === "scrape" || STRATEGY === "both") {
    try {
      const reaction = await scrapeCapture();
      results.push({ strategy: "scrape", ...reaction });
    } catch (err) {
      results.push({ strategy: "scrape", error: err.message });
    }
  }

  const entry = {
    timestamp: new Date().toISOString(),
    strategy: STRATEGY,
    results,
  };

  await appendLog(entry);

  // Print for hook stdout (visible in debug logs)
  const successful = results.filter((r) => r.reaction);
  if (successful.length > 0) {
    process.stdout.write(successful[0].reaction);
  }
}

main().catch((err) => {
  process.stderr.write(`shingle-capture error: ${err.message}\n`);
  process.exit(1);
});
