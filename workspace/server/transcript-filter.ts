// transcript-filter.ts — ANSI stripping, TUI chrome filtering, bubble extraction
// Extracted from index.ts for testability.

/** Strip ANSI escape sequences from raw PTY output.
 *  Cursor movement sequences are replaced with a space (not empty string)
 *  to preserve word boundaries that the TUI positioned with cursor moves. */
export function stripAnsi(text: string): string {
  return text
    .replace(/\x1b\[\?[0-9;]*[hlsr]/g, "")
    .replace(/\x1b\[>[0-9;]*[a-zA-Z]/g, "")
    // Absolute cursor positioning (CUP `H`/`f`, HVP) → double space to preserve column gaps
    .replace(/\x1b\[[0-9;]*[Hf]/g, "  ")
    // Relative cursor movement (CUU/CUD/CUF/CUB/CNL/CPL/CHA/VPA) → single space
    .replace(/\x1b\[[0-9;]*[ABCDEFGed]/g, " ")
    // Other CSI sequences → empty
    .replace(/\x1b\[[0-9;?]*[a-zA-Z@`]/g, "")
    .replace(/\x1b\].*?(\x07|\x1b\\)/g, "")
    .replace(/\x1b[()][0-9A-B]/g, "")
    .replace(/\x1b./g, "")
    // Orphaned CSI tails — only match if preceded by digit (not prose like ">2d" or "<br")
    .replace(/(?<=\d)>[0-9;]*[a-z]/g, "")
    .replace(/(?<=\d)<[0-9;]*[a-z]/g, "")
    .replace(/[\x00-\x08\x0b-\x0c\x0e-\x1f\x7f]/g, "")
    .replace(/\r/g, "")
    .replace(/\xa0/g, " ");
}

/**
 * Try to extract Claude's response region using the ⎿ assistant-output marker.
 * HYPOTHESIS: ⎿ delimits assistant output in Claude Code's Ink TUI.
 * Falls back to null if marker absent or region too short.
 */
export function extractAssistantRegion(text: string): string | null {
  const markerIdx = text.indexOf("⎿");
  if (markerIdx === -1) return null;

  const region = text.slice(markerIdx + 1).trim();
  if (region.length < 5) return null;

  return region
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) return false;
      if (/^[─━═┌┐└┘├┤┬┴┼╭╮╰╯│\s]+$/.test(trimmed)) return false;
      if (/\d+\s*tok|Reticulating|Gallivanting|Discombobulating/i.test(trimmed)) return false;
      if (/[\w']+…/.test(trimmed) && trimmed.length < 40 && !/[.!?]\s/.test(trimmed)) return false;
      if (/^[·✽✢✶✻✺*⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏●○◉\d\s]*thinking/i.test(trimmed)) return false;
      if (/^\d*\s*thought\s+for\s+\d+s\)?/i.test(trimmed)) return false;
      if (/^[↓↑]\s*\d+\s*tokens?/i.test(trimmed)) return false;
      return true;
    })
    .join("\n")
    .trim();
}

/** Blacklist filter: line-by-line removal of known TUI chrome patterns */
export function blacklistFilter(lines: string[]): string[] {
  return lines.filter((line) => {
    const trimmed = line.trim();
    if (!trimmed) return false;
    if (trimmed.length < 8) return false;
    // Pure box drawing / decorative borders
    if (/^[─━═┌┐└┘├┤┬┴┼╭╮╰╯│\s]+$/.test(trimmed)) return false;
    // Lines containing box-drawing mixed with content (bubble frames, borders)
    if (/[╭╮╰╯]/.test(trimmed) && /[─]{3,}/.test(trimmed)) return false;
    // Lines with pipe delimiters (bubble content leaking into transcript)
    if (/^│/.test(trimmed) || /│$/.test(trimmed)) return false;
    // Lines that are mostly box-drawing (even with some text mixed in)
    if (/[│╭╮╰╯─]/.test(trimmed) && /[─]{5,}/.test(trimmed)) return false;
    // Buddy sprite frames (owl ASCII art, emoticons)
    if (/^[/\\()_|<>oO.·°✦×◉@\s^v~`´\-–—,;:!?*#]+$/.test(trimmed)) return false;
    // Owl face patterns: (×)(×), (><), etc
    if (/^\(?[×x><oO]\)\(?[×x><oO]\)?/.test(trimmed)) return false;
    if (/^\(\s*><\s*\)/.test(trimmed)) return false;
    // Backtick-dash patterns from owl sprites: `----´
    if (/^`-+´$/.test(trimmed)) return false;
    // Claude Code banner / status fragments
    if (/▐▛|▜▌|▝▜|█|▘/.test(trimmed)) return false;
    // Token counter, status bar, spinner fragments
    if (/\d+\s*tok|Reticulating|Gallivanting|Discombobulating|bypass permissions|shift\+tab|esc to interrupt|for\s*shortcuts/i.test(trimmed)) return false;
    // Spinner: line that is primarily a spinner word + ellipsis (e.g., "Beboppin'…", "✽ Cogitating… 42")
    // Don't filter lines with real sentence content that happen to contain ellipsis
    if (/[\w']+…/.test(trimmed) && trimmed.length < 40 && !/[.!?]\s/.test(trimmed)) return false;
    // Prompt line
    if (/^❯/.test(trimmed)) return false;
    // Tool running indicator
    if (/Running…|timeout \d+s|ctrl\+b/i.test(trimmed)) return false;
    // Effort/mode indicators and thinking status
    if (/^[●○◉]*\s*(high|medium|low)\s*[·•]\s*\/?\s*(effort)?/i.test(trimmed)) return false;
    if (/thinking\s+with\s+(high|medium|low)\s+effort/i.test(trimmed)) return false;
    if (/^[·✽✢✶✻✺*⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏●○◉\d\s]*thinking/i.test(trimmed)) return false;
    // Token counts and thought duration
    if (/^\d*\s*thought\s+for\s+\d+s\)?/i.test(trimmed)) return false;
    if (/^\d+\s*(thought|tokens?)\b/i.test(trimmed)) return false;
    if (/^[↓↑]\s*\d+\s*tokens?/i.test(trimmed)) return false;
    // Claude Code "Tip:" hints (e.g., "Tip: Use --agent <agent_name>...")
    if (/^Tip:\s/i.test(trimmed)) return false;
    // Async hook output from Claude Code internals
    if (/Async\s*hook\s*(UserPromptSubmit|Stop|SessionStart|SubagentStart|SubagentStop|Notification)/i.test(trimmed)) return false;
    // MCP server status lines
    if (/^\d+\s*MCP\s*server\s*(failed|connected)/i.test(trimmed)) return false;
    if (/^\/mcp\b/.test(trimmed)) return false;
    // Lines that are mostly non-alphanumeric (UI junk) — but exempt code-like lines
    const alphaCount = (trimmed.match(/[a-zA-Z]/g) || []).length;
    const looksLikeCode = /[`{}[\]()]/.test(trimmed) || /\b(const|let|var|function|return|import|if|else)\b/.test(trimmed);
    if (alphaCount / trimmed.length < 0.3 && trimmed.length > 10 && !looksLikeCode) return false;
    // Repeated spinner words
    const words = trimmed.split(/\s+/).filter(w => w.length > 3);
    if (words.length >= 2 && new Set(words).size === 1) return false;
    return true;
  });
}

/** Full transcript strip: whitelist first, blacklist fallback */
export function stripForTranscript(text: string): string {
  const stripped = stripAnsi(text);
  const collapsed = stripped.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n");

  const assistantRegion = extractAssistantRegion(collapsed);
  if (assistantRegion && assistantRegion.length > 10) {
    return assistantRegion;
  }

  return blacklistFilter(collapsed.split("\n")).join("\n").trim();
}

/** Extract bubble text from native Shingle bubble in PTY output.
 *  The TUI renders bubble content with cursor positioning sequences.
 *  After ANSI stripping, words can concatenate (e.g., "Yourcode,though?").
 *  We re-insert spaces at likely word boundaries after stripping.
 */
const BUBBLE_LINE_RE = /│\s*(.*?)\s*│/g;  // used via matchAll() — no statefulness risk
const BUBBLE_OPEN_RE = /╭[─]+╮/;

function respaceText(text: string): string {
  return text
    // Insert space before lowercase→uppercase transitions (camelCase word joins)
    .replace(/([a-z,;.!?])([A-Z])/g, "$1 $2")
    // Insert space after sentence-ending punctuation followed by a letter
    .replace(/([.!?])([a-zA-Z])/g, "$1 $2")
    // Insert space after comma/semicolon followed by a letter
    .replace(/([,;])([a-zA-Z])/g, "$1 $2")
    // Insert space after contractions followed by a lowercase letter
    // e.g., That'swhat → That's what, I'mworried → I'm worried
    .replace(/(['''](?:s|m|t|re|ve|ll|d))([a-z])/g, "$1 $2")
    // Insert space between a lowercase letter and a contraction start
    // e.g., codeI'm → code I'm
    .replace(/([a-z])([A-Z]')/g, "$1 $2")
    // Insert space at digit↔letter boundaries
    // e.g., checking42files → checking 42 files
    .replace(/([a-zA-Z])(\d)/g, "$1 $2")
    .replace(/(\d)([a-zA-Z])/g, "$1 $2")
    // Collapse multiple spaces
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function extractBubbleText(raw: string): string | null {
  const stripped = stripAnsi(raw);
  if (!BUBBLE_OPEN_RE.test(stripped)) return null;

  const lines: string[] = [];
  for (const match of stripped.matchAll(BUBBLE_LINE_RE)) {
    const text = match[1].trim();
    if (text && !/^[─\s]+$/.test(text)) lines.push(text);
  }

  const bubbleText = respaceText(lines.join(" "));
  if (bubbleText.length > 3 && /[a-zA-Z]{2,}/.test(bubbleText)) {
    return bubbleText;
  }
  return null;
}
