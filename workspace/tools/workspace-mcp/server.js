#!/usr/bin/env node

// workspace-mcp — MCP server for reading Buddy Workspace transcript and status.
// Reads from workspace/.transcript/session-*.jsonl (timestamped, written by the workspace server).
// Queries workspace server's /api/status endpoint for live session info.

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  SubscribeRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { readFileSync, readdirSync, existsSync, watch, statSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = join(__dirname, "..", "..");
const DEFAULT_TRANSCRIPT_DIR = join(WORKSPACE_ROOT, ".transcript");
const BUDDY_PORT = process.env.BUDDY_PORT || "3777";
const STATUS_URL = `http://localhost:${BUDDY_PORT}/api/status`;

// Resolved at request time so tests can set WORKSPACE_TRANSCRIPT_DIR for isolation.
function getTranscriptDir() {
  return process.env.WORKSPACE_TRANSCRIPT_DIR || DEFAULT_TRANSCRIPT_DIR;
}

function findLatestJsonl() {
  const transcriptDir = getTranscriptDir();
  if (!existsSync(transcriptDir)) return null;
  const files = readdirSync(transcriptDir)
    .filter((f) => f.startsWith("session-") && f.endsWith(".jsonl"))
    .sort()
    .reverse();
  return files.length > 0 ? join(transcriptDir, files[0]) : null;
}

// --- JSONL helpers ---

let jsonlCache = { path: null, mtimeMs: 0, entries: null };

function getEntries() {
  const path = findLatestJsonl();
  if (!path) return [];
  let mtimeMs;
  try {
    mtimeMs = statSync(path).mtimeMs;
  } catch {
    return [];
  }
  if (jsonlCache.path === path && jsonlCache.mtimeMs === mtimeMs && jsonlCache.entries) {
    return jsonlCache.entries;
  }
  const raw = readFileSync(path, "utf-8").trim();
  if (!raw) {
    jsonlCache = { path, mtimeMs, entries: [] };
    return [];
  }
  const entries = raw
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  jsonlCache = { path, mtimeMs, entries };
  return entries;
}

function readJsonlTail(count = 20, filter = {}) {
  let entries = getEntries();
  if (entries.length === 0) return [];

  if (filter.source) {
    entries = entries.filter((e) => e.source === filter.source);
  }
  if (filter.buddyName) {
    entries = entries.filter(
      (e) => e.buddyName && e.buddyName.toLowerCase() === filter.buddyName.toLowerCase()
    );
  }

  return entries.slice(-count);
}

function searchJsonl(query, count = 20) {
  const entries = getEntries();
  if (entries.length === 0) return [];

  const needle = query.toLowerCase();

  return entries
    .filter(
      (e) =>
        e.content?.toLowerCase().includes(needle) ||
        e.buddyName?.toLowerCase().includes(needle) ||
        e.source?.toLowerCase().includes(needle)
    )
    .slice(-count);
}

function formatEntries(entries) {
  return entries
    .map((e) => {
      const time = new Date(e.timestamp).toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
      const label =
        e.source === "buddy" && e.buddyName
          ? `${e.buddyName} (${e.buddyTier || "buddy"})`
          : e.source;
      const skillTag = e.skill ? ` [${e.skill}]` : "";
      const triggerTag = e.trigger ? ` <${e.trigger}>` : "";
      return `[${time}] ${label}${skillTag}${triggerTag}: ${e.content}`;
    })
    .join("\n");
}

// --- MCP server ---

const server = new Server(
  { name: "workspace-mcp", version: "1.0.0" },
  { capabilities: { tools: {}, resources: { subscribe: true } } }
);

// --- Resource subscriptions ---
const subscribedResources = new Set();

// --- Resource handlers ---

server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: [
    {
      uri: "transcript://latest",
      name: "Buddy Workspace Transcript",
      description:
        "Live transcript from the Buddy Workspace — user prompts, Claude responses, and buddy reactions. " +
        "Re-read this resource to get the latest entries. Subscribe for change notifications.",
      mimeType: "text/plain",
    },
    {
      uri: "transcript://status",
      name: "Workspace Status",
      description:
        "Current session preset, buddy roster, cooldown timers, and PTY state.",
      mimeType: "text/plain",
    },
  ],
}));

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;

  if (uri === "transcript://latest") {
    const entries = readJsonlTail(50, {});
    const text =
      entries.length > 0
        ? formatEntries(entries)
        : "No transcript entries yet. Is the workspace server running?";
    return {
      contents: [{ uri, mimeType: "text/plain", text }],
    };
  }

  if (uri === "transcript://status") {
    try {
      const response = await fetch(STATUS_URL, {
        signal: AbortSignal.timeout(3000),
      });
      if (!response.ok) {
        return {
          contents: [
            {
              uri,
              mimeType: "text/plain",
              text: `Workspace server returned ${response.status}.`,
            },
          ],
        };
      }
      const status = await response.json();
      const lines = [];
      if (status.session) {
        lines.push(`Session: ${status.session.name}`);
        lines.push(`Description: ${status.session.description}`);
        lines.push("");
        lines.push("Buddies:");
        for (const buddy of status.session.buddies) {
          const cooldown = status.buddyCooldowns?.[buddy.name] || 0;
          const cooldownStr =
            cooldown > 0
              ? ` (cooldown: ${Math.ceil(cooldown / 1000)}s)`
              : " (ready)";
          lines.push(
            `  ${buddy.name} — ${buddy.species}, ${buddy.tier}, skills: [${buddy.skills.join(", ")}]${cooldownStr}`
          );
        }
      } else {
        lines.push("No active session.");
      }
      lines.push("");
      lines.push(
        `PTY: ${status.claudePaneId !== null ? "running" : "stopped"}`
      );
      return {
        contents: [{ uri, mimeType: "text/plain", text: lines.join("\n") }],
      };
    } catch (err) {
      return {
        contents: [
          {
            uri,
            mimeType: "text/plain",
            text: `Could not reach workspace server: ${err.message}`,
          },
        ],
      };
    }
  }

  return {
    contents: [
      { uri, mimeType: "text/plain", text: `Unknown resource: ${uri}` },
    ],
  };
});

server.setRequestHandler(SubscribeRequestSchema, async (request) => {
  subscribedResources.add(request.params.uri);
  return {};
});

// --- Tool handlers ---

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "read_transcript",
      description:
        "Read recent entries from the Buddy Workspace transcript. " +
        "Returns messages from user, Claude, and buddy companions (Shingle, Ponder, etc.) " +
        "in chronological order. Use this to see what buddies have said or to review " +
        "the conversation history.",
      inputSchema: {
        type: "object",
        properties: {
          count: {
            type: "number",
            default: 20,
            description:
              "Number of recent entries to return (max 100). Default 20.",
          },
          source: {
            type: "string",
            enum: ["user", "claude", "buddy"],
            description:
              "Filter by source. Omit to show all sources.",
          },
          buddyName: {
            type: "string",
            description:
              "Filter by buddy name (e.g., 'Shingle', 'Ponder'). Only applies to buddy entries.",
          },
        },
      },
    },
    {
      name: "search_transcript",
      description:
        "Search the Buddy Workspace transcript for entries matching a query. " +
        "Searches content, buddy names, and source labels.",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Text to search for (case-insensitive).",
          },
          count: {
            type: "number",
            default: 20,
            description: "Maximum number of results to return.",
          },
        },
        required: ["query"],
      },
    },
    {
      name: "get_workspace_status",
      description:
        "Get the current Buddy Workspace status: active session preset, " +
        "buddy roster with species/tier/skills, and cooldown timers.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "read_transcript") {
    const count = Math.min(args?.count || 20, 100);
    const filter = {};
    if (args?.source) filter.source = args.source;
    if (args?.buddyName) filter.buddyName = args.buddyName;

    const entries = readJsonlTail(count, filter);
    if (entries.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: findLatestJsonl()
              ? "No matching transcript entries found."
              : "No transcript files found in .transcript/. Is the Buddy Workspace server running?",
          },
        ],
      };
    }

    return {
      content: [
        {
          type: "text",
          text: `${entries.length} transcript entries:\n\n${formatEntries(entries)}`,
        },
      ],
    };
  }

  if (name === "search_transcript") {
    const query = args?.query || "";
    const count = Math.min(args?.count || 20, 100);

    if (!query) {
      return {
        content: [{ type: "text", text: "Query parameter is required." }],
        isError: true,
      };
    }

    const entries = searchJsonl(query, count);
    if (entries.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: `No transcript entries matching "${query}".`,
          },
        ],
      };
    }

    return {
      content: [
        {
          type: "text",
          text: `${entries.length} entries matching "${query}":\n\n${formatEntries(entries)}`,
        },
      ],
    };
  }

  if (name === "get_workspace_status") {
    try {
      const response = await fetch(STATUS_URL, {
        signal: AbortSignal.timeout(3000),
      });
      if (!response.ok) {
        return {
          content: [
            {
              type: "text",
              text: `Workspace server returned ${response.status}. Is it running on port ${BUDDY_PORT}?`,
            },
          ],
          isError: true,
        };
      }

      const status = await response.json();
      const lines = [];

      if (status.session) {
        lines.push(`Session: ${status.session.name}`);
        lines.push(`Description: ${status.session.description}`);
        lines.push("");
        lines.push("Buddies:");
        for (const buddy of status.session.buddies) {
          const cooldown = status.buddyCooldowns?.[buddy.name] || 0;
          const cooldownStr =
            cooldown > 0 ? ` (cooldown: ${Math.ceil(cooldown / 1000)}s)` : " (ready)";
          lines.push(
            `  ${buddy.name} — ${buddy.species}, ${buddy.tier}, skills: [${buddy.skills.join(", ")}]${cooldownStr}`
          );
        }
      } else {
        lines.push("No active session.");
      }

      lines.push("");
      lines.push(`PTY: ${status.claudePaneId !== null ? "running" : "stopped"}`);

      return {
        content: [{ type: "text", text: lines.join("\n") }],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text",
            text: `Could not reach workspace server: ${err.message}. Is it running? (cd workspace && pnpm dev)`,
          },
        ],
        isError: true,
      };
    }
  }

  return {
    content: [{ type: "text", text: `Unknown tool: ${name}` }],
    isError: true,
  };
});

// --- File watcher: notify subscribers on transcript changes ---
const watchDir = getTranscriptDir();
if (existsSync(watchDir)) {
  let debounceTimer = null;
  watch(watchDir, { recursive: false }, () => {
    jsonlCache = { path: null, mtimeMs: 0, entries: null };
    if (debounceTimer) return;
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      if (subscribedResources.has("transcript://latest")) {
        server.notification({
          method: "notifications/resources/updated",
          params: { uri: "transcript://latest" },
        });
      }
    }, 500);
  });
}

// Exit when the client closes stdin so the process doesn't linger (the file watcher keeps the loop alive).
// Registered before connect(); resume() forces flowing mode so 'end' fires on EOF.
process.stdin.on("end", () => process.exit(0));
process.stdin.resume();

const transport = new StdioServerTransport();
await server.connect(transport);
