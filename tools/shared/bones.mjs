// bones.mjs — Deterministic companion trait derivation
//
// Reproduces the Claude Code buddy system's identity pipeline:
//   userId + salt → hash → Mulberry32 PRNG → traits
//
// Two hash paths available:
//   - wyhash (default): matches production Bun.hash behavior
//   - FNV-1a: legacy Node.js fallback from the binary
//
// Usage:
//   import { deriveBones } from './bones.mjs';
//   const bones = deriveBones(userId);           // wyhash (production)
//   const bones = deriveBones(userId, 'fnv1a');  // legacy fallback

const SALT = "[hash-salt]";

// Binary order (v2.1.96 species array) — NOT alphabetical.
// The order matters because species = array[floor(rng * length)].
const SPECIES = [
  "duck", "goose", "blob", "cat", "dragon", "octopus",
  "owl", "penguin", "turtle", "snail", "ghost", "axolotl",
  "capybara", "cactus", "robot", "rabbit", "mushroom", "chonk",
];

const EYES = ["·", "✦", "×", "◉", "@", "°"];

const HATS = [
  "none", "crown", "tophat", "propeller",
  "halo", "wizard", "beanie", "tinyduck",
];

const STAT_NAMES = ["DEBUGGING", "PATIENCE", "CHAOS", "WISDOM", "SNARK"];

// Rarity weights (v2.1.96 binary rarity-weight table). Weighted selection, not cumulative thresholds.
const RARITY_WEIGHTS = { common: 60, uncommon: 25, rare: 10, epic: 4, legendary: 1 };
const RARITY_ORDER = ["common", "uncommon", "rare", "epic", "legendary"];

// Stat ranges by rarity — higher rarity gets a higher floor
// Values from v2.1.96 binary stat-floor table: {common:5,uncommon:15,rare:25,epic:35,legendary:50}
const STAT_FLOORS = {
  common: 5,
  uncommon: 15,
  rare: 25,
  epic: 35,
  legendary: 50,
};

// --- Hash: FNV-1a (legacy Node.js fallback) ---

export function fnv1a(input) {
  let hash = 0x811c9dc5; // FNV offset basis
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = (hash + (hash << 1) + (hash << 4) + (hash << 7) +
            (hash << 8) + (hash << 24)) >>> 0;
  }
  return hash >>> 0;
}

// --- Hash: wyhash (production Bun.hash) ---
//
// Port of Zig's std.hash.Wyhash to JavaScript using BigInt for 64-bit math.
// Bun.hash() uses this implementation internally. Verified against Bun 1.3.11
// test vectors on 2026-04-09.
//
// Production: BigInt(Bun.hash(input)) & 0xffffffffn → 32-bit seed.

const MASK64 = (1n << 64n) - 1n;

const _secret = [
  0xa0761d6478bd642fn,
  0xe7037ed1a0b428dbn,
  0x8ebc6af09c88c6e3n,
  0x589965cc75374cc3n,
];

function _mum(a, b) {
  const r = (a & MASK64) * (b & MASK64);
  return [(r & MASK64), ((r >> 64n) & MASK64)];
}

function _mix(a, b) {
  const [lo, hi] = _mum(a, b);
  return (lo ^ hi) & MASK64;
}

function _r8(data, off) {
  let v = 0n;
  for (let i = 0; i < 8; i++) v |= BigInt(data[off + i] || 0) << BigInt(i * 8);
  return v;
}

function _r4(data, off) {
  let v = 0n;
  for (let i = 0; i < 4; i++) v |= BigInt(data[off + i] || 0) << BigInt(i * 8);
  return v;
}

export function wyhash(input, seed = 0n) {
  const data = new TextEncoder().encode(input);
  const len = data.length;
  seed = (BigInt(seed) ^ _mix(BigInt(seed) ^ _secret[0], _secret[1])) & MASK64;

  let a, b;

  if (len <= 16) {
    if (len >= 4) {
      const p = Math.floor(len / 8) * 4;
      a = ((_r4(data, 0) << 32n) | _r4(data, p)) & MASK64;
      b = ((_r4(data, len - 4) << 32n) | _r4(data, len - 4 - p)) & MASK64;
    } else if (len > 0) {
      a = BigInt((data[0] << 16) | (data[len >> 1] << 8) | data[len - 1]) & MASK64;
      b = 0n;
    } else {
      a = 0n;
      b = 0n;
    }
  } else {
    let off = 0;
    let remaining = len;
    let see1 = seed;
    let see2 = seed;

    if (remaining > 48) {
      while (remaining > 48) {
        seed = _mix(_r8(data, off) ^ _secret[1], _r8(data, off + 8) ^ seed) & MASK64;
        see1 = _mix(_r8(data, off + 16) ^ _secret[2], _r8(data, off + 24) ^ see1) & MASK64;
        see2 = _mix(_r8(data, off + 32) ^ _secret[3], _r8(data, off + 40) ^ see2) & MASK64;
        off += 48;
        remaining -= 48;
      }
      seed = (seed ^ see1 ^ see2) & MASK64;
    }

    while (remaining > 16) {
      seed = _mix(_r8(data, off) ^ _secret[1], _r8(data, off + 8) ^ seed) & MASK64;
      off += 16;
      remaining -= 16;
    }

    a = _r8(data, off + remaining - 16);
    b = _r8(data, off + remaining - 8);
  }

  a = (a ^ _secret[1]) & MASK64;
  b = (b ^ seed) & MASK64;
  const [lo, hi] = _mum(a, b);
  return _mix((lo ^ _secret[0] ^ BigInt(len)), (hi ^ _secret[1])) & MASK64;
}

// --- PRNG ---

export function mulberry32(seed) {
  let s = seed | 0;
  return function next() {
    s = (s + [prng-multiplier]) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- Derivation ---

export function deriveBones(userId, hashMode = 'wyhash') {
  let seed;
  if (hashMode === 'fnv1a') {
    seed = fnv1a(userId + SALT);
  } else {
    // Production path: Bun.hash (wyhash) truncated to 32 bits
    const hash64 = wyhash(userId + SALT);
    seed = Number(hash64 & 0xffffffffn);
  }
  const rng = mulberry32(seed);

  // RNG consumption order must exactly match the binary's trait-generator function.
  // 1. Rarity — weighted selection (rarity-roll helper)
  const rarity = rollRarity(rng);

  // 2. Species
  const species = SPECIES[Math.floor(rng() * SPECIES.length)];

  // 3. Eye
  const eye = EYES[Math.floor(rng() * EYES.length)];

  // 4. Hat — SKIPPED (no RNG call) when rarity is "common"
  const hat = rarity === "common" ? "none" : HATS[Math.floor(rng() * HATS.length)];

  // 5. Shiny — comes BEFORE stats in the binary
  const shiny = rng() < 0.01;

  // 6. Stats — stat-generator: primary stat boosted, secondary penalized, others baseline
  const floor = STAT_FLOORS[rarity];
  const primaryStat = STAT_NAMES[Math.floor(rng() * STAT_NAMES.length)];
  let secondaryStat = STAT_NAMES[Math.floor(rng() * STAT_NAMES.length)];
  while (secondaryStat === primaryStat) {
    secondaryStat = STAT_NAMES[Math.floor(rng() * STAT_NAMES.length)];
  }
  const stats = {};
  for (const name of STAT_NAMES) {
    if (name === primaryStat) {
      stats[name] = Math.min(100, floor + 50 + Math.floor(rng() * 30));
    } else if (name === secondaryStat) {
      stats[name] = Math.max(1, floor - 10 + Math.floor(rng() * 15));
    } else {
      stats[name] = floor + Math.floor(rng() * 40);
    }
  }

  // 7. Inspiration seed (not returned but consumed to keep RNG in sync)
  const inspirationSeed = Math.floor(rng() * 1e9);

  return { species, rarity, eye, hat, shiny, stats, primaryStat, secondaryStat, inspirationSeed };
}

// Binary rarity-roll helper: weighted selection over the rarity-weight table
function rollRarity(rng) {
  const total = Object.values(RARITY_WEIGHTS).reduce((a, b) => a + b, 0);
  let roll = rng() * total;
  for (const name of RARITY_ORDER) {
    roll -= RARITY_WEIGHTS[name];
    if (roll < 0) return name;
  }
  return "common";
}

// --- Validation ---

// Known native Shingle values (from API capture, verified across 4 payloads).
// Pipeline now reproduces these exactly: accountUuid + salt → wyhash → Mulberry32 → traits.
// Root cause of prior mismatch: species array was alphabetized (should match binary's
// non-alphabetical species order), stat formula used uniform random (binary uses
// primary/secondary boost/penalty), hat RNG was consumed for common rarity (binary skips it),
// shiny was after stats (binary: before).
export const NATIVE_SHINGLE = {
  species: "owl",
  rarity: "common",
  eye: "×",
  hat: "none",
  shiny: false,
  primaryStat: "PATIENCE",
  secondaryStat: "CHAOS",
  stats: { DEBUGGING: 10, PATIENCE: 81, CHAOS: 1, WISDOM: 36, SNARK: 21 },
};

// --- CLI ---

import { readFileSync as _readFileSync } from "node:fs";
import { join as _join } from "node:path";
import { homedir as _homedir } from "node:os";

if (import.meta.url === `file://${process.argv[1]}`) {
  let inputId = process.argv[2];
  if (!inputId) {
    try {
      const configPath = _join(_homedir(), ".claude", ".claude.json");
      const config = JSON.parse(_readFileSync(configPath, "utf-8"));
      // Production uses accountUuid (falls back to userID, then "anon")
      inputId = config.oauthAccount?.accountUuid ?? config.userID ?? "anon";
    } catch { /* ignore */ }
  }

  if (!inputId) {
    console.error("Usage: node bones.mjs [accountUuid]");
    console.error("  Or run without args to read from ~/.claude/.claude.json");
    process.exit(1);
  }

  const wyBones = deriveBones(inputId, 'wyhash');
  const fnvBones = deriveBones(inputId, 'fnv1a');

  console.log("=== Production (wyhash) ===");
  console.log(JSON.stringify(wyBones, null, 2));
  console.log("\n=== Legacy (FNV-1a) ===");
  console.log(JSON.stringify(fnvBones, null, 2));

  console.log("\n=== Validation ===");
  const match = wyBones.species === NATIVE_SHINGLE.species &&
    wyBones.rarity === NATIVE_SHINGLE.rarity &&
    JSON.stringify(wyBones.stats) === JSON.stringify(NATIVE_SHINGLE.stats);
  console.log(`Wyhash matches NATIVE_SHINGLE: ${match ? "YES ✓" : "NO ✗"}`);
  if (!match) {
    console.log("Expected:", JSON.stringify(NATIVE_SHINGLE));
    console.log("Got:     ", JSON.stringify({ species: wyBones.species, rarity: wyBones.rarity, stats: wyBones.stats }));
  }
}
