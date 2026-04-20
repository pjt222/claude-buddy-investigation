// session-manager.ts — Loads session presets and manages buddy roster

import { readFileSync } from "node:fs";
import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { readClaudeConfig, type BuddyIdentity } from "./buddy-api.ts";
import type { SessionInfo } from "../shared/protocol.ts";

// Session presets live in tools/sessions/ relative to repo root
const REPO_ROOT = join(import.meta.dirname, "..", "..");
const DEFAULT_PRESETS_DIR = resolve(REPO_ROOT, "tools", "sessions");

// Resolved at call time so tests can set WORKSPACE_PRESETS_DIR for isolation.
function getPresetsDir(): string {
  return process.env.WORKSPACE_PRESETS_DIR
    ? resolve(process.env.WORKSPACE_PRESETS_DIR)
    : DEFAULT_PRESETS_DIR;
}

export interface SessionPreset {
  session: string;
  description: string;
  prompt?: string;
  testPrompt?: string;
  driver: { role: string; awareness: string[] };
  bubbleBuddy: { slot: string; skills: string[] };
  bootstrapped: Array<{
    slot: string;
    config: { name: string; personality: string; species: string; stats?: Record<string, number>; skills: string[] };
  }>;
  almanac: Record<string, unknown>;
}

export interface ActiveBuddy {
  identity: BuddyIdentity;
  tier: "bubble" | "bootstrapped";
  slot: string;
  skills: string[];
  cooldownMs: number;
  delayMs: number;
}

let currentSession: SessionPreset | null = null;
let activeBuddies: ActiveBuddy[] = [];

export function listPresets(): string[] {
  try {
    return readdirSync(getPresetsDir())
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(".json", ""));
  } catch {
    return [];
  }
}

export function loadSession(name: string): SessionPreset {
  const presetsDir = getPresetsDir();
  const fullPath = resolve(presetsDir, `${name}.json`);
  if (!fullPath.startsWith(presetsDir + "/")) {
    throw new Error(`Invalid preset name: ${name}`);
  }
  const preset: SessionPreset = JSON.parse(readFileSync(fullPath, "utf-8"));
  currentSession = preset;

  // Resolve bubble buddy identity from Claude config
  let bubbleName = "Companion";
  let bubblePersonality = "";
  try {
    const config = readClaudeConfig();
    bubbleName = config.name;
    bubblePersonality = config.personality;
  } catch {
    // Config not available
  }

  activeBuddies = [];

  // Bubble buddy (Tier 2) — 30s cooldown, no delay
  // Species and stats are derived from user ID hash at runtime (see tools/shared/bones.mjs).
  // Config only persists name/personality/hatchedAt, so we use neutral defaults here.
  activeBuddies.push({
    identity: {
      name: bubbleName,
      personality: bubblePersonality,
      species: "unknown",
      rarity: "common",
      stats: { DEBUGGING: 50, PATIENCE: 50, CHAOS: 50, WISDOM: 50, SNARK: 50 },
    },
    tier: "bubble",
    slot: preset.bubbleBuddy.slot,
    skills: preset.bubbleBuddy.skills,
    cooldownMs: 30000,
    delayMs: 0,
  });

  // Bootstrapped buddies (Tier 3) — 45s cooldown, staggered delays
  preset.bootstrapped.forEach((b, i) => {
    activeBuddies.push({
      identity: {
        name: b.config.name,
        personality: b.config.personality,
        species: b.config.species,
        rarity: "common",
        stats: b.config.stats ?? { DEBUGGING: 50, PATIENCE: 50, CHAOS: 50, WISDOM: 50, SNARK: 50 },
      },
      tier: "bootstrapped",
      slot: b.slot,
      skills: b.config.skills,
      cooldownMs: 45000,
      delayMs: (i + 1) * 2000, // 2s, 4s stagger
    });
  });

  return preset;
}

export function getActiveBuddies(): ActiveBuddy[] {
  return [...activeBuddies];
}

export function getCurrentSession(): SessionPreset | null {
  return currentSession;
}

// Test-only: reset module state between tests.
export function _reset(): void {
  currentSession = null;
  activeBuddies = [];
}

export function getSessionInfo(): SessionInfo | null {
  if (!currentSession) return null;
  return {
    name: currentSession.session,
    description: currentSession.description,
    buddies: activeBuddies.map((b) => ({
      name: b.identity.name,
      species: b.identity.species,
      tier: b.tier,
      slot: b.slot,
      skills: b.skills,
      stats: b.identity.stats,
      rarity: b.identity.rarity,
    })),
  };
}
