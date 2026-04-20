import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { appendFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

// The workspace-mcp server reads from a JSONL file. We test its logic by
// writing test JSONL data and invoking the MCP server via JSON-RPC over stdin.

const MCP_SERVER = join(import.meta.dirname, "..", "tools", "workspace-mcp", "server.js");

function makeTmpDir(): string {
  const dir = join(tmpdir(), `mcp-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function mcpCall(
  messages: Array<Record<string, unknown>>,
  env?: Record<string, string>
): Array<Record<string, unknown>> {
  const input = messages.map((m) => JSON.stringify(m)).join("\n") + "\n";
  const output = execFileSync("node", [MCP_SERVER], {
    input,
    encoding: "utf-8",
    timeout: 30000,
    env: { ...process.env, ...env },
  });
  return output
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function initMessages(): Array<Record<string, unknown>> {
  return [
    {
      jsonrpc: "2.0",
      id: 0,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "test", version: "1.0" },
      },
    },
    { jsonrpc: "2.0", method: "notifications/initialized" },
  ];
}

function toolCall(
  id: number,
  name: string,
  args: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    jsonrpc: "2.0",
    id,
    method: "tools/call",
    params: { name, arguments: args },
  };
}

describe("workspace-mcp server", () => {
  it("lists three tools", () => {
    const responses = mcpCall([
      ...initMessages(),
      { jsonrpc: "2.0", id: 1, method: "tools/list" },
    ]);
    const toolsList = responses.find((r: any) => r.id === 1);
    assert.ok(toolsList);
    const tools = (toolsList as any).result.tools;
    assert.equal(tools.length, 3);
    const names = tools.map((t: any) => t.name).sort();
    assert.deepEqual(names, ["get_workspace_status", "read_transcript", "search_transcript"]);
  });

  describe("read_transcript", () => {
    let tmpDir: string;
    let jsonlPath: string;

    beforeEach(() => {
      tmpDir = makeTmpDir();
      process.env.WORKSPACE_TRANSCRIPT_DIR = tmpDir;
      jsonlPath = join(tmpDir, `session-test-${Date.now()}.jsonl`);
    });

    afterEach(() => {
      rmSync(tmpDir, { recursive: true, force: true });
      delete process.env.WORKSPACE_TRANSCRIPT_DIR;
    });

    it("reads entries from JSONL file", () => {
      const entries = [
        { id: "t1", timestamp: 1712600000000, source: "user", content: "hello world" },
        { id: "t2", timestamp: 1712600001000, source: "claude", content: "hi there, user" },
        {
          id: "t3",
          timestamp: 1712600002000,
          source: "buddy",
          content: "soft hoot",
          buddyName: "Shingle",
          buddyTier: "bubble",
          trigger: "turn",
        },
      ];
      writeFileSync(jsonlPath, entries.map((e) => JSON.stringify(e)).join("\n") + "\n");

      const responses = mcpCall([
        ...initMessages(),
        toolCall(1, "read_transcript", { count: 10 }),
      ]);
      const result = responses.find((r: any) => r.id === 1);
      assert.ok(result);
      const text = (result as any).result.content[0].text;
      assert.ok(text.includes("3 transcript entries"));
      assert.ok(text.includes("hello world"));
      assert.ok(text.includes("hi there"));
      assert.ok(text.includes("Shingle"));
      assert.ok(text.includes("soft hoot"));
    });

    it("filters by source", () => {
      const entries = [
        { id: "t1", timestamp: 1712600000000, source: "user", content: "user msg" },
        { id: "t2", timestamp: 1712600001000, source: "claude", content: "claude msg" },
        {
          id: "t3",
          timestamp: 1712600002000,
          source: "buddy",
          content: "buddy msg",
          buddyName: "Ponder",
        },
      ];
      writeFileSync(jsonlPath, entries.map((e) => JSON.stringify(e)).join("\n") + "\n");

      const responses = mcpCall([
        ...initMessages(),
        toolCall(1, "read_transcript", { source: "buddy" }),
      ]);
      const text = (responses.find((r: any) => r.id === 1) as any).result.content[0].text;
      assert.ok(text.includes("1 transcript entries"));
      assert.ok(text.includes("buddy msg"));
      assert.ok(!text.includes("user msg"));
      assert.ok(!text.includes("claude msg"));
    });

    it("filters by buddyName", () => {
      const entries = [
        {
          id: "t1",
          timestamp: 1000,
          source: "buddy",
          content: "hoot",
          buddyName: "Shingle",
        },
        {
          id: "t2",
          timestamp: 2000,
          source: "buddy",
          content: "decompose",
          buddyName: "Ponder",
        },
      ];
      writeFileSync(jsonlPath, entries.map((e) => JSON.stringify(e)).join("\n") + "\n");

      const responses = mcpCall([
        ...initMessages(),
        toolCall(1, "read_transcript", { buddyName: "Ponder" }),
      ]);
      const text = (responses.find((r: any) => r.id === 1) as any).result.content[0].text;
      assert.ok(text.includes("decompose"));
      assert.ok(!text.includes("hoot"));
    });

    it("reflects appended entries after cache invalidation", () => {
      const initial = [
        { id: "c1", timestamp: 1000, source: "user", content: "first" },
        { id: "c2", timestamp: 2000, source: "user", content: "second" },
      ];
      writeFileSync(jsonlPath, initial.map((e) => JSON.stringify(e)).join("\n") + "\n");

      const first = mcpCall([
        ...initMessages(),
        toolCall(1, "read_transcript", { count: 10 }),
      ]);
      const firstText = (first.find((r: any) => r.id === 1) as any).result.content[0].text;
      assert.ok(firstText.includes("2 transcript entries"));

      appendFileSync(
        jsonlPath,
        JSON.stringify({ id: "c3", timestamp: 3000, source: "user", content: "third" }) + "\n"
      );

      const second = mcpCall([
        ...initMessages(),
        toolCall(1, "read_transcript", { count: 10 }),
      ]);
      const secondText = (second.find((r: any) => r.id === 1) as any).result.content[0].text;
      assert.ok(secondText.includes("3 transcript entries"));
      assert.ok(secondText.includes("third"));
    });

    it("respects count limit", () => {
      const entries = Array.from({ length: 20 }, (_, i) => ({
        id: `t${i}`,
        timestamp: i * 1000,
        source: "user",
        content: `message ${i}`,
      }));
      writeFileSync(jsonlPath, entries.map((e) => JSON.stringify(e)).join("\n") + "\n");

      const responses = mcpCall([
        ...initMessages(),
        toolCall(1, "read_transcript", { count: 3 }),
      ]);
      const text = (responses.find((r: any) => r.id === 1) as any).result.content[0].text;
      assert.ok(text.includes("3 transcript entries"));
      assert.ok(text.includes("message 17"));
      assert.ok(text.includes("message 18"));
      assert.ok(text.includes("message 19"));
      assert.ok(!text.includes("message 16"));
    });
  });

  describe("search_transcript", () => {
    let tmpDir: string;
    let jsonlPath: string;

    beforeEach(() => {
      tmpDir = makeTmpDir();
      process.env.WORKSPACE_TRANSCRIPT_DIR = tmpDir;
      jsonlPath = join(tmpDir, `session-test-${Date.now()}.jsonl`);
    });

    afterEach(() => {
      rmSync(tmpDir, { recursive: true, force: true });
      delete process.env.WORKSPACE_TRANSCRIPT_DIR;
    });

    it("finds entries matching query", () => {
      const entries = [
        { id: "t1", timestamp: 1000, source: "user", content: "fix the database error" },
        { id: "t2", timestamp: 2000, source: "claude", content: "the function works correctly" },
        { id: "t3", timestamp: 3000, source: "buddy", content: "error detected", buddyName: "Shingle" },
      ];
      writeFileSync(jsonlPath, entries.map((e) => JSON.stringify(e)).join("\n") + "\n");

      const responses = mcpCall([
        ...initMessages(),
        toolCall(1, "search_transcript", { query: "error" }),
      ]);
      const text = (responses.find((r: any) => r.id === 1) as any).result.content[0].text;
      assert.ok(text.includes("2 entries matching"));
      assert.ok(text.includes("database error"));
      assert.ok(text.includes("error detected"));
      assert.ok(!text.includes("works correctly"));
    });

    it("is case insensitive", () => {
      writeFileSync(
        jsonlPath,
        JSON.stringify({ id: "t1", timestamp: 1000, source: "user", content: "Hello World" }) + "\n"
      );

      const responses = mcpCall([
        ...initMessages(),
        toolCall(1, "search_transcript", { query: "hello" }),
      ]);
      const text = (responses.find((r: any) => r.id === 1) as any).result.content[0].text;
      assert.ok(text.includes("Hello World"));
    });

    it("returns no-match message when nothing found", () => {
      writeFileSync(
        jsonlPath,
        JSON.stringify({ id: "t1", timestamp: 1000, source: "user", content: "something" }) + "\n"
      );

      const responses = mcpCall([
        ...initMessages(),
        toolCall(1, "search_transcript", { query: "nonexistent" }),
      ]);
      const text = (responses.find((r: any) => r.id === 1) as any).result.content[0].text;
      assert.ok(text.includes("No transcript entries matching"));
    });

    it("requires query parameter", () => {
      const responses = mcpCall([
        ...initMessages(),
        toolCall(1, "search_transcript", {}),
      ]);
      const result = responses.find((r: any) => r.id === 1) as any;
      assert.ok(result.result.isError);
    });
  });
});
