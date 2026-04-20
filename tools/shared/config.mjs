// config.mjs — Unified Shingle configuration
//
// Single config file at ~/.claude/shingle.json controls:
//   - strategy: which capture strategy runs (scrape, replay, both)
//   - profile:  which stat profile to use (native, mage, custom)
//   - stats:    custom stat overrides (only used when profile = "custom")
//
// Falls back to defaults if the file doesn't exist.
// Environment variables still work as overrides (highest priority).

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { deriveBones, NATIVE_SHINGLE } from "./bones.mjs";

const CONFIG_PATH = join(homedir(), ".claude", "shingle.json");
const CLAUDE_CONFIG_PATH = join(homedir(), ".claude", ".claude.json");
const CREDS_PATH = join(homedir(), ".claude", ".credentials.json");

const DEFAULTS = {
  strategy: "both",
  profile: "native",
  stats: null,
};

// Named profiles — "native" derives from userId, "mage" is the tuned MCP owl
const PROFILES = {
  mage: {
    species: "owl",
    rarity: "common",
    stats: { DEBUGGING: 1, PATIENCE: 95, CHAOS: 1, WISDOM: 99, SNARK: 21 },
  },
};

/**
 * Read unified Shingle config from ~/.claude/shingle.json.
 * Env vars override file values. Missing file returns defaults.
 */
export function readShingleConfig() {
  let fileConfig = {};
  try {
    fileConfig = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
  } catch {
    // File missing or malformed — use defaults
  }

  return {
    strategy: process.env.SHINGLE_CAPTURE_STRATEGY || fileConfig.strategy || DEFAULTS.strategy,
    profile: process.env.SHINGLE_PROFILE || fileConfig.profile || DEFAULTS.profile,
    stats: fileConfig.stats || DEFAULTS.stats,
  };
}

/**
 * Resolve BONES for API calls based on profile selection.
 *
 * Production uses accountUuid as the hash input (falls back to userID, then "anon").
 * Matches the binary's account-resolver precedence: oauthAccount?.accountUuid ?? userID ?? "anon"
 *
 * @param {string|null} accountUuid - account UUID from oauthAccount (preferred)
 * @param {string|null} userID - fallback user ID hash
 * @returns {{ species: string, rarity: string, stats: object }}
 */
export function resolveBones(accountUuid, userID) {
  const config = readShingleConfig();

  if (config.profile === "custom" && config.stats) {
    return {
      species: config.stats.species || "owl",
      rarity: config.stats.rarity || "common",
      stats: config.stats.stats || NATIVE_SHINGLE.stats,
    };
  }

  if (config.profile === "mage") {
    return PROFILES.mage;
  }

  // Default: "native" — derive from accountUuid (matches the binary's account-resolver priority)
  const inputId = accountUuid ?? userID ?? "anon";
  const bones = deriveBones(inputId);
  return { species: bones.species, rarity: bones.rarity, stats: bones.stats };
}

/**
 * Read advisor configuration from Claude Code's main config.
 *
 * The advisor system (v2.1.97+) stores advisorModel in the user settings
 * schema. Returns null if advisor is not configured.
 *
 * @returns {{ advisorModel: string|null }}
 */
export function readAdvisorConfig() {
  try {
    const raw = readFileSync(CLAUDE_CONFIG_PATH, "utf-8");
    const config = JSON.parse(raw);
    return {
      advisorModel: config.advisorModel ?? null,
    };
  } catch {
    return { advisorModel: null };
  }
}

/**
 * Detect the installed Claude Code version and return a User-Agent string.
 *
 * Reads ~/.local/share/claude/versions/ to find the latest semver directory.
 * Returns "claude-code/<version>" or "claude-code/unknown" if unavailable.
 *
 * @returns {string}
 */
export function getUserAgent() {
  try {
    const versionsDir = join(homedir(), ".local", "share", "claude", "versions");
    const versions = readdirSync(versionsDir).filter(v => /^\d+\.\d+\.\d+$/.test(v)).sort();
    return `claude-code/${versions.at(-1) || "unknown"}`;
  } catch {
    return "claude-code/unknown";
  }
}

/**
 * Read Claude Code auth credentials for API calls.
 *
 * Reads orgUuid from ~/.claude/.claude.json and accessToken from
 * ~/.claude/.credentials.json. Throws on missing or expired credentials.
 *
 * @returns {{ orgUuid: string, accessToken: string }}
 */
export function readAuth() {
  const config = JSON.parse(readFileSync(CLAUDE_CONFIG_PATH, "utf-8"));
  const creds = JSON.parse(readFileSync(CREDS_PATH, "utf-8"));

  const orgUuid = config.oauthAccount?.organizationUuid;
  if (!orgUuid) throw new Error("No organizationUuid in config.");

  const oauth = creds.claudeAiOauth;
  if (!oauth?.accessToken) throw new Error("No OAuth token in credentials.");

  if (oauth.expiresAt && Date.now() > oauth.expiresAt) {
    throw new Error("OAuth token expired. Restart Claude Code to refresh.");
  }

  return { orgUuid, accessToken: oauth.accessToken };
}
