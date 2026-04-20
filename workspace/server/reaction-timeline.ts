// reaction-timeline.ts — Parse JSONL transcripts into buddy reaction clusters

import { readFileSync } from "node:fs";
import type { TranscriptEntry } from "../shared/protocol.ts";
import { analyzeBuddyConvergence } from "./convergence.ts";

const CLUSTER_WINDOW_MS = 5000;

export interface ReactionCluster {
  /** Timestamp of the first reaction in the cluster */
  startTime: number;
  /** Timestamp of the last reaction in the cluster */
  endTime: number;
  /** Trigger type(s) that fired in this cluster */
  triggers: string[];
  /** Buddy names that reacted in this cluster */
  buddies: string[];
  /** Number of reactions in the cluster */
  reactionCount: number;
  /** Whether 2+ buddies converged on the same topic */
  convergence: boolean;
  /** Converged topics, if any */
  convergedTopics: string[];
  /** The raw reactions in this cluster */
  reactions: TranscriptEntry[];
}

export interface ReactionTimeline {
  clusters: ReactionCluster[];
  totalReactions: number;
  totalClusters: number;
  /** Buddies seen across the entire timeline */
  allBuddies: string[];
}

/** Parse a JSONL file into TranscriptEntry[], skipping malformed lines. */
function parseJsonl(filePath: string): TranscriptEntry[] {
  const raw = readFileSync(filePath, "utf-8");
  const entries: TranscriptEntry[] = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      entries.push(JSON.parse(line) as TranscriptEntry);
    } catch { /* skip malformed lines */ }
  }
  return entries;
}

/**
 * Parse a JSONL transcript file and return a timeline of buddy reaction
 * clusters — groups of reactions that fired within 5 seconds of each other.
 */
export function parseReactionTimeline(filePath: string): ReactionTimeline {
  const allEntries = parseJsonl(filePath);
  const buddyReactions = allEntries
    .filter((entry) => entry.source === "buddy" && entry.buddyName)
    .sort((a, b) => a.timestamp - b.timestamp);

  if (buddyReactions.length === 0) {
    return { clusters: [], totalReactions: 0, totalClusters: 0, allBuddies: [] };
  }

  // Group reactions into clusters using 5-second sliding window
  const clusters: ReactionCluster[] = [];
  let currentGroup: TranscriptEntry[] = [buddyReactions[0]];

  for (let i = 1; i < buddyReactions.length; i++) {
    const reaction = buddyReactions[i];
    const lastInGroup = currentGroup[currentGroup.length - 1];

    if (reaction.timestamp - lastInGroup.timestamp <= CLUSTER_WINDOW_MS) {
      currentGroup.push(reaction);
    } else {
      clusters.push(buildCluster(currentGroup));
      currentGroup = [reaction];
    }
  }
  clusters.push(buildCluster(currentGroup));

  const allBuddies = [...new Set(buddyReactions.map((r) => r.buddyName!))].sort();

  return {
    clusters,
    totalReactions: buddyReactions.length,
    totalClusters: clusters.length,
    allBuddies,
  };
}

/** Build a ReactionCluster from a group of temporally adjacent reactions. */
function buildCluster(reactions: TranscriptEntry[]): ReactionCluster {
  const triggers = [...new Set(reactions.map((r) => r.trigger).filter(Boolean))] as string[];
  const buddies = [...new Set(reactions.map((r) => r.buddyName!))].sort();

  // Check convergence using the existing analyzer
  const convergenceResult = analyzeBuddyConvergence(reactions);
  const hasConvergence = convergenceResult.converged.length > 0;
  const convergedTopics = convergenceResult.converged.map((t) => t.topic);

  return {
    startTime: reactions[0].timestamp,
    endTime: reactions[reactions.length - 1].timestamp,
    triggers,
    buddies,
    reactionCount: reactions.length,
    convergence: hasConvergence,
    convergedTopics,
    reactions,
  };
}
