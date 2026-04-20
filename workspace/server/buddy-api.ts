// buddy-api.ts — Multi-buddy buddy_react API caller
// Ported from tools/shingle-mcp/server.js with per-buddy cooldown + ring buffer

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { COOLDOWN_BY_PRIORITY, type TriggerPriority } from "./trigger-priority.ts";

const CLAUDE_DIR = join(homedir(), ".claude");
const CONFIG_PATH = join(CLAUDE_DIR, ".claude.json");
const CREDS_PATH = join(CLAUDE_DIR, ".credentials.json");
const API_BASE = "https://api.anthropic.com";
const BETA_HEADER = "oauth-2025-04-20";
const RING_BUFFER_SIZE = 3;

// Canonical implementation: tools/shared/config.mjs getUserAgent()
// Kept local here because TypeScript can't cleanly import from .mjs
function detectUserAgent(): string {
  try {
    const versionsDir = join(homedir(), ".local", "share", "claude", "versions");
    const versions = readdirSync(versionsDir)
      .filter((v) => /^\d+\.\d+\.\d+$/.test(v))
      .sort();
    return `claude-code/${versions.at(-1) || "unknown"}`;
  } catch {
    return "claude-code/unknown";
  }
}

const USER_AGENT = detectUserAgent();

export interface ClaudeConfig {
  name: string;
  personality: string;
  orgUuid: string;
  accessToken: string;
  userId: string | null;
}

// Auth reading duplicated here because cross-importing .mjs from .ts is messy.
// Canonical implementation: tools/shared/config.mjs readAuth()
export function readClaudeConfig(): ClaudeConfig {
  const config = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
  const creds = JSON.parse(readFileSync(CREDS_PATH, "utf-8"));

  const companion = config.companion;
  if (!companion) throw new Error("No companion in config. Run /buddy first.");

  const orgUuid = config.oauthAccount?.organizationUuid;
  if (!orgUuid) throw new Error("No organizationUuid in config.");

  const oauth = creds.claudeAiOauth;
  if (!oauth?.accessToken) throw new Error("No OAuth token in credentials.");

  if (oauth.expiresAt && Date.now() > oauth.expiresAt) {
    throw new Error("OAuth token expired. Restart Claude Code.");
  }

  return {
    name: companion.name,
    personality: companion.personality,
    orgUuid,
    accessToken: oauth.accessToken,
    userId: config.userID || config.oauthAccount?.userId || null,
  };
}

export interface BuddyIdentity {
  name: string;
  personality: string;
  species: string;
  rarity: string;
  stats: Record<string, number>;
}

interface BuddyState {
  lastCallTime: number;
  backoffUntil: number; // Set by 429 handler; cooldown check uses max(lastCallTime+cooldown, backoffUntil)
  recentReactions: string[];
  cooldownMs: number;
}

const buddyStates = new Map<string, BuddyState>();

function getState(name: string, cooldownMs: number): BuddyState {
  let state = buddyStates.get(name);
  if (!state) {
    state = { lastCallTime: 0, backoffUntil: 0, recentReactions: [], cooldownMs };
    buddyStates.set(name, state);
  }
  return state;
}

export interface BuddyReactResult {
  name: string;
  reaction: string | null;
  error?: string;
  trigger: string;
  skill?: string;
}

export async function callBuddyReact(
  buddy: BuddyIdentity,
  transcript: string,
  reason: TriggerPriority,
  cooldownMs: number,
  options?: { addressed?: boolean; skill?: string; skillContext?: Record<string, unknown> }
): Promise<BuddyReactResult> {
  const state = getState(buddy.name, cooldownMs);
  const now = Date.now();
  const effectiveCooldown = COOLDOWN_BY_PRIORITY[reason] ?? state.cooldownMs;

  // Blocked if: still within normal cooldown OR a 429 backoff is active
  const cooldownEnd = state.lastCallTime + effectiveCooldown;
  const blockedUntil = Math.max(cooldownEnd, state.backoffUntil);
  if (now < blockedUntil) {
    return {
      name: buddy.name,
      reaction: null,
      error: `Cooldown: ${Math.ceil((blockedUntil - now) / 1000)}s remaining`,
      trigger: reason,
    };
  }

  let config: ClaudeConfig;
  try {
    config = readClaudeConfig();
  } catch (err) {
    return {
      name: buddy.name,
      reaction: null,
      error: (err as Error).message,
      trigger: reason,
    };
  }

  const payload: Record<string, unknown> = {
    name: buddy.name,
    personality: buddy.personality,
    species: buddy.species,
    rarity: buddy.rarity,
    stats: buddy.stats,
    transcript,
    reason,
    recent: [...state.recentReactions],
    addressed: options?.addressed ?? false,
  };

  if (options?.skill) {
    payload.skill = options.skill;
    if (options.skillContext) payload.skill_context = options.skillContext;
  }

  const url = `${API_BASE}/api/organizations/${config.orgUuid}/claude_code/buddy_react`;

  try {
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

    if (response.status === 429) {
      const retryAfter = parseInt(response.headers.get("retry-after") || "5", 10);
      const waitMs = Math.min(retryAfter * 1000, 15000);
      state.backoffUntil = Date.now() + waitMs;
      const text = await response.text().catch(() => "");
      return { name: buddy.name, reaction: null, error: `API 429: ${text}`, trigger: reason };
    }

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      return { name: buddy.name, reaction: null, error: `API ${response.status}: ${text}`, trigger: reason };
    }

    const data = await response.json();
    state.lastCallTime = Date.now();

    if (data.reaction) {
      state.recentReactions.push(data.reaction);
      if (state.recentReactions.length > RING_BUFFER_SIZE) state.recentReactions.shift();
    }

    return {
      name: buddy.name,
      reaction: data.reaction || null,
      trigger: reason,
      skill: options?.skill,
    };
  } catch (err) {
    return { name: buddy.name, reaction: null, error: (err as Error).message, trigger: reason };
  }
}

export function getCooldownRemaining(name: string, reason?: TriggerPriority): number {
  const state = buddyStates.get(name);
  if (!state) return 0;
  const cooldown = reason ? (COOLDOWN_BY_PRIORITY[reason] ?? state.cooldownMs) : state.cooldownMs;
  const now = Date.now();
  const cooldownEnd = state.lastCallTime + cooldown;
  const blockedUntil = Math.max(cooldownEnd, state.backoffUntil);
  return Math.max(0, blockedUntil - now);
}

/** Test helper: seed per-buddy state so cooldown logic can be tested without API calls. */
export function _setBuddyState(name: string, cooldownMs: number, lastCallTime: number): void {
  buddyStates.set(name, { lastCallTime, backoffUntil: 0, recentReactions: [], cooldownMs });
}

/** Test helper: clear all per-buddy state. */
export function _clearBuddyStates(): void {
  buddyStates.clear();
}
