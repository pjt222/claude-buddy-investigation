import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  loadSession,
  getActiveBuddies,
  getCurrentSession,
  getSessionInfo,
  listPresets,
  _reset,
} from "../server/session-manager.ts";

describe("session-manager", () => {
  beforeEach(() => {
    _reset();
  });

  it("loadSession('debug-squad') populates currentSession and activeBuddies", () => {
    const preset = loadSession("debug-squad");
    assert.equal(preset.session, "debug-squad");

    const current = getCurrentSession();
    assert.ok(current, "currentSession should be populated");
    assert.equal(current!.session, "debug-squad");

    const buddies = getActiveBuddies();
    assert.ok(buddies.length > 0, "activeBuddies should be non-empty");

    // debug-squad has 1 bubble + 2 bootstrapped (Coral, Fizz)
    assert.equal(buddies.length, 3, "debug-squad should load 3 buddies total");
    assert.equal(buddies[0].tier, "bubble", "first buddy is the bubble tier");
    assert.equal(buddies[1].tier, "bootstrapped");
    assert.equal(buddies[2].tier, "bootstrapped");
  });

  it("loadSession rejects path traversal via '../../etc/passwd'", () => {
    assert.throws(
      () => loadSession("../../etc/passwd"),
      /Invalid preset name/,
      "traversal must be rejected by PRESETS_DIR prefix check"
    );
  });

  it("loadSession rejects absolute paths", () => {
    assert.throws(
      () => loadSession("/etc/passwd"),
      /Invalid preset name/,
      "absolute paths must be rejected"
    );
  });

  it("loadSession handles backslash path variants on POSIX (no traversal possible, readFile fails)", () => {
    // On POSIX, backslash is a regular filename character, so the prefix check
    // passes — but no such file exists under tools/sessions, so readFileSync throws ENOENT.
    // On Windows this would need a separate assertion; keeping POSIX-only for now.
    assert.throws(
      () => loadSession("..\\..\\etc\\passwd"),
      // Either the prefix check or ENOENT will fire; accept both.
      (err: Error) => /Invalid preset name|ENOENT/.test(err.message),
      "backslash variant should not succeed in loading arbitrary files"
    );
  });

  it("loadSession throws a filesystem error for a nonexistent preset", () => {
    assert.throws(
      () => loadSession("nonexistent-preset-xyzzy"),
      /ENOENT/,
      "missing preset file should surface readFileSync's ENOENT, not crash silently"
    );
  });

  it("loadSession surfaces a JSON parse error for malformed preset files", () => {
    const fixtureDir = join(
      tmpdir(),
      `presets-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    mkdirSync(fixtureDir, { recursive: true });
    writeFileSync(join(fixtureDir, "broken.json"), "{ this is not valid json", "utf-8");

    const previous = process.env.WORKSPACE_PRESETS_DIR;
    process.env.WORKSPACE_PRESETS_DIR = fixtureDir;
    try {
      assert.throws(
        () => loadSession("broken"),
        (err: Error) => err instanceof SyntaxError || /JSON/i.test(err.message),
        "malformed JSON must surface a parse error, not crash silently"
      );
    } finally {
      if (previous === undefined) delete process.env.WORKSPACE_PRESETS_DIR;
      else process.env.WORKSPACE_PRESETS_DIR = previous;
      rmSync(fixtureDir, { recursive: true, force: true });
    }
  });

  it("getActiveBuddies reflects roster change after session switch", () => {
    loadSession("debug-squad");
    const debugBuddies = getActiveBuddies();
    const debugNames = debugBuddies.map((b) => b.identity.name).sort();

    loadSession("dream-lab");
    const dreamBuddies = getActiveBuddies();
    const dreamNames = dreamBuddies.map((b) => b.identity.name).sort();

    assert.notDeepEqual(
      debugNames,
      dreamNames,
      "roster should differ between debug-squad and dream-lab"
    );

    const current = getCurrentSession();
    assert.equal(current!.session, "dream-lab", "currentSession tracks the latest load");
  });

  it("listPresets returns the real preset names on disk", () => {
    const presets = listPresets();
    assert.ok(presets.includes("debug-squad"));
    assert.ok(presets.includes("dream-lab"));
    assert.ok(presets.includes("full-crew"));
  });

  it("getSessionInfo returns null after _reset and a populated payload after load", () => {
    assert.equal(getSessionInfo(), null, "no session active after _reset");

    loadSession("debug-squad");
    const info = getSessionInfo();
    assert.ok(info);
    assert.equal(info!.name, "debug-squad");
    assert.ok(info!.buddies.length > 0);
  });
});
