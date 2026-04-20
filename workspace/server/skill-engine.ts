// skill-engine.ts — Almanac skill evaluation
// Decides which buddy fires which skill on each trigger.
// Priority: breath > dream > meditate

import type { ActiveBuddy } from "./session-manager.ts";

// Frustration tracking for breath skill
const errorTimestamps: number[] = [];
const ERROR_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
let sessionStartTime = Date.now();
let sessionActive = false; // Set true by resetSession(); prevents meditate before first session load

// Skill cooldowns (independent of buddy_react cooldowns)
const skillLastFired = new Map<string, number>();

const SKILL_PRIORITY: Record<string, number> = {
  breath: 3,
  dream: 2,
  meditate: 1,
};

const SKILL_COOLDOWNS: Record<string, number> = {
  meditate: 60000,
  dream: 120000,
  breath: 45000,
};

interface SkillDecision {
  buddy: ActiveBuddy;
  skill: string;
  context: Record<string, unknown>;
}

export function recordError(): void {
  errorTimestamps.push(Date.now());
  // Prune old entries
  const cutoff = Date.now() - ERROR_WINDOW_MS;
  while (errorTimestamps.length > 0 && errorTimestamps[0] < cutoff) {
    errorTimestamps.shift();
  }
}

export function resetSession(): void {
  sessionStartTime = Date.now();
  sessionActive = true;
  errorTimestamps.length = 0;
  skillLastFired.clear();
}

function sessionDurationMin(): number {
  return (Date.now() - sessionStartTime) / 60000;
}

function frustrationLevel(): "low" | "medium" | "high" {
  // Prune stale entries on read (not just on write via recordError)
  const cutoff = Date.now() - ERROR_WINDOW_MS;
  while (errorTimestamps.length > 0 && errorTimestamps[0] < cutoff) {
    errorTimestamps.shift();
  }
  if (errorTimestamps.length >= 4) return "high";
  if (errorTimestamps.length >= 2) return "medium";
  return "low";
}

function isSkillOnCooldown(buddyName: string, skill: string): boolean {
  const key = `${buddyName}:${skill}`;
  const lastFired = skillLastFired.get(key);
  if (!lastFired) return false;
  return Date.now() - lastFired < (SKILL_COOLDOWNS[skill] || 60000);
}

function markSkillFired(buddyName: string, skill: string): void {
  skillLastFired.set(`${buddyName}:${skill}`, Date.now());
}

function canFireMeditate(trigger: string): boolean {
  // Suppressed by error/test-fail triggers
  if (trigger === "error" || trigger === "test-fail") return false;
  // Requires an active session (prevents firing based on server uptime alone)
  if (!sessionActive) return false;
  // Minimum 5 minutes into session
  if (sessionDurationMin() < 5) return false;
  return true;
}

function canFireDream(trigger: string): boolean {
  // Only fires after milestone-like triggers
  return trigger === "large-diff" || trigger === "turn";
}

function canFireBreath(trigger: string): boolean {
  // Only fires when frustration is medium or high
  const level = frustrationLevel();
  return level !== "low";
}

export function evaluateSkills(
  buddies: ActiveBuddy[],
  trigger: string
): SkillDecision[] {
  const decisions: SkillDecision[] = [];

  // Collect all candidate (buddy, skill) pairs
  const candidates: Array<{ buddy: ActiveBuddy; skill: string; priority: number }> = [];

  for (const buddy of buddies) {
    for (const skill of buddy.skills) {
      if (isSkillOnCooldown(buddy.identity.name, skill)) continue;

      let canFire = false;
      if (skill === "meditate") canFire = canFireMeditate(trigger);
      else if (skill === "dream") canFire = canFireDream(trigger);
      else if (skill === "breath") canFire = canFireBreath(trigger);

      if (canFire) {
        candidates.push({
          buddy,
          skill,
          priority: SKILL_PRIORITY[skill] || 0,
        });
      }
    }
  }

  // Sort by priority (highest first)
  candidates.sort((a, b) => b.priority - a.priority);

  // Each buddy fires at most one skill (highest priority wins)
  const buddyFired = new Set<string>();

  for (const candidate of candidates) {
    if (buddyFired.has(candidate.buddy.identity.name)) continue;

    const context: Record<string, unknown> = {
      session_duration_min: Math.round(sessionDurationMin()),
      trigger,
    };

    if (candidate.skill === "breath") {
      context.error_count_last_5min = errorTimestamps.length;
      context.frustration_signal = frustrationLevel();
    }

    markSkillFired(candidate.buddy.identity.name, candidate.skill);
    buddyFired.add(candidate.buddy.identity.name);

    decisions.push({
      buddy: candidate.buddy,
      skill: candidate.skill,
      context,
    });
  }

  return decisions;
}
