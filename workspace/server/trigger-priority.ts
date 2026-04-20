// trigger-priority.ts — Adaptive cooldown and trigger queueing
//
// Moves content classification upstream of the cooldown gate so high-priority
// triggers (errors, large diffs) aren't silently dropped during rapid output.

export type TriggerPriority = "error" | "large-diff" | "turn";

/** Cooldown per priority tier (ms). Lower = more responsive. */
export const COOLDOWN_BY_PRIORITY: Record<TriggerPriority, number> = {
  error: 3000,
  "large-diff": 4000,
  turn: 10000,
};

/** Numeric rank — higher means more important. */
const PRIORITY_RANK: Record<TriggerPriority, number> = {
  turn: 0,
  "large-diff": 1,
  error: 2,
};

const ERROR_PATTERN = /\berror:|\bexception\b|\btraceback\b|\bfailed\b/i;
const LARGE_DIFF_THRESHOLD = 1500;

/** Classify content into a trigger priority before the cooldown check. */
export function classifyContent(content: string): TriggerPriority {
  if (ERROR_PATTERN.test(content)) return "error";
  if (content.length > LARGE_DIFF_THRESHOLD) return "large-diff";
  return "turn";
}

export interface PendingTrigger {
  priority: TriggerPriority;
  timestamp: number;
}

/**
 * Manages a single-slot queue for suppressed triggers.
 * When a trigger is suppressed by cooldown, the highest-priority one is kept
 * and replayed once the cooldown expires.
 */
export class TriggerQueue {
  pending: PendingTrigger | null = null;
  private replayTimer: ReturnType<typeof setTimeout> | null = null;
  private scheduledFireTime = 0;

  /** Try to enqueue a suppressed trigger. Keeps highest priority only. */
  enqueue(priority: TriggerPriority, timestamp: number): void {
    if (
      !this.pending ||
      PRIORITY_RANK[priority] > PRIORITY_RANK[this.pending.priority]
    ) {
      this.pending = { priority, timestamp };
    }
  }

  /**
   * Schedule a replay callback after `delayMs`. Replaces the existing timer
   * if the new delay fires sooner — so higher-priority triggers don't wait
   * behind a lower-priority timer's longer schedule.
   */
  scheduleReplay(delayMs: number, callback: (trigger: PendingTrigger) => void): void {
    const fireAt = Date.now() + delayMs;
    if (this.replayTimer && fireAt >= this.scheduledFireTime) return;

    // New timer fires sooner — cancel the old one
    if (this.replayTimer) clearTimeout(this.replayTimer);

    this.scheduledFireTime = fireAt;
    this.replayTimer = setTimeout(() => {
      this.replayTimer = null;
      this.scheduledFireTime = 0;
      if (this.pending) {
        const trigger = this.pending;
        this.pending = null;
        callback(trigger);
      }
    }, delayMs);
  }

  /** Clear pending state and cancel any scheduled replay. */
  clear(): void {
    this.pending = null;
    if (this.replayTimer) {
      clearTimeout(this.replayTimer);
      this.replayTimer = null;
    }
    this.scheduledFireTime = 0;
  }

  /** Whether a replay is currently scheduled. */
  get isScheduled(): boolean {
    return this.replayTimer !== null;
  }
}
