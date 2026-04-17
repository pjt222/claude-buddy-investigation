Audit the workspace transcript filter at `workspace/server/transcript-filter.ts` for edge cases.

Steps:
1. Read the blacklistFilter function and identify any TUI chrome patterns that could slip through
2. Write a quick throwaway test: create `/tmp/filter-test.ts` that imports stripForTranscript and runs it against these strings:
   - `"Tip: Use --agent <agent_name> to start..."` (should be filtered)
   - `"   ❯ git status"` (prompt line, should be filtered)
   - `"The bug is in line 42 of index.ts"` (real content, should PASS)
   - `"●●● thinking with high effort"` (spinner, should be filtered)
   - `"│ Hello from bubble │"` (bubble frame, should be filtered)
3. Run it with `npx tsx /tmp/filter-test.ts` and report which pass/fail
4. If any edge cases leak through, propose a fix to the blacklist regex
5. Run the full test suite: `cd workspace && npx tsx --test test/*.test.ts`

Keep changes small and focused — one file at a time. The crew is watching.
