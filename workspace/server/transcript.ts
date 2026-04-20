// transcript.ts — Shared transcript ring buffer with JSONL persistence

import { randomUUID } from "node:crypto";
import {
  mkdirSync,
  appendFileSync,
  readFileSync,
  readdirSync,
  existsSync,
} from "node:fs";
import { join } from "node:path";
import type { TranscriptEntry } from "../shared/protocol.ts";

const MAX_ENTRIES = 500;

function sessionTimestamp(): string {
  const d = new Date();
  return d.toISOString().replace(/[:.]/g, "-").replace("T", "_").slice(0, 19);
}

export class Transcript {
  private entries: TranscriptEntry[] = [];
  private jsonlPath: string | null = null;
  private persistDir: string | null = null;

  /** Initialize JSONL persistence. Creates a timestamped file per session. */
  initPersistence(dir: string): void {
    mkdirSync(dir, { recursive: true });
    this.persistDir = dir;
    this.jsonlPath = join(dir, `session-${sessionTimestamp()}.jsonl`);
    console.log(`  Transcript: ${this.jsonlPath}`);
  }

  /** Load recent entries from the most recent prior session file. */
  loadFromDisk(count = MAX_ENTRIES): void {
    if (!this.persistDir) return;

    try {
      const files = readdirSync(this.persistDir)
        .filter((f) => f.startsWith("session-") && f.endsWith(".jsonl") && join(this.persistDir!, f) !== this.jsonlPath)
        .sort()
        .reverse();

      if (files.length === 0) return;

      const source = join(this.persistDir, files[0]);
      const lines = readFileSync(source, "utf-8").trim().split("\n").filter(Boolean);
      const tail = lines.slice(-count);
      for (const line of tail) {
        try {
          this.entries.push(JSON.parse(line) as TranscriptEntry);
        } catch { /* skip malformed lines */ }
      }
      console.log(`  Loaded ${this.entries.length} entries from ${files[0]}`);
    } catch { /* file read failed, start empty */ }
  }

  private persist(entry: TranscriptEntry): void {
    if (!this.jsonlPath) return;
    try {
      appendFileSync(this.jsonlPath, JSON.stringify(entry) + "\n");
    } catch { /* non-fatal — in-memory buffer still works */ }
  }

  add(
    source: TranscriptEntry["source"],
    content: string,
    meta?: Partial<Pick<TranscriptEntry, "buddyName" | "buddyTier" | "channel" | "trigger" | "skill">>
  ): TranscriptEntry {
    const entry: TranscriptEntry = {
      id: randomUUID(),
      timestamp: Date.now(),
      source,
      content,
      ...meta,
    };

    this.entries.push(entry);
    if (this.entries.length > MAX_ENTRIES) {
      this.entries.shift();
    }

    this.persist(entry);
    return entry;
  }

  getRecent(count = 50): TranscriptEntry[] {
    return this.entries.slice(-count);
  }

  getAll(): TranscriptEntry[] {
    return [...this.entries];
  }

  clear(): void {
    this.entries = [];
  }

  /** Start a fresh JSONL file. Clears in-memory buffer and opens a new timestamped file. */
  rotate(): string | null {
    this.entries = [];
    if (!this.persistDir) return null;
    this.jsonlPath = join(this.persistDir, `session-${sessionTimestamp()}.jsonl`);
    console.log(`  Transcript rotated: ${this.jsonlPath}`);
    return this.jsonlPath;
  }
}
