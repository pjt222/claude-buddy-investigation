#!/usr/bin/env node

// read-last.mjs — Read the last N captured Shingle reactions
//
// Usage: node tools/shingle-capture/read-last.mjs [count]

import { readLastEntries } from "./util.mjs";

const count = parseInt(process.argv[2] || "5", 10);
const entries = await readLastEntries(count);

if (entries.length === 0) {
  console.log("No captures yet. Run capture.mjs or trigger the Stop hook.");
  process.exit(0);
}

for (const entry of entries) {
  const successful = entry.results?.filter((r) => r.reaction) || [];
  const reaction = successful[0]?.reaction || "(no reaction)";
  const strategy = successful[0]?.strategy || "?";
  console.log(`[${entry.timestamp}] (${strategy}) ${reaction}`);
}
