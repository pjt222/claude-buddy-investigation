// strategy-replay.mjs — Capture via direct buddy_react API call
//
// Makes an independent API call to get Shingle's reaction to the current context.
// Note: this produces a PARALLEL reaction, not the same one as the native bubble.

import { readConfig } from "./util.mjs";

const API_BASE = "https://api.anthropic.com";
const BETA_HEADER = "oauth-2025-04-20";
const USER_AGENT = "claude-code/2.1.90";

// MCP Shingle's bones — tuned for calmer reactions (see architecture.md §BONES divergence)
// Native: { DEBUGGING: 10, PATIENCE: 81, CHAOS: 1, WISDOM: 36, SNARK: 21 }
const BONES = {
  species: "owl",
  rarity: "common",
  stats: { DEBUGGING: 1, PATIENCE: 95, CHAOS: 1, WISDOM: 36, SNARK: 21 },
};

/**
 * Call buddy_react API and return the reaction.
 * @param {string} transcript - conversation context
 * @param {string} reason - trigger reason (default: "turn")
 * @returns {{ reaction: string, raw: object }}
 */
export async function replayCapture(transcript, reason = "turn") {
  const config = readConfig();

  const payload = {
    name: config.name,
    personality: config.personality,
    species: BONES.species,
    rarity: BONES.rarity,
    stats: BONES.stats,
    transcript,
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
    throw new Error(`API ${response.status}: ${text}`);
  }

  const data = await response.json();

  return {
    reaction: data.reaction || null,
    raw: data,
  };
}
