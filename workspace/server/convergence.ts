// convergence.ts — Detect topics that multiple buddies independently flagged

import type { TranscriptEntry } from "../shared/protocol.ts";

export interface TopicMatch {
  /** Normalized keyword that matched across buddies */
  topic: string;
  /** Buddy names that independently mentioned this topic */
  buddies: string[];
  /** The matching reaction snippets, keyed by buddy name */
  evidence: Record<string, string>;
}

export interface ConvergenceResult {
  /** Topics flagged by 2+ buddies */
  converged: TopicMatch[];
  /** Total buddy reactions analyzed */
  totalReactions: number;
  /** Distinct buddy names seen */
  buddyCount: number;
}

// Short words and fluff that don't carry topical weight
const STOP_WORDS = new Set([
  "a", "an", "the", "is", "it", "in", "on", "at", "to", "of", "and", "or",
  "but", "for", "with", "that", "this", "was", "are", "be", "been", "have",
  "has", "had", "do", "does", "did", "will", "would", "could", "should",
  "not", "no", "so", "if", "then", "than", "just", "you", "your", "i",
  "my", "we", "our", "they", "them", "its", "one", "all", "out", "up",
]);

// Code-domain terms that appear in nearly every programming discussion
// and buddy reaction vocabulary that doesn't signal specific convergence
const CODE_STOP_WORDS = new Set([
  // Programming terms that appear in nearly every code discussion
  "error", "function", "test", "null", "true", "false", "code", "file",
  "return", "use", "get", "set", "run", "call", "type", "class", "var",
  "let", "const", "import", "from", "new", "this", "value", "data",
  // Common reaction words that don't signal specific convergence
  "looks", "nice", "good", "great", "interesting", "think", "see",
  "like", "also", "more", "here", "could", "would", "should", "might",
]);

/** Extract meaningful keyword tokens from buddy reaction text. */
function extractTokens(content: string): string[] {
  // Strip roleplay actions like *blinks slowly*
  const cleaned = content.replace(/\*[^*]+\*/g, "");
  return cleaned
    .toLowerCase()
    .replace(/[^a-z0-9/]+/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word) && !CODE_STOP_WORDS.has(word));
}

/**
 * Analyze buddy reactions and return topics that multiple buddies
 * independently flagged. Only considers entries where source === "buddy".
 */
export function analyzeBuddyConvergence(
  reactions: TranscriptEntry[],
): ConvergenceResult {
  const buddyReactions = reactions.filter(
    (entry) => entry.source === "buddy" && entry.buddyName,
  );

  const buddyNames = new Set(buddyReactions.map((r) => r.buddyName!));

  // Build a map: token → Set of buddy names that used it, plus evidence
  const tokenBuddies = new Map<string, Map<string, string>>();

  for (const reaction of buddyReactions) {
    const tokens = extractTokens(reaction.content);
    const seen = new Set<string>(); // dedupe tokens within one reaction
    for (const token of tokens) {
      if (seen.has(token)) continue;
      seen.add(token);

      if (!tokenBuddies.has(token)) {
        tokenBuddies.set(token, new Map());
      }
      const buddyMap = tokenBuddies.get(token)!;
      // Keep first mention per buddy as evidence
      if (!buddyMap.has(reaction.buddyName!)) {
        buddyMap.set(reaction.buddyName!, reaction.content);
      }
    }
  }

  // Collect tokens mentioned by 2+ distinct buddies
  const converged: TopicMatch[] = [];
  for (const [topic, buddyMap] of tokenBuddies) {
    if (buddyMap.size >= 2) {
      converged.push({
        topic,
        buddies: [...buddyMap.keys()].sort(),
        evidence: Object.fromEntries(buddyMap),
      });
    }
  }

  // Sort by most buddies first, then alphabetically
  converged.sort(
    (a, b) => b.buddies.length - a.buddies.length || a.topic.localeCompare(b.topic),
  );

  return {
    converged,
    totalReactions: buddyReactions.length,
    buddyCount: buddyNames.size,
  };
}
