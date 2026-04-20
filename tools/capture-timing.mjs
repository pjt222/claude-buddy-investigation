#!/usr/bin/env node

// capture-timing.mjs — Measure buddy reaction timing from capture logs
//
// Usage:
//   node tools/capture-timing.mjs [capture-log]
//
// Analyzes JSONL capture logs to extract:
// - Reaction latency by trigger type and capture strategy
// - Inter-reaction gaps (cooldown measurement)
// - API timeout events
// - Bubble TTL estimation from scrape timestamps
//
// Default log: SHINGLE_CAPTURE_LOG or ~/.claude/shingle-capture.jsonl

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';

const DEFAULT_LOG = process.env.SHINGLE_CAPTURE_LOG || join(homedir(), '.claude', 'shingle-capture.jsonl');

function parseArgs() {
  return process.argv[2] || DEFAULT_LOG;
}

function parseEntries(content) {
  return content
    .split('\n')
    .filter(line => line.trim().length > 0)
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

function toMs(isoOrMs) {
  if (!isoOrMs) return null;
  if (typeof isoOrMs === 'number') return isoOrMs;
  const d = new Date(isoOrMs);
  return isNaN(d.getTime()) ? null : d.getTime();
}

function analyzeLatency(entries) {
  const byTrigger = {};
  const byStrategy = {};

  for (const e of entries) {
    const latency = e.latencyMs;
    if (latency == null || latency <= 0) continue;

    const trigger = e.trigger || e.reason || 'unknown';
    const strategy = e.strategy || 'unknown';

    if (!byTrigger[trigger]) byTrigger[trigger] = [];
    byTrigger[trigger].push(latency);

    if (!byStrategy[strategy]) byStrategy[strategy] = [];
    byStrategy[strategy].push(latency);
  }

  return { byTrigger, byStrategy };
}

function analyzeGaps(entries) {
  const timestamps = entries
    .map(e => toMs(e.ts || e.timestamp))
    .filter(Boolean)
    .sort((a, b) => a - b);

  if (timestamps.length < 2) return { gaps: [], timestamps };

  const gaps = [];
  for (let i = 1; i < timestamps.length; i++) {
    gaps.push(timestamps[i] - timestamps[i - 1]);
  }
  return { gaps, timestamps };
}

function analyzeScrapeWindows(entries) {
  // For scrape entries captured on UserPromptSubmit, the bubble was still
  // visible when the user typed their next prompt. We can estimate how long
  // the bubble persisted by looking at the gap between a replay entry (when
  // the bubble appeared) and the next scrape entry (when it was still on screen).
  const windows = [];
  const sorted = [...entries].sort((a, b) => {
    const ta = toMs(a.ts || a.timestamp) || 0;
    const tb = toMs(b.ts || b.timestamp) || 0;
    return ta - tb;
  });

  for (let i = 0; i < sorted.length - 1; i++) {
    const curr = sorted[i];
    const next = sorted[i + 1];
    if (curr.strategy === 'replay' && next.strategy === 'scrape') {
      const t1 = toMs(curr.ts || curr.timestamp);
      const t2 = toMs(next.ts || next.timestamp);
      if (t1 && t2 && t2 > t1) {
        windows.push({
          gapMs: t2 - t1,
          replayReaction: (curr.reaction || '').slice(0, 60),
          scrapeReaction: (next.reaction || '').slice(0, 60),
        });
      }
    }
  }
  return windows;
}

function stats(values) {
  if (!values || values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  return {
    count: sorted.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    mean: Math.round(sum / sorted.length),
    median: sorted[Math.floor(sorted.length / 2)],
    p95: sorted[Math.ceil(sorted.length * 0.95) - 1] ?? sorted[sorted.length - 1],
  };
}

function fmtMs(ms) {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function printStats(label, values) {
  const s = stats(values);
  if (!s) return;
  console.log(`  ${label} (n=${s.count}):`);
  console.log(`    min=${fmtMs(s.min)}  median=${fmtMs(s.median)}  mean=${fmtMs(s.mean)}  max=${fmtMs(s.max)}  p95=${fmtMs(s.p95)}`);
}

async function main() {
  const logPath = parseArgs();
  console.log(`\nAnalyzing: ${logPath}\n`);

  let content;
  try {
    content = await readFile(logPath, 'utf-8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.error(`Log file not found: ${logPath}`);
      console.error('');
      console.error('Run a capture session first:');
      console.error('  source tools/capture-setup.sh');
      console.error('  bash tools/shingle-capture/launch.sh');
      console.error('');
      console.error('Or specify a log file:');
      console.error('  node tools/capture-timing.mjs /path/to/capture.jsonl');
      process.exit(1);
    }
    throw err;
  }
  const entries = parseEntries(content);

  if (entries.length === 0) {
    console.log('No entries found in capture log.');
    console.log('');
    console.log('Possible reasons:');
    console.log('  - Companion was muted during the session');
    console.log('  - No triggers fired (too short a session)');
    console.log('  - Hook wrapper was not configured');
    process.exit(0);
  }

  console.log(`Parsed ${entries.length} capture entries\n`);

  // --- Entry breakdown ---
  const strategyCounts = {};
  const triggerCounts = {};
  for (const e of entries) {
    const s = e.strategy || 'unknown';
    const t = e.trigger || e.reason || 'unknown';
    strategyCounts[s] = (strategyCounts[s] || 0) + 1;
    triggerCounts[t] = (triggerCounts[t] || 0) + 1;
  }

  console.log('=== Entry Breakdown ===\n');
  console.log('  By strategy:');
  for (const [k, v] of Object.entries(strategyCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${k}: ${v}`);
  }
  console.log('  By trigger:');
  for (const [k, v] of Object.entries(triggerCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${k}: ${v}`);
  }
  console.log('');

  // --- Latency analysis ---
  const { byTrigger, byStrategy } = analyzeLatency(entries);

  const allLatencies = entries.map(e => e.latencyMs).filter(v => v != null && v > 0);

  if (allLatencies.length > 0) {
    console.log('=== API Latency ===\n');
    printStats('Overall', allLatencies);
    console.log('');

    if (Object.keys(byTrigger).length > 1) {
      console.log('  By trigger:');
      for (const [trigger, values] of Object.entries(byTrigger).sort()) {
        printStats(`  ${trigger}`, values);
      }
      console.log('');
    }

    if (Object.keys(byStrategy).length > 1) {
      console.log('  By strategy:');
      for (const [strategy, values] of Object.entries(byStrategy).sort()) {
        printStats(`  ${strategy}`, values);
      }
      console.log('');
    }
  } else {
    console.log('=== API Latency ===\n');
    console.log('  No latency data found (scrape-only entries have no latencyMs).\n');
  }

  // --- Inter-reaction gaps ---
  const { gaps, timestamps } = analyzeGaps(entries);

  if (gaps.length > 0) {
    console.log('=== Inter-Reaction Gaps ===\n');
    printStats('Gap between captures', gaps);

    const cooldownCompliant = gaps.filter(g => g >= 29000); // ~30s allowing for clock skew
    const cooldownBypassed = gaps.filter(g => g < 29000);
    console.log(`  Cooldown-compliant (>=29s): ${cooldownCompliant.length}`);
    console.log(`  Cooldown-bypassed  (<29s):  ${cooldownBypassed.length} (likely addressed=true)`);
    console.log('');

    // Session span
    const span = timestamps[timestamps.length - 1] - timestamps[0];
    console.log(`  Session span: ${fmtMs(span)} (${entries.length} reactions)`);
    if (span > 0) {
      const rate = (entries.length / (span / 60000)).toFixed(1);
      console.log(`  Rate: ${rate} reactions/minute`);
    }
    console.log('');
  }

  // --- Scrape window analysis ---
  const windows = analyzeScrapeWindows(entries);

  if (windows.length > 0) {
    console.log('=== Bubble Visibility Windows ===\n');
    console.log('  (Time between replay capture and next scrape capture.)');
    console.log('  If scrape captures a bubble, it was still visible at that time.\n');
    const windowMs = windows.map(w => w.gapMs);
    printStats('Visibility gap', windowMs);
    console.log('');

    for (const w of windows.slice(0, 5)) {
      console.log(`  ${fmtMs(w.gapMs)}: replay="${w.replayReaction}..." → scrape="${w.scrapeReaction}..."`);
    }
    if (windows.length > 5) {
      console.log(`  ... and ${windows.length - 5} more`);
    }
    console.log('');
  }

  // --- Timeouts ---
  const timeouts = entries.filter(e => e.error && /timeout|abort/i.test(e.error));
  if (timeouts.length > 0) {
    console.log('=== API Timeouts ===\n');
    console.log(`  ${timeouts.length} timeout(s) detected (10s AbortSignal cutoff)\n`);
    for (const t of timeouts.slice(0, 5)) {
      console.log(`  [${t.ts || '?'}] ${t.error}`);
    }
    console.log('');
  }

  // --- Reference constants ---
  console.log('=== Expected Constants (from binary analysis) ===\n');
  console.log('  Bubble TTL:       10,000ms (20 ticks x 500ms)');
  console.log('  Fade start:        7,000ms (tick 14, final 3s faded)');
  console.log('  Reaction cooldown: 30,000ms (bypassed when addressed)');
  console.log('  API timeout:       10,000ms (AbortSignal hard cutoff)');
  console.log('  Tick interval:        500ms (master animation clock)');
  console.log('  Ring buffer:        3 entries (FIFO, session-scoped)');
  console.log('');
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
