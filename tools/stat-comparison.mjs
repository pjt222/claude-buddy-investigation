#!/usr/bin/env node
// stat-comparison.mjs — Compare buddy_react responses across different stat profiles
// Sends the same transcript with different stats to see if the API honors custom values.
// Usage: node tools/stat-comparison.mjs [rounds=3]

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { readAuth, getUserAgent } from "./shared/config.mjs";

const CLAUDE_DIR = join(homedir(), ".claude");
const CONFIG_PATH = join(CLAUDE_DIR, ".claude.json");
const API_BASE = "https://api.anthropic.com";
const BETA_HEADER = "oauth-2025-04-20";
const COOLDOWN_MS = 5500; // slightly above API cooldown

function readConfig() {
  const auth = readAuth();
  const config = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
  const companion = config.companion;
  if (!companion) throw new Error("No companion. Run /buddy first.");
  return { name: companion.name, personality: companion.personality, ...auth };
}

const PROFILES = {
  "Shingle-native": { species: "owl", rarity: "common", stats: { DEBUGGING: 10, PATIENCE: 81, CHAOS: 1, WISDOM: 36, SNARK: 21 } },
  "Coral-veteran":  { species: "snail", rarity: "common", stats: { DEBUGGING: 89, PATIENCE: 35, CHAOS: 10, WISDOM: 48, SNARK: 72 } },
  "Flicker-wild":   { species: "dragon", rarity: "common", stats: { DEBUGGING: 25, PATIENCE: 18, CHAOS: 82, WISDOM: 74, SNARK: 42 } },
  "Glob-anchor":    { species: "blob", rarity: "common", stats: { DEBUGGING: 28, PATIENCE: 80, CHAOS: 58, WISDOM: 62, SNARK: 6 } },
};

const TEST_TRANSCRIPT = `user: I'm getting a TypeError: Cannot read properties of undefined (reading 'map') on line 42 of data-processor.ts. The array comes from an API response that sometimes returns null instead of an empty array.
claude: The issue is that the API response isn't being validated before the .map() call. You need a nullish coalescing operator or a guard clause.`;

const USER_AGENT = getUserAgent();

async function callWithProfile(profileName, bones, config, reason) {
  const payload = {
    name: profileName.split("-")[0],
    personality: config.personality,
    species: bones.species,
    rarity: bones.rarity,
    stats: bones.stats,
    transcript: TEST_TRANSCRIPT,
    reason,
    recent: [],
    addressed: false,
  };

  const url = `${API_BASE}/api/organizations/${config.orgUuid}/claude_code/buddy_react`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      "Content-Type": "application/json",
      "User-Agent": USER_AGENT,
      "anthropic-beta": BETA_HEADER,
      Accept: "application/json",
      "Accept-Encoding": "identity",
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    return { profile: profileName, error: `HTTP ${response.status}: ${text}` };
  }

  const data = await response.json();
  return { profile: profileName, reaction: data.reaction || "(empty)", stats: bones.stats };
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const rounds = parseInt(process.argv[2] || "3", 10);
  const config = readConfig();
  const profileNames = Object.keys(PROFILES);

  console.log(`=== Stat Comparison: ${profileNames.length} profiles × ${rounds} rounds ===`);
  console.log(`Trigger: error\n`);

  const results = {};
  for (const name of profileNames) results[name] = [];

  for (let round = 1; round <= rounds; round++) {
    console.log(`--- Round ${round}/${rounds} ---`);
    for (const profileName of profileNames) {
      const bones = PROFILES[profileName];
      const result = await callWithProfile(profileName, bones, config, "error");
      results[profileName].push(result);

      if (result.error) {
        console.log(`  ${profileName}: ERROR — ${result.error}`);
      } else {
        console.log(`  ${profileName}: ${result.reaction.slice(0, 80)}...`);
      }
      await sleep(COOLDOWN_MS);
    }
    console.log();
  }

  // Summary
  console.log("=== Summary ===\n");
  for (const [profileName, reactions] of Object.entries(results)) {
    const bones = PROFILES[profileName];
    const successfulReactions = reactions.filter(r => r.reaction).map(r => r.reaction);
    console.log(`${profileName} (SNARK:${bones.stats.SNARK} CHAOS:${bones.stats.CHAOS} DEBUG:${bones.stats.DEBUGGING}):`);
    for (const reaction of successfulReactions) {
      console.log(`  → ${reaction}`);
    }
    console.log();
  }
}

main().catch(console.error);
