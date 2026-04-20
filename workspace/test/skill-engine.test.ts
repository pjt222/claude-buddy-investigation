import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import {
  recordError,
  resetSession,
  evaluateSkills,
} from "../server/skill-engine.ts";
import type { ActiveBuddy } from "../server/session-manager.ts";

const DEFAULT_STATS = { DEBUGGING: 50, PATIENCE: 50, CHAOS: 50, WISDOM: 50, SNARK: 50 };
const FIXED_NOW = 1_700_000_000_000;

function makeBuddy(name: string, skills: string[]): ActiveBuddy {
  return {
    identity: {
      name,
      personality: `${name} personality`,
      species: "test",
      rarity: "common",
      stats: DEFAULT_STATS,
    },
    tier: "bootstrapped",
    slot: "secondary",
    skills,
    cooldownMs: 45000,
    delayMs: 0,
  };
}

describe("skill-engine", () => {
  // IMPORTANT: sessionActive starts false at module load. This test must run BEFORE
  // any other test calls resetSession() — once flipped to true, there's no public
  // API to flip it back. Keep this test first in source order.
  it("evaluateSkills returns no meditate when sessionActive === false (fresh module state)", () => {
    // Mock time ~10 min AFTER real "now" so that Date.now() - sessionStartTime > 5 min
    // (sessionStartTime was captured at module load using real wall-clock time).
    // This isolates the !sessionActive guard from the duration guard.
    mock.timers.enable({ apis: ["Date"], now: Date.now() + 10 * 60 * 1000 });
    try {
      const buddy = makeBuddy("Zen", ["meditate"]);
      const decisions = evaluateSkills([buddy], "turn");
      assert.equal(decisions.length, 0, "meditate must not fire when sessionActive is false");
    } finally {
      mock.timers.reset();
    }
  });

  describe("with active session", () => {
    beforeEach(() => {
      mock.timers.enable({ apis: ["Date"], now: FIXED_NOW });
      resetSession();
    });

    afterEach(() => {
      mock.timers.reset();
    });

    it("recordError prunes stale entries older than 5 min (frustration resets to low)", () => {
      const buddy = makeBuddy("Breathy", ["breath"]);

      // Two errors trigger "medium" frustration => breath eligible
      recordError();
      recordError();
      let decisions = evaluateSkills([buddy], "turn");
      assert.equal(decisions.length, 1, "breath should fire at medium frustration");
      assert.equal(decisions[0].skill, "breath");

      // Advance 6 min — both error timestamps now stale; add one fresh error.
      // With only 1 entry, frustration is "low" and breath should NOT fire.
      mock.timers.tick(6 * 60 * 1000);
      resetSession(); // clear skill cooldown so we isolate the pruning behavior
      recordError();
      decisions = evaluateSkills([buddy], "turn");
      assert.equal(decisions.length, 0, "breath should not fire — stale errors pruned, frustration is low");
    });

    it("evaluateSkills returns no meditate when session duration < 5 min", () => {
      const buddy = makeBuddy("Zen", ["meditate"]);

      mock.timers.tick(4 * 60 * 1000);
      const decisions = evaluateSkills([buddy], "turn");
      assert.equal(decisions.length, 0, "meditate gated by 5-min minimum");
    });

    it("evaluateSkills fires meditate when session > 5 min AND sessionActive", () => {
      const buddy = makeBuddy("Zen", ["meditate"]);

      mock.timers.tick(6 * 60 * 1000);
      const decisions = evaluateSkills([buddy], "turn");
      assert.equal(decisions.length, 1);
      assert.equal(decisions[0].skill, "meditate");
      assert.equal(decisions[0].buddy.identity.name, "Zen");
      assert.equal(decisions[0].context.trigger, "turn");
    });

    it("priority ordering: breath (3) > dream (2) > meditate (1) when multiple buddies are eligible", () => {
      const breathBuddy = makeBuddy("Breathy", ["breath"]);
      const dreamBuddy = makeBuddy("Dreamy", ["dream"]);
      const meditateBuddy = makeBuddy("Zen", ["meditate"]);

      // Tick past 5-min meditate gate FIRST, then record errors so they're fresh.
      // (ERROR_WINDOW_MS is also 5 min, so errors recorded before the tick would be pruned.)
      mock.timers.tick(6 * 60 * 1000);
      recordError();
      recordError();

      const decisions = evaluateSkills(
        [meditateBuddy, dreamBuddy, breathBuddy],
        "turn"
      );

      assert.equal(decisions.length, 3, "all three buddies should fire one skill each");
      // Sorted by priority: breath first, then dream, then meditate
      assert.equal(decisions[0].skill, "breath");
      assert.equal(decisions[1].skill, "dream");
      assert.equal(decisions[2].skill, "meditate");
    });

    it("per-buddy skill cooldowns are independent across buddies", () => {
      const buddyA = makeBuddy("Alpha", ["meditate"]);
      const buddyB = makeBuddy("Bravo", ["meditate"]);

      mock.timers.tick(6 * 60 * 1000);

      // Fire for Alpha only — Alpha is now on cooldown, Bravo has never fired.
      const aOnly = evaluateSkills([buddyA], "turn");
      assert.equal(aOnly.length, 1, "Alpha fires meditate");
      assert.equal(aOnly[0].buddy.identity.name, "Alpha");

      // Now evaluate both — Alpha is gated, Bravo is not
      const both = evaluateSkills([buddyA, buddyB], "turn");
      assert.equal(both.length, 1, "only Bravo fires; Alpha still on cooldown");
      assert.equal(both[0].buddy.identity.name, "Bravo");
    });
  });
});
