# Buddy System — Reference Links

A comprehensive index of sources discovered across two investigation waves (11 agents). Each entry includes a reliability note.

---

## 1. Official / Semi-Official Documentation

- **Claude Code Buddy Activation Guide**
  https://help.apiyi.com/en/claude-code-buddy-terminal-pet-companion-activation-guide-en.html
  Covers activation via `/buddy`, requirements (Pro plan, v2.1.89+), and basic mechanics.
  *Reliability: Third-party guide site; accurate on activation steps but may lag behind updates.*

- **Claude Code Source Analysis — Companion (Buddy) System**
  https://deepwiki.com/sanbuphy/claude-code-source-code/11.4-companion-(buddy)-system
  Deep dive into the source code: hashing algorithm, species selection, personality generation, trigger system.
  *Reliability: High — based on direct source code reading; one of the most detailed technical references available.*

- **Claude Buddy Preview Tool**
  https://claude-buddy.vercel.app/
  Interactive viewer showing all companion species, rarities, eye types, hats, and shiny variants.
  *Reliability: Community-built tool; useful for visual reference but may not track latest species additions.*

---

## 2. Source Code Analysis

- **zackautocracy/claude-code** (GitHub)
  https://github.com/zackautocracy/claude-code
  Contains `companion.ts` showing the Bun.hash vs FNV-1a conditional logic — confirms Bun.hash (wyhash) in production, FNV-1a as Node.js fallback.
  *Reliability: High — direct source code; verify commit recency against official releases.*

- **Kuberwastaken/claurst** (GitHub)
  https://github.com/Kuberwastaken/claurst
  Breakdown of buddy system internals including species mapping, hash-to-index conversion, and personality generation pipeline.
  *Reliability: Medium-high — community analysis repo; cross-reference with primary source.*

- **Combjellyshen/claude-buddy** (GitHub)
  https://github.com/Combjellyshen/claude-buddy
  Community fan-created RPG evolution proof-of-concept. **NOT official Anthropic code.** Demonstrates a speculative evolution mechanic that does not exist in the real buddy system.
  *Reliability: Low for understanding the real system — useful only as an example of community enthusiasm.*

---

## 3. Community Reverse Engineering

- **Houstoten Gist — Buddy Internals Analysis**
  https://gist.github.com/Houstoten/144e4ae9c520a281551d0cb92c488e04
  Analysis of bones regeneration, soul persistence, and confirmation that reactions use the main loop model.
  *Reliability: Medium-high — independent reverse engineering; findings corroborated by multiple sources.*

- **dev.to/ithiria894 — "I reverse engineered Claude Code's buddy system"**
  https://dev.to/ithiria894/i-reverse-engineered-claude-codes-buddy-system-heres-how-to-reroll-yours-2ghj
  Walkthrough of species assignment and reroll process (delete companion key, re-run `/buddy`).
  *Reliability: Medium — practical guide; reroll method confirmed but may break with future updates.*

- **dev.to/picklepixel — "How I reverse engineered Claude Code's hidden pet system"**
  https://dev.to/picklepixel/how-i-reverse-engineered-claude-codes-hidden-pet-system-8l7
  Confirms species name obfuscation via `String.fromCharCode` and the Bun.hash vs FNV-1a branching.
  *Reliability: Medium-high — technically detailed; consistent with source code analysis.*

- **variety.is — Claude Code Buddies**
  https://variety.is/posts/claude-code-buddies/
  Independent reverse engineering effort documenting the buddy system's internal structure.
  *Reliability: Medium — independent corroboration of findings from other sources.*

- **DEV Community — "Claude Buddy: The Complete Guide"**
  https://dev.to/damon_bb9e4bba1285afe2fcd/claude-buddy-the-complete-guide-to-your-ai-terminal-pet-all-18-species-rarities-hidden-22da
  Documents all 18 species, rarity tiers, and claimed hidden features.
  *Reliability: Medium — comprehensive but unverified "hidden features" claims; species list consistent.*

---

## 4. Prior Art & Patents

- **US5966526A — Tamagotchi Patent (Bandai, 1996)**
  https://patents.google.com/patent/US5966526A
  Foundational virtual pet patent. Buddy's hatch-and-persist model echoes this but omits care/death mechanics.

- **US6262730B1 — Microsoft Office Assistant / Clippy Patent**
  https://patents.google.com/patent/US6262730B1
  Context-aware software assistants that observe user behavior and offer suggestions. Direct precedent for trigger-based reactions.

- **WO2015004620A2 — Virtual Companion Patent**
  https://patents.google.com/patent/WO2015004620A2
  Broader virtual companion patent covering persistent digital entities with personality and memory.

- **US20170345324A1 — Configuring Virtual Companion Patent**
  https://patents.google.com/patent/US20170345324A1
  User-configurable virtual companions. The buddy system is NOT configurable (deterministic from user ID), making this a useful contrast.

- **MonsterID (splitbrain.org, 2008)**
  https://splitbrain.org/projects/monsterid
  Hash-based unique monster avatar generation. Conceptually identical to the buddy system's hash-to-species mapping.

- **Gravatar Identicons**
  https://en.gravatar.com/site/implement/images/
  Hash-to-visual-identity pattern. Establishes that deterministic identity generation from account hashes is a well-understood pattern.

---

## 5. Adjacent Projects / Competitors

- **blairjordan/codachi** (GitHub)
  https://github.com/blairjordan/codachi
  VS Code / Cursor extension with monster pets, XP leveling, and evolution. More elaborate gamification than the buddy system.

- **wunderlabs-dev/cursouls** (GitHub, March 2026)
  https://github.com/wunderlabs-dev/cursouls
  Pixel art cafe characters for Cursor and Claude Code. Ambient companions without interactive triggers.

- **VS Code Pets (tonybaloney)**
  https://marketplace.visualstudio.com/items?itemName=tonybaloney.vscode-pets
  The original coding pet extension for VS Code. Predates all AI-era companions. No AI integration.

---

## Key Technical Details (Reference)

### Hash & Identity
- Production uses Bun.hash (wyhash) on `accountUuid + "friend-2026-401"`
- FNV-1a is the Node.js dev fallback only
- Both feed Mulberry32 PRNG for trait generation
- Species names obfuscated in binary via `String.fromCharCode` arrays

### Species (18 confirmed)
axolotl, blob, cactus, capybara, cat, chonk, dragon, duck, ghost, goose, mushroom, octopus, owl, penguin, rabbit, robot, snail, turtle

### Appearance System
- 18 species x 5 rarities x 6 eye types x 8 hat types
- 1% chance of "shiny" variant (independent of rarity)
- Eyes: `·` `✦` `×` `◉` `@` `°`
- Hats: none, crown, tophat, propeller, halo, wizard, beanie, tinyduck

### Reaction Triggers (9 confirmed)
turn, hatch, pet, test-fail, error, large-diff, complete, idle, silence

### Storage
- Config: `~/.claude/.claude.json` under `companion` key
- Three persisted fields: `name`, `personality`, `hatchedAt`
- All other traits re-derived from hash each session

### Commands
- `/buddy` — hatch or show companion card
- `/buddy pet` — pet companion (also unmutes)
- `/buddy off` — mute companion
- `/buddy on` — unmute (hidden/undocumented)

### Security Boundary
- Companion observes but cannot write back to main agent
- `companionMuted` stops all network calls
- `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1` is a full kill switch
- No secret/PII filtering on transmitted transcript (5000 chars)
