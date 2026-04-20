import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, rmSync, readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Transcript } from "../server/transcript.ts";

function makeTmpDir(): string {
  const dir = join(tmpdir(), `transcript-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function findSessionFile(dir: string): string | null {
  const files = readdirSync(dir).filter((f) => f.startsWith("session-") && f.endsWith(".jsonl")).sort();
  return files.length > 0 ? join(dir, files[files.length - 1]) : null;
}

describe("Transcript ring buffer", () => {
  it("adds and retrieves entries", () => {
    const t = new Transcript();
    t.add("user", "hello");
    t.add("claude", "hi there");
    const entries = t.getRecent();
    assert.equal(entries.length, 2);
    assert.equal(entries[0].source, "user");
    assert.equal(entries[0].content, "hello");
    assert.equal(entries[1].source, "claude");
  });

  it("respects getRecent count", () => {
    const t = new Transcript();
    for (let i = 0; i < 10; i++) t.add("user", `msg ${i}`);
    assert.equal(t.getRecent(3).length, 3);
    assert.equal(t.getRecent(3)[0].content, "msg 7");
  });

  it("caps at MAX_ENTRIES", () => {
    const t = new Transcript();
    for (let i = 0; i < 600; i++) t.add("user", `msg ${i}`);
    assert.equal(t.getAll().length, 500);
    assert.equal(t.getAll()[0].content, "msg 100");
  });

  it("includes metadata in buddy entries", () => {
    const t = new Transcript();
    const entry = t.add("buddy", "soft hoot", {
      buddyName: "Shingle",
      buddyTier: "bubble",
      trigger: "turn",
      skill: "meditate",
    });
    assert.equal(entry.buddyName, "Shingle");
    assert.equal(entry.buddyTier, "bubble");
    assert.equal(entry.trigger, "turn");
    assert.equal(entry.skill, "meditate");
  });

  it("generates unique ids", () => {
    const t = new Transcript();
    const e1 = t.add("user", "a");
    const e2 = t.add("user", "b");
    assert.notEqual(e1.id, e2.id);
  });

  it("clears all entries", () => {
    const t = new Transcript();
    t.add("user", "msg");
    t.clear();
    assert.equal(t.getAll().length, 0);
  });
});

describe("Transcript JSONL persistence", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates directory and timestamped JSONL file on init", () => {
    const t = new Transcript();
    const persistDir = join(tmpDir, "sub");
    t.initPersistence(persistDir);
    t.add("user", "test message");
    const file = findSessionFile(persistDir);
    assert.ok(file, "session file should exist");
    assert.ok(file!.includes("session-"), "filename should be timestamped");
  });

  it("persists entries as JSONL", () => {
    const t = new Transcript();
    t.initPersistence(tmpDir);
    t.add("user", "hello");
    t.add("claude", "world");

    const file = findSessionFile(tmpDir);
    assert.ok(file);
    const lines = readFileSync(file!, "utf-8").trim().split("\n");
    assert.equal(lines.length, 2);

    const entry1 = JSON.parse(lines[0]);
    assert.equal(entry1.source, "user");
    assert.equal(entry1.content, "hello");

    const entry2 = JSON.parse(lines[1]);
    assert.equal(entry2.source, "claude");
    assert.equal(entry2.content, "world");
  });

  it("persists buddy metadata", () => {
    const t = new Transcript();
    t.initPersistence(tmpDir);
    t.add("buddy", "hoot", { buddyName: "Shingle", buddyTier: "bubble", trigger: "turn" });

    const file = findSessionFile(tmpDir);
    assert.ok(file);
    const line = readFileSync(file!, "utf-8").trim();
    const entry = JSON.parse(line);
    assert.equal(entry.buddyName, "Shingle");
    assert.equal(entry.buddyTier, "bubble");
    assert.equal(entry.trigger, "turn");
  });

  it("creates a new file per session", () => {
    // Simulate a prior session file
    writeFileSync(join(tmpDir, "session-2026-04-08_10-00-00.jsonl"), '{"source":"user","content":"old"}\n');

    const t = new Transcript();
    t.initPersistence(tmpDir);
    t.add("user", "new session");

    const files = readdirSync(tmpDir).filter((f) => f.startsWith("session-")).sort();
    assert.equal(files.length, 2, "should have old + new session files");
    assert.ok(files[0].includes("2026-04-08"), "old file preserved");

    // New file should have the new entry
    const newFile = join(tmpDir, files[1]);
    const content = readFileSync(newFile, "utf-8").trim();
    assert.ok(content.includes("new session"));
  });

  it("loads entries from most recent prior session on loadFromDisk", () => {
    // Create a prior session file
    const entries = [
      '{"id":"1","timestamp":1000,"source":"user","content":"msg one"}',
      '{"id":"2","timestamp":2000,"source":"claude","content":"msg two"}',
      '{"id":"3","timestamp":3000,"source":"buddy","content":"hoot","buddyName":"Shingle"}',
    ];
    writeFileSync(join(tmpDir, "session-2026-04-08_09-00-00.jsonl"), entries.join("\n") + "\n");

    const t = new Transcript();
    t.initPersistence(tmpDir);
    t.loadFromDisk();

    const loaded = t.getAll();
    assert.equal(loaded.length, 3);
    assert.equal(loaded[0].content, "msg one");
    assert.equal(loaded[2].buddyName, "Shingle");
  });

  it("handles malformed JSONL lines gracefully", () => {
    writeFileSync(
      join(tmpDir, "session-2026-04-08_08-00-00.jsonl"),
      '{"id":"1","timestamp":1000,"source":"user","content":"good"}\nBAD JSON LINE\n{"id":"2","timestamp":2000,"source":"claude","content":"also good"}\n'
    );

    const t = new Transcript();
    t.initPersistence(tmpDir);
    t.loadFromDisk();

    const loaded = t.getAll();
    assert.equal(loaded.length, 2);
    assert.equal(loaded[0].content, "good");
    assert.equal(loaded[1].content, "also good");
  });

  it("works without persistence (no initPersistence call)", () => {
    const t = new Transcript();
    t.add("user", "no persistence");
    assert.equal(t.getRecent(1)[0].content, "no persistence");
  });
});
