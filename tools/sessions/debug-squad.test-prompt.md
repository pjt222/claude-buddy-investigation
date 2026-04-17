There's a bug to hunt. A test file has a broken import — find it and fix it.

Steps:
1. Create a broken test file at `/tmp/debug-squad-test.ts`:
   ```typescript
   import { stripForTranscript } from "../../workspace/server/transcript-filter.ts";
   import { describe, it } from "node:test";
   import assert from "node:assert";

   describe("debug-squad smoke test", () => {
     it("should strip ANSI from PTY output", () => {
       const input = "\x1b[32mGreen text\x1b[0m";
       const result = stripForTranscript(input);
       assert.ok(!result.includes("\x1b"), "ANSI codes should be stripped");
     });

     it("should preserve real content", () => {
       const input = "The answer is 42.";
       const result = stripForTranscript(input);
       assert.strictEqual(result, "The answer is 42.");
     });
   });
   ```
2. Run it: `npx tsx --test /tmp/debug-squad-test.ts` — it will fail (bad import path)
3. Fix the import path to use the correct relative path from /tmp
4. Run again — if tests pass, report the fix
5. Then run the real test suite: `cd workspace && npx tsx --test test/*.test.ts`

Work fast. Coral is watching for patterns. Fizz wants you to succeed.
