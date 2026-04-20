#!/usr/bin/env node

// api-health.mjs — Lightweight buddy_react API liveness check
//
// Pings the API with a minimal valid payload and reports status,
// latency, and any response schema changes. Appends to a JSONL log.
//
// Usage:
//   node tools/api-health.mjs           # single ping
//   node tools/api-health.mjs --log     # ping and append to health log

import { readFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { readAuth as readSharedAuth, getUserAgent } from "./shared/config.mjs";

const USER_AGENT = getUserAgent();

const CLAUDE_DIR = join(homedir(), ".claude");
const CONFIG_PATH = join(CLAUDE_DIR, ".claude.json");
const LOG_PATH = join(process.cwd(), "tools", "api-health.jsonl");
const API_BASE = "https://api.anthropic.com";
const BETA_HEADER = "oauth-2025-04-20";

function readAuth() {
  const auth = readSharedAuth();
  const config = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
  const companion = config.companion || {};
  return {
    ...auth,
    name: companion.name || "HealthCheck",
    personality: companion.personality || "A quiet observer.",
  };
}

async function ping() {
  const auth = readAuth();
  const url = `${API_BASE}/api/organizations/${auth.orgUuid}/claude_code/buddy_react`;

  const payload = {
    name: auth.name,
    personality: auth.personality,
    species: "owl",
    rarity: "common",
    stats: { DEBUGGING: 10, PATIENCE: 81, CHAOS: 1, WISDOM: 36, SNARK: 21 },
    transcript: "user: health check\nclaude: pong",
    reason: "turn",
    recent: [],
    addressed: false,
  };

  const startTime = performance.now();

  try {
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
    const status = response.status;
    const headers = Object.fromEntries(response.headers.entries());
    let body = null;
    let bodyText = "";

    try {
      bodyText = await response.text();
      body = JSON.parse(bodyText);
    } catch {
      body = { raw: bodyText.slice(0, 500) };
    }

    const result = {
      timestamp: new Date().toISOString(),
      status,
      latencyMs,
      alive: status === 200 && body?.reaction != null,
      reactionLength: body?.reaction?.length || 0,
      responseKeys: body ? Object.keys(body) : [],
      serverTiming: headers["x-envoy-upstream-service-time"] || null,
      requestId: headers["request-id"] || null,
    };

    return result;
  } catch (err) {
    const latencyMs = Math.round(performance.now() - startTime);
    return {
      timestamp: new Date().toISOString(),
      status: 0,
      latencyMs,
      alive: false,
      error: err.message,
    };
  }
}

// --- Display helper (used by main and version-monitor) ---

export function displayPingResult(result) {
  const statusColor = result.alive ? "\x1b[32m" : "\x1b[31m";
  const reset = "\x1b[0m";
  console.log(`\n  buddy_react API: ${statusColor}${result.alive ? "ALIVE" : "DOWN"}${reset}`);
  console.log(`  Status: ${result.status}`);
  console.log(`  Latency: ${result.latencyMs}ms${result.serverTiming ? ` (server: ${result.serverTiming}ms)` : ""}`);
  if (result.alive) {
    console.log(`  Reaction: ${result.reactionLength} chars`);
    console.log(`  Response keys: [${result.responseKeys.join(", ")}]`);
    if (result.requestId) console.log(`  Request ID: ${result.requestId}`);
  } else {
    console.log(`  Error: ${result.error || `HTTP ${result.status}`}`);
  }
}

export function logPingResult(result) {
  appendFileSync(LOG_PATH, JSON.stringify(result) + "\n");
}

export { ping, LOG_PATH };

// --- Main (only when run directly) ---

const isMain = process.argv[1] && (
  process.argv[1].endsWith("api-health.mjs") ||
  process.argv[1].endsWith("api-health")
);

if (isMain) {
  const shouldLog = process.argv.includes("--log");
  const result = await ping();
  displayPingResult(result);
  if (shouldLog) {
    logPingResult(result);
    console.log(`  Logged to: ${LOG_PATH}`);
  }
  console.log("");
}
