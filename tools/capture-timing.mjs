#!/usr/bin/env node

// capture-timing.mjs — Measure buddy reaction timing from debug logs
//
// Usage: Run after a capture session to analyze reaction latency.
//   node tools/capture-timing.mjs [log-dir]
//
// Analyzes debug logs to extract:
// - Time between trigger and reaction response
// - Reaction latency by trigger type
// - Bubble display duration
// - API timeout events

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const CAPTURE_DIR = '/mnt/d/dev/p/claude-buddy-investigation/capture';

async function findLatestLogDir() {
  const arg = process.argv[2];
  if (arg) return arg;

  const entries = await readdir(CAPTURE_DIR);
  const logDirs = entries.filter(e => e.startsWith('logs_')).sort().reverse();
  if (logDirs.length === 0) {
    console.error('No capture logs found. Run capture-setup.sh first.');
    process.exit(1);
  }
  return join(CAPTURE_DIR, logDirs[0]);
}

async function collectLogFiles(logDir) {
  const files = [];
  const entries = await readdir(logDir, { recursive: true });
  for (const entry of entries) {
    if (entry.endsWith('.log') || entry.endsWith('.jsonl')) {
      files.push(join(logDir, entry));
    }
  }
  return files;
}

async function parseLogLines(filePath) {
  const content = await readFile(filePath, 'utf-8');
  return content.split('\n').filter(line => line.length > 0);
}

function extractBuddyEvents(lines) {
  const events = [];
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (lower.includes('buddy') || lower.includes('companion') || lower.includes('react')) {
      // Try to extract timestamp
      const tsMatch = line.match(/(\d{4}-\d{2}-\d{2}T[\d:.]+Z?|\d{13,})/);
      const timestamp = tsMatch ? tsMatch[1] : null;

      // Classify event
      let eventType = 'unknown';
      if (lower.includes('soul response')) eventType = 'soul_response';
      else if (lower.includes('api failed')) eventType = 'api_error';
      else if (lower.includes('buddy_react')) eventType = 'api_call';
      else if (lower.includes('muted')) eventType = 'mute_toggle';
      else if (lower.includes('reason')) eventType = 'trigger';
      else if (lower.includes('addressed')) eventType = 'addressed';
      else if (lower.includes('companion_intro')) eventType = 'intro_inject';
      else if (lower.includes('reaction')) eventType = 'reaction';

      events.push({ timestamp, eventType, raw: line.slice(0, 200) });
    }
  }
  return events;
}

async function main() {
  const logDir = await findLatestLogDir();
  console.log(`\nAnalyzing: ${logDir}\n`);

  const logFiles = await collectLogFiles(logDir);

  if (logFiles.length === 0) {
    console.log('No log files found in directory.');
    console.log('Make sure CLAUDE_CODE_DEBUG_LOGS_DIR was set before launching Claude Code.');
    process.exit(1);
  }

  console.log(`Found ${logFiles.length} log file(s)\n`);

  let allEvents = [];
  for (const file of logFiles) {
    const lines = await parseLogLines(file);
    const events = extractBuddyEvents(lines);
    allEvents.push(...events);
  }

  if (allEvents.length === 0) {
    console.log('No buddy-related events found in logs.');
    console.log('');
    console.log('Possible reasons:');
    console.log('  - Companion was muted during the session');
    console.log('  - No triggers fired (too short a session)');
    console.log('  - Debug log level was not set to "debug"');
    console.log('  - The buddy log entries use a different format than expected');
    console.log('');
    console.log('All log files:');
    for (const f of logFiles) {
      const lines = await parseLogLines(f);
      console.log(`  ${f}: ${lines.length} lines`);
    }
    process.exit(0);
  }

  // Summary
  console.log('=== Buddy Events Summary ===\n');

  const byType = {};
  for (const e of allEvents) {
    byType[e.eventType] = (byType[e.eventType] || 0) + 1;
  }

  for (const [type, count] of Object.entries(byType).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${type}: ${count}`);
  }

  console.log(`\n  Total events: ${allEvents.length}\n`);

  // Show all events
  console.log('=== Event Log ===\n');
  for (const e of allEvents) {
    const ts = e.timestamp || '(no timestamp)';
    console.log(`  [${e.eventType}] ${ts}`);
    console.log(`    ${e.raw}`);
    console.log('');
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
