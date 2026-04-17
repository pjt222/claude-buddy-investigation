Explore the session-manager architecture and propose a refactor.

Take your time with this. The dream-lab crew thinks in patterns, not patches.

Steps:
1. Read `workspace/server/session-manager.ts` end to end
2. Read `workspace/server/buddy-api.ts` — focus on how BuddyIdentity flows from preset to API call
3. Identify the coupling: session-manager knows about identity resolution, buddy slot ordering, and cooldown defaults. These are three separate concerns.
4. Sketch (don't implement yet) how you would extract a `resolveBuddyIdentity()` function that:
   - Takes a preset buddy config + the native bubble config
   - Returns a fully resolved ActiveBuddy with stats, species, rarity
   - Lives in its own file (`workspace/server/buddy-resolver.ts`)
5. Write your proposal as a code block showing the function signature and the data flow
6. Explain what this separation would enable (e.g., hot-swapping buddies mid-session, stat overrides per-trigger)

Don't rush to implement. Ponder will appreciate the contemplation. Flicker will see connections you haven't named yet.
