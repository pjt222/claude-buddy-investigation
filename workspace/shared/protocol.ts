// Socket.IO event names and payload types — shared between server and client

export const Events = {
  // Terminal
  TERMINAL_OUTPUT: "terminal:output",
  TERMINAL_EXITED: "terminal:exited",

  // User input
  USER_INPUT: "user:input",
  TERMINAL_INPUT: "terminal:input",
  TERMINAL_RESIZE: "terminal:resize",

  // Buddy reactions
  BUDDY_REACTION: "buddy:reaction",
  CONVERGENCE_SIGNAL: "buddy:convergence",

  // Transcript
  TRANSCRIPT_ENTRY: "transcript:entry",
  TRANSCRIPT_HISTORY: "transcript:history",
  TRANSCRIPT_ROTATE: "transcript:rotate",

  // Session
  SESSION_CHANGED: "session:changed",
  SESSION_SWITCH: "session:switch",
  TEST_PROMPT: "session:test-prompt",
  LIST_PRESETS: "session:list-presets",
  PRESETS_LIST: "session:presets-list",

  // Status
  STATUS_UPDATE: "status:update",
} as const;

export interface TerminalOutputPayload {
  delta: string;
  paneId: number;
}

export interface UserInputPayload {
  text: string;
}

export interface BuddyReactionPayload {
  name: string;
  species: string;
  tier: "bubble" | "bootstrapped";
  slot: string;
  reaction: string;
  trigger: string;
  skill?: string;
  timestamp: number;
}

export interface TranscriptEntry {
  id: string;
  timestamp: number;
  source: "user" | "claude" | "buddy";
  buddyName?: string;
  buddyTier?: "bubble" | "bootstrapped";
  /** How the reaction was captured: "native" = PTY bubble extraction, "api" = buddy_react API */
  channel?: "native" | "api";
  content: string;
  trigger?: string;
  skill?: string;
}

export interface SessionInfo {
  name: string;
  description: string;
  buddies: Array<{
    name: string;
    species: string;
    tier: "bubble" | "bootstrapped";
    slot: string;
    skills: string[];
    stats: Record<string, number>;
    rarity: string;
  }>;
}

export interface StatusPayload {
  connected: boolean;
  claudePaneId: number | null;
  session: SessionInfo | null;
  buddyCooldowns: Record<string, number>;
}
