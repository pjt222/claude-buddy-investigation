import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { parseReactionTimeline } from "../server/reaction-timeline.ts";
import type { TranscriptEntry } from "../shared/protocol.ts";

const TEST_DIR = join(import.meta.dirname, ".tmp-timeline-test");

function writeJsonl(filename: string, entries: TranscriptEntry[]): string {
  mkdirSync(TEST_DIR, { recursive: true });
  const filePath = join(TEST_DIR, filename);
  writeFileSync(filePath, entries.map((e) => JSON.stringify(e)).join("\n") + "\n");
  return filePath;
}

function buddy(
  name: string,
  content: string,
  timestamp: number,
  trigger = "turn",
): TranscriptEntry {
  return {
    id: crypto.randomUUID(),
    timestamp,
    source: "buddy",
    buddyName: name,
    buddyTier: name === "Shingle" ? "bubble" : "bootstrapped",
    channel: "api",
    content,
    trigger,
  };
}

describe("parseReactionTimeline", () => {
  // Clean up temp files after all tests
  after(() => {
    try { rmSync(TEST_DIR, { recursive: true, force: true }); } catch {}
  });

  it("groups reactions within 5 seconds into one cluster", () => {
    const t0 = 1000000;
    const entries: TranscriptEntry[] = [
      { id: "u1", timestamp: t0, source: "user", content: "fix the bug" },
      buddy("Shingle", "Bug lives in the parser.", t0 + 1000),
      buddy("Ponder", "Parser bug, decomposing.", t0 + 2500),
      buddy("Fizz", "Parser edge case bites.", t0 + 4000),
      { id: "c1", timestamp: t0 + 5000, source: "claude", content: "Fixed." },
    ];

    const filePath = writeJsonl("cluster-single.jsonl", entries);
    const timeline = parseReactionTimeline(filePath);

    assert.equal(timeline.totalReactions, 3);
    assert.equal(timeline.totalClusters, 1);
    assert.equal(timeline.clusters[0].buddies.length, 3);
    assert.deepEqual(timeline.clusters[0].buddies, ["Fizz", "Ponder", "Shingle"]);
    assert.deepEqual(timeline.clusters[0].triggers, ["turn"]);
  });

  it("splits reactions into separate clusters when gap > 5 seconds", () => {
    const t0 = 1000000;
    const entries: TranscriptEntry[] = [
      buddy("Shingle", "First wave observation.", t0),
      buddy("Ponder", "First wave thinking.", t0 + 2000),
      // 10-second gap
      buddy("Shingle", "Second wave observation.", t0 + 15000),
      buddy("Fizz", "Second wave fizzing.", t0 + 17000),
    ];

    const filePath = writeJsonl("cluster-split.jsonl", entries);
    const timeline = parseReactionTimeline(filePath);

    assert.equal(timeline.totalClusters, 2);
    assert.equal(timeline.clusters[0].reactionCount, 2);
    assert.equal(timeline.clusters[1].reactionCount, 2);
    assert.deepEqual(timeline.clusters[0].buddies, ["Ponder", "Shingle"]);
    assert.deepEqual(timeline.clusters[1].buddies, ["Fizz", "Shingle"]);
  });

  it("detects convergence when 2+ buddies share a topic", () => {
    const t0 = 1000000;
    const entries: TranscriptEntry[] = [
      buddy("Shingle", "Cooldown state is being ignored.", t0),
      buddy("Ponder", "Queue skips cooldown check.", t0 + 1500),
      buddy("Flicker", "Cooldown gate never fires.", t0 + 3000),
    ];

    const filePath = writeJsonl("convergence.jsonl", entries);
    const timeline = parseReactionTimeline(filePath);

    assert.equal(timeline.totalClusters, 1);
    assert.equal(timeline.clusters[0].convergence, true);
    assert.ok(timeline.clusters[0].convergedTopics.includes("cooldown"));
  });

  it("reports no convergence for unrelated reactions", () => {
    const t0 = 1000000;
    const entries: TranscriptEntry[] = [
      buddy("Shingle", "ANSI codes hiding in output.", t0),
      buddy("Ponder", "Boundary conditions in the parser.", t0 + 1000),
    ];

    const filePath = writeJsonl("no-convergence.jsonl", entries);
    const timeline = parseReactionTimeline(filePath);

    assert.equal(timeline.clusters[0].convergence, false);
    assert.equal(timeline.clusters[0].convergedTopics.length, 0);
  });

  it("handles empty transcript gracefully", () => {
    const filePath = writeJsonl("empty.jsonl", []);
    const timeline = parseReactionTimeline(filePath);

    assert.equal(timeline.totalReactions, 0);
    assert.equal(timeline.totalClusters, 0);
    assert.deepEqual(timeline.clusters, []);
  });

  it("preserves trigger types across mixed triggers in a cluster", () => {
    const t0 = 1000000;
    const entries: TranscriptEntry[] = [
      buddy("Shingle", "Error in the build.", t0, "error"),
      buddy("Ponder", "Large diff detected.", t0 + 2000, "large-diff"),
      buddy("Fizz", "Turn reaction.", t0 + 4000, "turn"),
    ];

    const filePath = writeJsonl("mixed-triggers.jsonl", entries);
    const timeline = parseReactionTimeline(filePath);

    assert.equal(timeline.totalClusters, 1);
    const triggerSet = new Set(timeline.clusters[0].triggers);
    assert.ok(triggerSet.has("error"));
    assert.ok(triggerSet.has("large-diff"));
    assert.ok(triggerSet.has("turn"));
  });

  it("lists all buddies seen across the full timeline", () => {
    const t0 = 1000000;
    const entries: TranscriptEntry[] = [
      buddy("Shingle", "Wave one.", t0),
      buddy("Ponder", "Wave one.", t0 + 1000),
      buddy("Fizz", "Wave two.", t0 + 20000),
      buddy("Coral", "Wave two.", t0 + 21000),
    ];

    const filePath = writeJsonl("all-buddies.jsonl", entries);
    const timeline = parseReactionTimeline(filePath);

    assert.deepEqual(timeline.allBuddies, ["Coral", "Fizz", "Ponder", "Shingle"]);
  });
});
