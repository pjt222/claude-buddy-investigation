#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const CLAUDE_DIR = join(homedir(), ".claude");
const CONFIG_PATH = join(CLAUDE_DIR, ".claude.json");
const CREDS_PATH = join(CLAUDE_DIR, ".credentials.json");

const API_BASE = "https://api.anthropic.com";
const BETA_HEADER = "oauth-2025-04-20";
const USER_AGENT = "claude-code/2.1.90";
const COOLDOWN_MS = 5000;
const RING_BUFFER_SIZE = 3;

// Shingle's deterministic bones (derived from account hash, stable across sessions)
const BONES = {
  species: "owl",
  rarity: "common",
  stats: { DEBUGGING: 10, PATIENCE: 81, CHAOS: 1, WISDOM: 36, SNARK: 21 },
};

const recentReactions = [];
let lastCallTime = 0;

function readConfig() {
  const config = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
  const creds = JSON.parse(readFileSync(CREDS_PATH, "utf-8"));

  const companion = config.companion;
  if (!companion) throw new Error("No companion found in config. Run /buddy first.");

  const orgUuid = config.oauthAccount?.organizationUuid;
  if (!orgUuid) throw new Error("No organizationUuid found in config.");

  const oauth = creds.claudeAiOauth;
  if (!oauth?.accessToken) throw new Error("No OAuth access token found in credentials.");

  if (oauth.expiresAt && Date.now() > oauth.expiresAt) {
    throw new Error("OAuth token expired. Restart Claude Code to refresh.");
  }

  return {
    name: companion.name,
    personality: companion.personality,
    orgUuid,
    accessToken: oauth.accessToken,
  };
}

async function callBuddyReact(transcript, reason, addressed) {
  const now = Date.now();
  const elapsed = now - lastCallTime;
  if (elapsed < COOLDOWN_MS) {
    return { error: `Cooldown: wait ${Math.ceil((COOLDOWN_MS - elapsed) / 1000)}s before asking again.` };
  }

  const config = readConfig();

  const payload = {
    name: config.name,
    personality: config.personality,
    species: BONES.species,
    rarity: BONES.rarity,
    stats: BONES.stats,
    transcript,
    reason,
    recent: [...recentReactions],
    addressed,
  };

  const url = `${API_BASE}/api/organizations/${config.orgUuid}/claude_code/buddy_react`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${config.accessToken}`,
      "Content-Type": "application/json",
      "User-Agent": USER_AGENT,
      "anthropic-beta": BETA_HEADER,
      "Accept": "application/json",
      "Accept-Encoding": "identity",
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    return { error: `API error ${response.status}: ${text}` };
  }

  const data = await response.json();
  lastCallTime = Date.now();

  if (data.reaction) {
    recentReactions.push(data.reaction);
    if (recentReactions.length > RING_BUFFER_SIZE) recentReactions.shift();
  }

  return data;
}

const server = new Server(
  { name: "shingle-mcp", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler("tools/list", async () => ({
  tools: [
    {
      name: "ask_shingle",
      description:
        "Ask Shingle (your owl companion) to react to the current conversation context. " +
        "Returns a short in-character reaction. Use this when the user wants Shingle's perspective " +
        "or when Shingle was addressed by name.",
      inputSchema: {
        type: "object",
        properties: {
          transcript: {
            type: "string",
            description:
              "Conversation context for Shingle to react to. " +
              'Format as "user: ...\\nclaude: ..." or free-form text.',
          },
          reason: {
            type: "string",
            enum: ["turn", "pet", "hatch", "test-fail", "error", "large-diff"],
            default: "turn",
            description: "Trigger reason. Usually 'turn' for general reactions, 'pet' for affection.",
          },
          addressed: {
            type: "boolean",
            default: false,
            description: "Whether the user addressed Shingle by name.",
          },
        },
        required: ["transcript"],
      },
    },
    {
      name: "get_shingle_info",
      description: "Get Shingle's companion profile: name, personality, species, rarity, and stats.",
      inputSchema: { type: "object", properties: {} },
    },
  ],
}));

server.setRequestHandler("tools/call", async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "ask_shingle") {
    try {
      const transcript = args.transcript || "(no context)";
      const reason = args.reason || "turn";
      const addressed = args.addressed ?? false;

      const result = await callBuddyReact(transcript, reason, addressed);

      if (result.error) {
        return { content: [{ type: "text", text: result.error }], isError: true };
      }

      return {
        content: [{ type: "text", text: result.reaction || "(no reaction)" }],
      };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
  }

  if (name === "get_shingle_info") {
    try {
      const config = readConfig();
      const info = {
        name: config.name,
        personality: config.personality,
        ...BONES,
        recentReactions: [...recentReactions],
      };
      return { content: [{ type: "text", text: JSON.stringify(info, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
  }

  return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
});

const transport = new StdioServerTransport();
await server.connect(transport);
