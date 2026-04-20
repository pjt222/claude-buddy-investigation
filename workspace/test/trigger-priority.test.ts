import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  classifyContent,
  TriggerQueue,
  COOLDOWN_BY_PRIORITY,
  type TriggerPriority,
} from "../server/trigger-priority.ts";

describe("classifyContent", () => {
  it("classifies error patterns as error priority", () => {
    assert.equal(classifyContent("error: module not found"), "error");
    assert.equal(classifyContent("Uncaught Exception in handler"), "error");
    assert.equal(classifyContent("Traceback (most recent call last):"), "error");
    assert.equal(classifyContent("Build failed with exit code 1"), "error");
  });

  it("classifies long content as large-diff", () => {
    const longContent = "added line\n".repeat(200); // ~2200 chars
    assert.equal(classifyContent(longContent), "large-diff");
  });

  it("classifies normal content as turn", () => {
    assert.equal(classifyContent("Here is the refactored function."), "turn");
    assert.equal(classifyContent("Let me check that file."), "turn");
  });

  it("prioritizes error over large-diff when both match", () => {
    const longError = "error: " + "x".repeat(2000);
    assert.equal(classifyContent(longError), "error");
  });
});

describe("COOLDOWN_BY_PRIORITY", () => {
  it("error cooldown is shorter than turn cooldown", () => {
    assert.ok(COOLDOWN_BY_PRIORITY.error < COOLDOWN_BY_PRIORITY.turn);
  });

  it("large-diff cooldown is between error and turn", () => {
    assert.ok(COOLDOWN_BY_PRIORITY["large-diff"] > COOLDOWN_BY_PRIORITY.error);
    assert.ok(COOLDOWN_BY_PRIORITY["large-diff"] < COOLDOWN_BY_PRIORITY.turn);
  });
});

describe("TriggerQueue", () => {
  let queue: TriggerQueue;

  beforeEach(() => {
    queue = new TriggerQueue();
  });

  it("starts empty", () => {
    assert.equal(queue.pending, null);
    assert.equal(queue.isScheduled, false);
  });

  it("keeps highest priority when multiple triggers enqueued", () => {
    const now = Date.now();
    queue.enqueue("turn", now);
    assert.equal(queue.pending!.priority, "turn");

    queue.enqueue("large-diff", now + 1);
    assert.equal(queue.pending!.priority, "large-diff");

    queue.enqueue("error", now + 2);
    assert.equal(queue.pending!.priority, "error");

    // Lower priority doesn't overwrite
    queue.enqueue("turn", now + 3);
    assert.equal(queue.pending!.priority, "error");
  });

  it("replays pending trigger after delay", async () => {
    queue.enqueue("error", Date.now());

    const replayed = await new Promise<TriggerPriority>((resolve) => {
      queue.scheduleReplay(50, (trigger) => resolve(trigger.priority));
    });

    assert.equal(replayed, "error");
    assert.equal(queue.pending, null);
    assert.equal(queue.isScheduled, false);
  });

  it("does not replay if cleared before timer fires", async () => {
    queue.enqueue("error", Date.now());

    let replayed = false;
    queue.scheduleReplay(50, () => { replayed = true; });
    queue.clear();

    // Wait longer than the timer would have fired
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(replayed, false);
    assert.equal(queue.pending, null);
  });

  it("ignores second scheduleReplay when same or later delay", async () => {
    queue.enqueue("turn", Date.now());

    let callCount = 0;
    queue.scheduleReplay(50, () => { callCount++; });
    queue.scheduleReplay(80, () => { callCount++; }); // later — should be ignored

    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.equal(callCount, 1);
  });

  it("replaces timer when shorter delay is needed (Bug 2 fix)", async () => {
    // Simulate: turn queued with long delay, then error needs shorter delay
    queue.enqueue("turn", Date.now());
    queue.scheduleReplay(200, () => {}); // long timer

    // Error arrives — shorter delay needed
    queue.enqueue("error", Date.now());

    const startTime = Date.now();
    const replayed = await new Promise<TriggerPriority>((resolve) => {
      queue.scheduleReplay(30, (trigger) => resolve(trigger.priority));
    });
    const elapsed = Date.now() - startTime;

    assert.equal(replayed, "error", "should replay the higher-priority error");
    assert.ok(elapsed < 100, `should fire in ~30ms, not 200ms (took ${elapsed}ms)`);
  });
});
