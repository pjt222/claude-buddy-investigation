# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Purpose

Research repository documenting findings about Claude Code's built-in "Buddy" companion system — specifically the owl companion named Shingle. Includes a CLI utility for modifying companion config.

## Repository Structure

- `digest.md` — comprehensive investigation findings from 11 agents across 2 waves
- `architecture.md` — technical deep-dive: function reference, data flow diagrams, API protocol, security boundary
- `config-excerpt.json` — companion config extracted from `~/.claude/backups/` state files
- `links.md` — 20 reference sources organized by category (official docs, source analysis, reverse engineering, prior art, competitors)
- `README.md` — project overview
- `tools/buddy-config.mjs` — CLI to read/modify companion config (Node.js 18+, zero deps)
- `tools/test-protocol.md` — empirical test protocols for bubble TTL and narrow terminal behavior
- `docs/` — GitHub Pages visualization (Three.js, Viridis dark theme)

## Key Context

- The buddy system is a first-party Claude Code feature (v2.1.89+, Pro/Max plan), launched April 1, 2026
- Companion identity is deterministic: Bun.hash (wyhash) of user ID with salt `friend-2026-401`, feeding Mulberry32 PRNG (FNV-1a is the Node.js dev fallback only)
- Only 3 fields persisted in `~/.claude/.claude.json`: name, personality, hatchedAt. All other traits re-derived from hash each session.
- Shingle is architecturally separate from the main Claude Code agent — strictly unidirectional (observes but cannot write back)
- 9 reaction triggers: turn, hatch, pet, test-fail, error, large-diff, complete, idle, silence
- Binary at `~/.local/share/claude/versions/2.1.90` contains the buddy source (minified JS)
