// util.mjs — Shared utilities for shingle-capture strategies

import { appendFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

export const CAPTURE_LOG =
  process.env.SHINGLE_CAPTURE_LOG || "/tmp/shingle-capture.jsonl";

export const CLAUDE_DIR = join(homedir(), ".claude");
export const CONFIG_PATH = join(CLAUDE_DIR, ".claude.json");
export const CREDS_PATH = join(CLAUDE_DIR, ".credentials.json");

/**
 * Read conversation context from env var or stdin (non-blocking).
 */
export async function readContext() {
  // Prefer explicit env var
  if (process.env.SHINGLE_LAST_CONTEXT) {
    return process.env.SHINGLE_LAST_CONTEXT;
  }

  // Try reading stdin with a short timeout (hook may pipe context)
  try {
    const chunks = [];
    const timeout = setTimeout(() => process.stdin.destroy(), 500);
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
    }
    clearTimeout(timeout);
    const text = Buffer.concat(chunks).toString("utf-8").trim();
    if (text) return text;
  } catch {
    // stdin not available or timed out — fine
  }

  return "(no context provided)";
}

/**
 * Read Claude Code config and OAuth credentials.
 */
export function readConfig() {
  const config = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
  const creds = JSON.parse(readFileSync(CREDS_PATH, "utf-8"));

  const companion = config.companion;
  if (!companion) throw new Error("No companion in config.");

  const orgUuid = config.oauthAccount?.organizationUuid;
  if (!orgUuid) throw new Error("No organizationUuid in config.");

  const oauth = creds.claudeAiOauth;
  if (!oauth?.accessToken) throw new Error("No OAuth token.");

  if (oauth.expiresAt && Date.now() > oauth.expiresAt) {
    throw new Error("OAuth token expired.");
  }

  return {
    name: companion.name,
    personality: companion.personality,
    orgUuid,
    accessToken: oauth.accessToken,
  };
}

/**
 * Append a JSON line to the capture log.
 */
export async function appendLog(entry) {
  await appendFile(CAPTURE_LOG, JSON.stringify(entry) + "\n", "utf-8");
}

/**
 * Read the last N entries from the capture log.
 */
export async function readLastEntries(count = 5) {
  try {
    const content = await readFile(CAPTURE_LOG, "utf-8");
    const lines = content.trim().split("\n").filter(Boolean);
    return lines.slice(-count).map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}

// Re-export readFileSync for config reading (sync is fine for one-shot hook scripts)
import { readFileSync } from "node:fs";
