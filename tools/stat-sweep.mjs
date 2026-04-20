#!/usr/bin/env node

// stat-sweep.mjs — Map how companion stats shape buddy_react reaction tone
//
// Runs controlled API calls varying one stat at a time while holding others
// fixed, then tests interaction effects, species influence, and personality
// override. Respects rate limits with 8s stagger + 429 backoff.
//
// Usage:
//   node tools/stat-sweep.mjs                    # run full sweep
//   node tools/stat-sweep.mjs --phase 1          # run single phase
//   node tools/stat-sweep.mjs --resume            # resume from last checkpoint

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { readAuth as readSharedAuth, getUserAgent } from "./shared/config.mjs";

const USER_AGENT = getUserAgent();

const CLAUDE_DIR = join(homedir(), ".claude");
const CONFIG_PATH = join(CLAUDE_DIR, ".claude.json");
const API_BASE = "https://api.anthropic.com";
const BETA_HEADER = "oauth-2025-04-20";
const RESULTS_PATH = join(process.cwd(), "tools", "stat-sweep-results.json");
const STAGGER_MS = 8000;
const BACKOFF_MS = 90000;

const FIXED_TRANSCRIPT = "user: I just refactored the auth middleware to use JWT tokens\nclaude: Done. The auth middleware now validates JWTs and rejects expired tokens with a 401.";
const FIXED_REASON = "turn";

function readAuth() {
  const auth = readSharedAuth();
  const config = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
  return {
    ...auth,
    name: config.companion?.name || "Shingle",
    personality: config.companion?.personality || "A quiet observer.",
  };
}

async function callAPI(auth, overrides = {}) {
  const payload = {
    name: auth.name,
    personality: overrides.personality || auth.personality,
    species: overrides.species || "owl",
    rarity: overrides.rarity || "common",
    stats: overrides.stats || { DEBUGGING: 50, PATIENCE: 50, CHAOS: 50, WISDOM: 50, SNARK: 50 },
    transcript: FIXED_TRANSCRIPT,
    reason: overrides.reason || FIXED_REASON,
    recent: [],
    addressed: false,
  };

  const url = `${API_BASE}/api/organizations/${auth.orgUuid}/claude_code/buddy_react`;
  const startTime = performance.now();

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${auth.accessToken}`,
      "Content-Type": "application/json",
      "User-Agent": USER_AGENT,
      "anthropic-beta": BETA_HEADER,
      "Accept": "application/json",
      "Accept-Encoding": "identity",
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000),
  });

  const latencyMs = Math.round(performance.now() - startTime);
  const serverTime = response.headers.get("x-envoy-upstream-service-time");
  const requestId = response.headers.get("request-id");

  if (response.status === 429) {
    return { status: 429, latencyMs, reaction: null, requestId };
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    return { status: response.status, latencyMs, error: text, requestId };
  }

  const data = await response.json();
  return {
    status: 200,
    latencyMs,
    serverTimeMs: serverTime ? parseInt(serverTime) : null,
    reaction: data.reaction || null,
    reactionLength: data.reaction?.length || 0,
    reactionWords: data.reaction?.split(/\s+/).length || 0,
    requestId,
    payload,
  };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function makeStats(statName, value) {
  const base = { DEBUGGING: 50, PATIENCE: 50, CHAOS: 50, WISDOM: 50, SNARK: 50 };
  if (statName) base[statName] = value;
  return base;
}

// --- Experiment phases ---

function buildExperiments() {
  const experiments = [];

  // Phase 0: Baseline (all stats at 50)
  experiments.push({
    phase: 0, label: "baseline", description: "All stats=50",
    overrides: { stats: makeStats(null, 0) },
  });

  // Phase 1: SNARK gradient
  for (const val of [1, 20, 50, 80, 100]) {
    experiments.push({
      phase: 1, label: `snark-${val}`, description: `SNARK=${val}`,
      overrides: { stats: makeStats("SNARK", val) },
    });
  }

  // Phase 2: CHAOS gradient
  for (const val of [1, 20, 50, 80, 100]) {
    experiments.push({
      phase: 2, label: `chaos-${val}`, description: `CHAOS=${val}`,
      overrides: { stats: makeStats("CHAOS", val) },
    });
  }

  // Phase 3: WISDOM gradient
  for (const val of [1, 50, 100]) {
    experiments.push({
      phase: 3, label: `wisdom-${val}`, description: `WISDOM=${val}`,
      overrides: { stats: makeStats("WISDOM", val) },
    });
  }

  // Phase 4: Interaction effects
  experiments.push({
    phase: 4, label: "snark90-wisdom90", description: "SNARK=90+WISDOM=90",
    overrides: { stats: { DEBUGGING: 50, PATIENCE: 50, CHAOS: 50, WISDOM: 90, SNARK: 90 } },
  });
  experiments.push({
    phase: 4, label: "snark90-wisdom10", description: "SNARK=90+WISDOM=10",
    overrides: { stats: { DEBUGGING: 50, PATIENCE: 50, CHAOS: 50, WISDOM: 10, SNARK: 90 } },
  });
  experiments.push({
    phase: 4, label: "chaos90-patience90", description: "CHAOS=90+PATIENCE=90",
    overrides: { stats: { DEBUGGING: 50, PATIENCE: 90, CHAOS: 90, WISDOM: 50, SNARK: 50 } },
  });
  experiments.push({
    phase: 4, label: "chaos90-patience10", description: "CHAOS=90+PATIENCE=10",
    overrides: { stats: { DEBUGGING: 50, PATIENCE: 10, CHAOS: 90, WISDOM: 50, SNARK: 50 } },
  });

  // Phase 5: Species × stat (SNARK=80)
  for (const species of ["owl", "dragon", "mushroom", "ghost"]) {
    experiments.push({
      phase: 5, label: `species-${species}`, description: `${species} SNARK=80`,
      overrides: { species, stats: makeStats("SNARK", 80) },
    });
  }

  // Phase 6: Personality override
  experiments.push({
    phase: 6, label: "override-gentle-snark100", description: "Gentle personality + SNARK=100",
    overrides: {
      personality: "Gentle, endlessly patient, never sarcastic. Speaks softly.",
      stats: makeStats("SNARK", 100),
    },
  });
  experiments.push({
    phase: 6, label: "override-orderly-chaos100", description: "Orderly personality + CHAOS=100",
    overrides: {
      personality: "Methodical, orderly, systematic. Hates surprises and randomness.",
      stats: makeStats("CHAOS", 100),
    },
  });
  experiments.push({
    phase: 6, label: "override-sage-wisdom1", description: "Sage personality + WISDOM=1",
    overrides: {
      personality: "Ancient sage who has witnessed millennia of code. Speaks in deep truths.",
      stats: makeStats("WISDOM", 1),
    },
  });

  return experiments;
}

// --- Main ---

const args = process.argv.slice(2);
const phaseFilter = args.includes("--phase") ? parseInt(args[args.indexOf("--phase") + 1]) : null;
const resumeMode = args.includes("--resume");

let results = [];
if (resumeMode && existsSync(RESULTS_PATH)) {
  results = JSON.parse(readFileSync(RESULTS_PATH, "utf-8"));
  console.log(`Resuming: ${results.length} results loaded from checkpoint\n`);
}

const completedLabels = new Set(results.filter(r => r.status === 200).map(r => r.label));
const allExperiments = buildExperiments();
const experiments = allExperiments.filter(e => {
  if (phaseFilter !== null && e.phase !== phaseFilter) return false;
  if (resumeMode && completedLabels.has(e.label)) return false;
  return true;
});

console.log(`=== Stat Sweep: ${experiments.length} calls planned ===\n`);

const auth = readAuth();
let consecutiveFailures = 0;

for (let i = 0; i < experiments.length; i++) {
  const exp = experiments[i];
  const progress = `[${i + 1}/${experiments.length}]`;

  process.stdout.write(`  ${progress} Phase ${exp.phase}: ${exp.description}...`);

  const result = await callAPI(auth, exp.overrides);
  result.label = exp.label;
  result.phase = exp.phase;
  result.description = exp.description;

  if (result.status === 429) {
    consecutiveFailures++;
    console.log(` 429 (backing off ${BACKOFF_MS / 1000}s)`);

    if (consecutiveFailures >= 3) {
      console.log("\n  3 consecutive 429s — stopping. Re-run with --resume later.\n");
      break;
    }

    // Don't save 429s, retry after backoff
    await sleep(BACKOFF_MS);
    i--; // retry same experiment
    continue;
  }

  consecutiveFailures = 0;
  results.push(result);

  // Checkpoint after each successful call
  writeFileSync(RESULTS_PATH, JSON.stringify(results, null, 2));

  if (result.status === 200) {
    const preview = result.reaction?.slice(0, 60).replace(/\n/g, " ") || "(empty)";
    console.log(` ${result.latencyMs}ms "${preview}..."`);
  } else {
    console.log(` ERROR ${result.status}`);
  }

  // Stagger between calls
  if (i < experiments.length - 1) {
    await sleep(STAGGER_MS);
  }
}

// --- Summary ---

const successful = results.filter(r => r.status === 200);
console.log(`\n=== Summary: ${successful.length} reactions collected ===\n`);

// Group by phase
const phases = {};
for (const r of successful) {
  if (!phases[r.phase]) phases[r.phase] = [];
  phases[r.phase].push(r);
}

for (const [phase, items] of Object.entries(phases).sort((a, b) => a[0] - b[0])) {
  const phaseNames = ["Baseline", "SNARK gradient", "CHAOS gradient", "WISDOM gradient", "Interactions", "Species×Stat", "Personality override"];
  console.log(`  Phase ${phase}: ${phaseNames[phase] || "Unknown"}`);
  for (const item of items) {
    const words = item.reactionWords;
    const preview = item.reaction?.slice(0, 70).replace(/\n/g, " ") || "(empty)";
    console.log(`    ${item.description.padEnd(30)} ${String(words).padStart(3)}w  ${preview}`);
  }
  console.log("");
}

console.log(`  Results saved to: ${RESULTS_PATH}\n`);
