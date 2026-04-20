import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  stripAnsi,
  extractAssistantRegion,
  blacklistFilter,
  stripForTranscript,
  extractBubbleText,
} from "../server/transcript-filter.ts";

describe("stripAnsi", () => {
  it("strips standard CSI sequences", () => {
    assert.equal(stripAnsi("\x1b[32mhello\x1b[0m"), "hello");
  });

  it("strips DEC private modes", () => {
    assert.equal(stripAnsi("\x1b[?25l\x1b[?25h"), "");
  });

  it("strips Kitty keyboard protocol", () => {
    assert.equal(stripAnsi("\x1b[>1u\x1b[>4;2m"), "");
  });

  it("strips OSC sequences with BEL", () => {
    assert.equal(stripAnsi("\x1b]0;title\x07content"), "content");
  });

  it("strips OSC sequences with ST", () => {
    assert.equal(stripAnsi("\x1b]0;title\x1b\\content"), "content");
  });

  it("strips control characters but keeps newlines and tabs", () => {
    assert.equal(stripAnsi("hello\tworld\n\x01\x02\x03"), "hello\tworld\n");
  });

  it("strips carriage returns", () => {
    assert.equal(stripAnsi("line one\r\nline two"), "line one\nline two");
  });

  it("converts non-breaking spaces to regular spaces", () => {
    assert.equal(stripAnsi("hello\xa0world"), "hello world");
  });

  it("preserves plain text", () => {
    assert.equal(stripAnsi("Hello, world!"), "Hello, world!");
  });

  it("handles mixed ANSI and content", () => {
    const input = "\x1b[1m\x1b[32mBold Green\x1b[0m normal";
    assert.equal(stripAnsi(input), "Bold Green normal");
  });

  it("uses double space for CUP absolute positioning", () => {
    // CUP sequence ESC[5;20H should produce double space to preserve column gap
    const input = "word1\x1b[5;20Hword2";
    const result = stripAnsi(input);
    assert.ok(result.includes("word1  word2"), `Expected double space in: "${result}"`);
  });

  it("uses single space for relative cursor movement", () => {
    // CUF (cursor forward) ESC[3C should produce single space
    const input = "word1\x1b[3Cword2";
    const result = stripAnsi(input);
    assert.equal(result, "word1 word2");
  });
});

describe("extractAssistantRegion", () => {
  it("returns null without marker", () => {
    assert.equal(extractAssistantRegion("no marker here"), null);
  });

  it("returns null with marker but short region", () => {
    assert.equal(extractAssistantRegion("⎿ hi"), null);
  });

  it("extracts content after marker", () => {
    const result = extractAssistantRegion("chrome ⎿ This is a real response from Claude");
    assert.equal(result, "This is a real response from Claude");
  });

  it("filters spinner lines from region", () => {
    const input = "⎿ Good response\n✽ thinking...\n↓ 190 tokens\nMore response";
    const result = extractAssistantRegion(input);
    assert.ok(result);
    assert.ok(result.includes("Good response"));
    assert.ok(result.includes("More response"));
    assert.ok(!result.includes("thinking"));
    assert.ok(!result.includes("tokens"));
  });

  it("filters box drawing from region", () => {
    const input = "⎿ Content here\n╭──────╮\n│ bubble │\n╰──────╯";
    const result = extractAssistantRegion(input);
    assert.ok(result);
    assert.ok(result.includes("Content here"));
    assert.ok(!result.includes("╭"));
  });
});

describe("blacklistFilter", () => {
  it("removes short lines", () => {
    const result = blacklistFilter(["short", "This is a real line of content"]);
    assert.deepEqual(result, ["This is a real line of content"]);
  });

  it("removes pure box drawing lines", () => {
    const result = blacklistFilter(["╭──────────────╮", "╰──────────────╯", "─────────────────"]);
    assert.deepEqual(result, []);
  });

  it("removes box-drawing-mixed lines with dashes", () => {
    const result = blacklistFilter(["╭───────── title ─────────╮"]);
    assert.deepEqual(result, []);
  });

  it("removes spinner fragments", () => {
    const result = blacklistFilter(["Gallivanting… something", "Reticulating splines 42 tok"]);
    assert.deepEqual(result, []);
  });

  it("removes prompt line", () => {
    const result = blacklistFilter(["❯ user typed this"]);
    assert.deepEqual(result, []);
  });

  it("removes token count lines", () => {
    const result = blacklistFilter(["↓ 190 tokens", "20 thought for 3s)", "42 tokens remaining"]);
    assert.deepEqual(result, []);
  });

  it("removes thinking status", () => {
    const result = blacklistFilter(["✽ thinking with high effort", "thinking with medium effort"]);
    assert.deepEqual(result, []);
  });

  it("removes banner fragments", () => {
    const result = blacklistFilter(["▐▛▜▌ Claude Code ▝▜▘"]);
    assert.deepEqual(result, []);
  });

  it("removes lines with low alpha ratio", () => {
    const result = blacklistFilter([">>> --- === ... ??? !!!"]);
    assert.deepEqual(result, []);
  });

  it("keeps code-like lines despite low alpha ratio", () => {
    const result = blacklistFilter([
      "/[a-z]+/.test(str) && /\\d{3,}/.exec(x)",
      "const x = obj[key](arg1, arg2);",
    ]);
    assert.equal(result.length, 2, "code-like lines should survive alpha ratio filter");
  });

  it("keeps real content", () => {
    const lines = [
      "This function handles the database connection",
      "The error occurs on line 42 of the handler",
      "I recommend refactoring the authentication module",
    ];
    assert.deepEqual(blacklistFilter(lines), lines);
  });

  it("removes repeated spinner words", () => {
    const result = blacklistFilter(["Cogitating Cogitating Cogitating"]);
    assert.deepEqual(result, []);
  });

  it("removes pipe-delimited bubble content", () => {
    const result = blacklistFilter(["│you'recheckingifIstayin│", "│mybubbleandClaudestaysin│/\\/\\"]);
    assert.deepEqual(result, []);
  });

  it("removes owl sprite patterns", () => {
    const result = blacklistFilter(["(×)(×)", "( >< )", "`----´"]);
    assert.deepEqual(result, []);
  });

  it("removes async hook output", () => {
    const result = blacklistFilter([
      "AsynchookUserPromptSubmit completed",
      "Async hook Stop completed",
    ]);
    assert.deepEqual(result, []);
  });

  it("removes MCP server status lines", () => {
    const result = blacklistFilter(["1 MCP server failed· /mcp"]);
    assert.deepEqual(result, []);
  });

  it("keeps lines with real ellipsis content", () => {
    const result = blacklistFilter(["The function retries until the connection is restored… then continues."]);
    assert.equal(result.length, 1);
  });

  it("still removes short spinner lines with ellipsis", () => {
    const result = blacklistFilter(["Cogitating…", "✽ Cogitating… 42", "Determining…"]);
    assert.deepEqual(result, []);
  });

  // --- Ellipsis filter empirical validation (issue #8) ---

  it("keeps prose with ellipsis longer than 40 chars", () => {
    const cases = [
      "The function handles… several edge cases that are worth noting",
      "Looking at the error trace… it seems like the connection pool is exhausted",
      "This pattern appears in three files… and each implementation differs slightly",
      "The test suite passes locally… but fails in CI due to timezone differences",
    ];
    const result = blacklistFilter(cases);
    assert.equal(result.length, cases.length, `all ${cases.length} prose lines should be kept`);
  });

  it("keeps short prose with sentence punctuation before ellipsis", () => {
    // The guard exempts lines with sentence punctuation followed by space
    const cases = [
      "See line 42. The issue… is subtle",
      "It works! But the edge case… fails",
      "Is this correct? The value… seems off",
    ];
    const result = blacklistFilter(cases);
    assert.equal(result.length, cases.length, "lines with sentence punctuation should be kept");
  });

  it("removes all known spinner patterns with ellipsis", () => {
    const spinners = [
      "Beboppin'…",
      "Reticulating…",
      "Gallivanting…",
      "Discombobulating…",
      "Percolating…",
      "Recalibrating…",
      "✽ Thinking…",
      "⠹ Processing…",
      "Generating… 8",
    ];
    const result = blacklistFilter(spinners);
    assert.deepEqual(result, [], "all spinner lines should be removed");
  });

  it("correctly handles the 40-char boundary", () => {
    // Exactly 39 chars with ellipsis — should be filtered (spinner-like)
    const shortLine = "Something happening right now…  padding";
    assert.ok(shortLine.length < 40, `test line should be <40 chars, got ${shortLine.length}`);
    const filteredShort = blacklistFilter([shortLine]);
    assert.equal(filteredShort.length, 0, "short ellipsis line without punctuation should be filtered");

    // 41 chars with ellipsis — should be kept (prose-like)
    const longLine = "The database connection pool is failing… x";
    assert.ok(longLine.length >= 40, `test line should be >=40 chars, got ${longLine.length}`);
    const filteredLong = blacklistFilter([longLine]);
    assert.equal(filteredLong.length, 1, "long ellipsis line should be kept");
  });

  it("keeps lines with three-dot ASCII ellipsis (not Unicode)", () => {
    // The filter only matches Unicode ellipsis (…), not three dots (...)
    const cases = [
      "Loading...",
      "Processing... done",
      "The value is... unexpected",
    ];
    const result = blacklistFilter(cases);
    assert.equal(result.length, cases.length, "ASCII three-dot ellipsis should not be filtered by this guard");
  });
});

describe("stripForTranscript", () => {
  it("uses whitelist when marker present", () => {
    const input = "\x1b[32mchrome\x1b[0m ⎿ This is the actual response content";
    const result = stripForTranscript(input);
    assert.equal(result, "This is the actual response content");
  });

  it("falls back to blacklist without marker", () => {
    const input = "This is real content that should survive\n❯ prompt line\nMore real content here too";
    const result = stripForTranscript(input);
    assert.ok(result.includes("This is real content"));
    assert.ok(result.includes("More real content"));
    assert.ok(!result.includes("❯"));
  });

  it("strips ANSI before filtering", () => {
    const input = "\x1b[1m\x1b[34mThis is meaningful blue bold text\x1b[0m";
    const result = stripForTranscript(input);
    assert.equal(result, "This is meaningful blue bold text");
  });

  it("collapses excessive whitespace", () => {
    const input = "Line one\n\n\n\n\nLine two after many blanks";
    const result = stripForTranscript(input);
    assert.ok(!result.includes("\n\n\n"));
  });

  it("returns empty for pure TUI chrome", () => {
    const input = "\x1b[?25l\x1b[1;1H╭──────╮\n╰──────╯\x1b[?25h";
    const result = stripForTranscript(input);
    assert.equal(result, "");
  });
});

describe("extractBubbleText", () => {
  it("returns null without bubble markers", () => {
    assert.equal(extractBubbleText("regular text"), null);
  });

  it("extracts text from a well-formed bubble", () => {
    const bubble = "╭──────────────────╮\n│ soft hoot        │\n╰──────────────────╯";
    assert.equal(extractBubbleText(bubble), "soft hoot");
  });

  it("extracts multi-line bubble text", () => {
    const bubble = "╭─────────────────────╮\n│ line one           │\n│ line two           │\n╰─────────────────────╯";
    assert.equal(extractBubbleText(bubble), "line one line two");
  });

  it("strips ANSI from bubble before extraction", () => {
    const bubble = "\x1b[33m╭──────────────────╮\n│\x1b[1m hoot \x1b[0m│\n╰──────────────────╯\x1b[0m";
    assert.equal(extractBubbleText(bubble), "hoot");
  });

  it("returns null for bubble with only decorative content", () => {
    const bubble = "╭──────╮\n│ ──── │\n╰──────╯";
    assert.equal(extractBubbleText(bubble), null);
  });

  it("returns null for bubble with too-short text", () => {
    const bubble = "╭───╮\n│ a │\n╰───╯";
    assert.equal(extractBubbleText(bubble), null);
  });

  it("requires alphabetic content", () => {
    const bubble = "╭───────╮\n│ 12345 │\n╰───────╯";
    assert.equal(extractBubbleText(bubble), null);
  });

  it("re-spaces camelCase word joins from TUI cursor positioning", () => {
    // Simulates what happens when cursor positioning is stripped: words concatenate
    const bubble = "╭──────────────────────────────────╮\n│ Yourcode,though?That'swhatI'mworriedabout │\n╰──────────────────────────────────╯";
    const result = extractBubbleText(bubble);
    assert.ok(result);
    // respaceText handles punctuation boundaries and contractions
    assert.ok(result.includes("though? That's what"), `Expected "though? That's what" in: ${result}`);
    assert.ok(result.includes("I'm worried"), `Expected "I'm worried" in: ${result}`);
  });
});
