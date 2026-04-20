import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  MockAgent,
  setGlobalDispatcher,
  getGlobalDispatcher,
  type Dispatcher,
} from "undici";
import {
  callBuddyReact,
  _setBuddyState,
  _clearBuddyStates,
  type BuddyIdentity,
} from "../server/buddy-api.ts";
import { COOLDOWN_BY_PRIORITY } from "../server/trigger-priority.ts";

const TEST_BUDDY: BuddyIdentity = {
  name: "TestOwl",
  personality: "A test owl.",
  species: "owl",
  rarity: "common",
  stats: { DEBUGGING: 50, PATIENCE: 50, CHAOS: 50, WISDOM: 50, SNARK: 50 },
};

const BUDDY_DEFAULT_COOLDOWN = 30000; // 30s, matching bubble tier

/** Returns true if the result was blocked by cooldown. */
function isCooldownBlocked(result: { error?: string }): boolean {
  return result.error?.startsWith("Cooldown:") === true;
}

describe("callBuddyReact per-buddy cooldown", () => {
  let mockAgent: MockAgent;
  let originalDispatcher: Dispatcher;

  beforeEach(() => {
    _clearBuddyStates();

    originalDispatcher = getGlobalDispatcher();
    mockAgent = new MockAgent();
    mockAgent.disableNetConnect();
    setGlobalDispatcher(mockAgent);
    mockAgent
      .get("https://api.anthropic.com")
      .intercept({
        path: /\/api\/organizations\/[^/]+\/claude_code\/buddy_react/,
        method: "POST",
      })
      .reply(200, { reaction: "mocked test reaction" })
      .persist();
  });

  afterEach(async () => {
    await mockAgent.close();
    setGlobalDispatcher(originalDispatcher);
  });

  it("error trigger (3s) passes when elapsed > 3s but < 10s", async () => {
    _setBuddyState(TEST_BUDDY.name, BUDDY_DEFAULT_COOLDOWN, Date.now() - 5000);

    const result = await callBuddyReact(TEST_BUDDY, "test", "error", BUDDY_DEFAULT_COOLDOWN);
    assert.equal(
      isCooldownBlocked(result), false,
      `error trigger at 5s should pass 3s cooldown, got: ${result.error}`
    );
  });

  it("error trigger blocked when elapsed < 3s", async () => {
    _setBuddyState(TEST_BUDDY.name, BUDDY_DEFAULT_COOLDOWN, Date.now() - 1000);

    const result = await callBuddyReact(TEST_BUDDY, "test", "error", BUDDY_DEFAULT_COOLDOWN);
    assert.equal(
      isCooldownBlocked(result), true,
      `error trigger at 1s should be blocked by 3s cooldown`
    );
  });

  it("turn trigger (10s) blocked when elapsed < 10s", async () => {
    _setBuddyState(TEST_BUDDY.name, BUDDY_DEFAULT_COOLDOWN, Date.now() - 5000);

    const result = await callBuddyReact(TEST_BUDDY, "test", "turn", BUDDY_DEFAULT_COOLDOWN);
    assert.equal(
      isCooldownBlocked(result), true,
      `turn trigger at 5s should be blocked by 10s cooldown`
    );
  });

  it("turn trigger passes when elapsed > 10s", async () => {
    _setBuddyState(TEST_BUDDY.name, BUDDY_DEFAULT_COOLDOWN, Date.now() - 11000);

    const result = await callBuddyReact(TEST_BUDDY, "test", "turn", BUDDY_DEFAULT_COOLDOWN);
    assert.equal(
      isCooldownBlocked(result), false,
      `turn trigger at 11s should pass 10s cooldown, got: ${result.error}`
    );
  });

  it("large-diff trigger (4s) passes when elapsed > 4s", async () => {
    _setBuddyState(TEST_BUDDY.name, BUDDY_DEFAULT_COOLDOWN, Date.now() - 5000);

    const result = await callBuddyReact(TEST_BUDDY, "test", "large-diff", BUDDY_DEFAULT_COOLDOWN);
    assert.equal(
      isCooldownBlocked(result), false,
      `large-diff at 5s should pass 4s cooldown, got: ${result.error}`
    );
  });

  it("large-diff trigger blocked when elapsed < 4s", async () => {
    _setBuddyState(TEST_BUDDY.name, BUDDY_DEFAULT_COOLDOWN, Date.now() - 2000);

    const result = await callBuddyReact(TEST_BUDDY, "test", "large-diff", BUDDY_DEFAULT_COOLDOWN);
    assert.equal(
      isCooldownBlocked(result), true,
      `large-diff at 2s should be blocked by 4s cooldown`
    );
  });

  it("first call always passes cooldown (no prior state)", async () => {
    const result = await callBuddyReact(TEST_BUDDY, "test", "turn", BUDDY_DEFAULT_COOLDOWN);
    assert.equal(
      isCooldownBlocked(result), false,
      `first call should pass cooldown, got: ${result.error}`
    );
  });

  it("each priority tier uses its own cooldown threshold", () => {
    assert.ok(COOLDOWN_BY_PRIORITY.error < COOLDOWN_BY_PRIORITY["large-diff"]);
    assert.ok(COOLDOWN_BY_PRIORITY["large-diff"] < COOLDOWN_BY_PRIORITY.turn);
    assert.equal(COOLDOWN_BY_PRIORITY.error, 3000);
    assert.equal(COOLDOWN_BY_PRIORITY["large-diff"], 4000);
    assert.equal(COOLDOWN_BY_PRIORITY.turn, 10000);
  });

  it("per-buddy cooldowns are independent across buddies", async () => {
    const buddy2: BuddyIdentity = { ...TEST_BUDDY, name: "Ponder" };

    // TestOwl called 2s ago, Ponder never called
    _setBuddyState(TEST_BUDDY.name, BUDDY_DEFAULT_COOLDOWN, Date.now() - 2000);

    const result1 = await callBuddyReact(TEST_BUDDY, "test", "turn", BUDDY_DEFAULT_COOLDOWN);
    const result2 = await callBuddyReact(buddy2, "test", "turn", BUDDY_DEFAULT_COOLDOWN);

    assert.equal(isCooldownBlocked(result1), true, "TestOwl should be in cooldown");
    assert.equal(isCooldownBlocked(result2), false, "Ponder should not be in cooldown");
  });
});
