import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { analyzeBuddyConvergence } from "../server/convergence.ts";
import type { TranscriptEntry } from "../shared/protocol.ts";

function buddy(name: string, content: string, trigger = "turn"): TranscriptEntry {
  return {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    source: "buddy",
    buddyName: name,
    buddyTier: name === "Shingle" ? "bubble" : "bootstrapped",
    channel: "api",
    content,
    trigger,
  };
}

describe("analyzeBuddyConvergence", () => {
  it("detects shared topics across two buddies", () => {
    const reactions = [
      buddy("Shingle", "Module-level /g flag persists state between calls."),
      buddy("Fizz", "Module /g flag persists state between calls, yeah?"),
      buddy("Clank", "Global /g flag persists state between calls, friend."),
    ];

    const result = analyzeBuddyConvergence(reactions);

    assert.equal(result.totalReactions, 3);
    assert.equal(result.buddyCount, 3);

    const flagTopic = result.converged.find((t) => t.topic === "flag");
    assert.ok(flagTopic, "expected 'flag' to appear as a converged topic");
    assert.equal(flagTopic.buddies.length, 3);
    assert.deepEqual(flagTopic.buddies, ["Clank", "Fizz", "Shingle"]);

    const persistsTopic = result.converged.find((t) => t.topic === "persists");
    assert.ok(persistsTopic, "expected 'persists' to appear as a converged topic");
  });

  it("ignores non-buddy entries and single-buddy topics", () => {
    const reactions: TranscriptEntry[] = [
      {
        id: "u1",
        timestamp: 1000,
        source: "user",
        content: "regex problem in the filter",
      },
      {
        id: "c1",
        timestamp: 1001,
        source: "claude",
        content: "The regex is too broad",
      },
      buddy("Shingle", "ANSI codes hide in places you haven't tested yet."),
      buddy("Fizz", "Boundary conditions always bite hardest."),
    ];

    const result = analyzeBuddyConvergence(reactions);

    assert.equal(result.totalReactions, 2, "should only count buddy entries");
    assert.equal(result.buddyCount, 2);
    // "ANSI" is unique to Shingle, "boundary" unique to Fizz — no convergence
    const ansiTopic = result.converged.find((t) => t.topic === "ansi");
    assert.equal(ansiTopic, undefined, "single-buddy topic should not converge");
  });

  it("returns empty convergence for a single buddy", () => {
    const reactions = [
      buddy("Shingle", "Regex eating vertical codes."),
      buddy("Shingle", "Module boundary regex splitting."),
    ];

    const result = analyzeBuddyConvergence(reactions);

    assert.equal(result.totalReactions, 2);
    assert.equal(result.buddyCount, 1);
    assert.equal(result.converged.length, 0, "one buddy cannot converge with itself");
  });
});
