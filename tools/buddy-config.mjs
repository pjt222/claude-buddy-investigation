#!/usr/bin/env node

// buddy-config.mjs — CLI utility to read and modify Claude Code companion config
// Zero dependencies. Node.js 18+ required (uses readline/promises).
//
// Companion config lives in ~/.claude/.claude.json under the "companion" key.
// Only name, personality, and mute status can be changed.
// Species, rarity, stats, eyes, hat, and shiny are deterministic from your
// account ID hash and are re-derived each session — they cannot be modified.

import { readFile, writeFile, rename, readdir, copyFile, mkdir, stat } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { homedir } from 'node:os';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout, argv, exit } from 'node:process';

// --- Config Resolution ---

const CONFIG_FILENAME = '.claude.json';
const BACKUP_PREFIX = '.claude.json.backup.';

function resolveConfigDir() {
  const override = process.env.CLAUDE_CONFIG_DIR;
  return override || join(homedir(), '.claude');
}

function resolveConfigPath() {
  return join(resolveConfigDir(), CONFIG_FILENAME);
}

function resolveBackupDir() {
  return join(resolveConfigDir(), 'backups');
}

// --- Argument Parsing ---

function parseArgs() {
  const args = argv.slice(2);
  const flags = {};
  const positional = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--no-backup') flags.noBackup = true;
    else if (args[i] === '--force') flags.force = true;
    else if (args[i] === '--json') flags.json = true;
    else if (args[i] === '--help' || args[i] === '-h') flags.help = true;
    else if (args[i] === '--config-dir' && args[i + 1]) { flags.configDir = args[++i]; }
    else positional.push(args[i]);
  }

  if (flags.configDir) process.env.CLAUDE_CONFIG_DIR = flags.configDir;

  return { command: positional[0], args: positional.slice(1), flags };
}

// --- File Operations ---

async function fileExists(filePath) {
  try { await stat(filePath); return true; } catch { return false; }
}

async function readConfig() {
  const configPath = resolveConfigPath();

  if (await fileExists(configPath)) {
    const raw = await readFile(configPath, 'utf-8');
    return JSON.parse(raw);
  }

  // Fall back to most recent backup
  const backups = await listBackupFiles();
  if (backups.length === 0) {
    throw new Error(
      'No companion config found.\n' +
      'Have you hatched a buddy with /buddy in Claude Code?'
    );
  }

  const latest = backups[backups.length - 1];
  const raw = await readFile(latest.path, 'utf-8');
  return { ...JSON.parse(raw), _source: 'backup', _backupPath: latest.path };
}

async function writeConfig(config) {
  const configPath = resolveConfigPath();
  const configDir = resolveConfigDir();

  await mkdir(configDir, { recursive: true });

  // Remove internal metadata before writing
  const cleanConfig = { ...config };
  delete cleanConfig._source;
  delete cleanConfig._backupPath;

  // Atomic write: temp file then rename
  const tmpPath = configPath + '.tmp.' + Date.now();
  await writeFile(tmpPath, JSON.stringify(cleanConfig, null, 2) + '\n', 'utf-8');
  await rename(tmpPath, configPath);
}

async function createBackup(label) {
  const configPath = resolveConfigPath();
  if (!(await fileExists(configPath))) return null;

  const backupDir = resolveBackupDir();
  await mkdir(backupDir, { recursive: true });

  const timestamp = Date.now();
  const backupPath = join(backupDir, `${BACKUP_PREFIX}${timestamp}`);
  await copyFile(configPath, backupPath);
  return backupPath;
}

async function listBackupFiles() {
  const backupDir = resolveBackupDir();
  if (!(await fileExists(backupDir))) return [];

  const files = await readdir(backupDir);
  return files
    .filter(f => f.startsWith(BACKUP_PREFIX))
    .map(f => ({
      filename: f,
      timestamp: parseInt(f.replace(BACKUP_PREFIX, ''), 10),
      path: join(backupDir, f),
    }))
    .sort((a, b) => a.timestamp - b.timestamp);
}

// --- Validation ---

function validateName(name) {
  if (!name || name.length === 0) return 'Name cannot be empty.';
  if (name.length > 14) return `Name too long (${name.length}/14 chars max).`;
  if (/\s/.test(name)) return 'Name must be a single word (no spaces).';
  return null;
}

function validatePersonality(text) {
  if (!text || text.length === 0) return 'Personality cannot be empty.';
  if (text.length > 200) return `Personality too long (${text.length}/200 chars max).`;
  return null;
}

// --- Display ---

function formatDate(unixMs) {
  const date = new Date(unixMs);
  const now = new Date();
  const daysAgo = Math.floor((now - date) / 86400000);
  const dateStr = date.toISOString().split('T')[0];
  return daysAgo <= 0 ? `${dateStr} (today)` : `${dateStr} (${daysAgo} day${daysAgo === 1 ? '' : 's'} ago)`;
}

const IMMUTABLE_WARNING =
  '\x1b[2m' +
  'Note: Species, rarity, stats, eyes, hat, and shiny cannot be changed.\n' +
  'They are derived from your account ID hash each session.\x1b[0m';

const WRITE_WARNING =
  '\x1b[33m' +
  'WARNING: Modifying companion config. Changes take effect on next Claude Code session.\x1b[0m';

// --- Confirmation ---

async function confirm(message, flags) {
  if (flags.force) return true;
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    const answer = await rl.question(`${message} [y/N] `);
    return answer.toLowerCase() === 'y';
  } finally {
    rl.close();
  }
}

// --- Commands ---

async function cmdShow(flags) {
  const config = await readConfig();
  const companion = config.companion;

  if (!companion) {
    console.error('Config exists but no companion found. Run /buddy in Claude Code first.');
    exit(1);
  }

  if (flags.json) {
    console.log(JSON.stringify({
      name: companion.name,
      personality: companion.personality,
      hatchedAt: companion.hatchedAt,
      muted: config.companionMuted ?? false,
      source: config._source === 'backup' ? 'backup' : 'config',
    }, null, 2));
    return;
  }

  if (config._source === 'backup') {
    console.log('\x1b[2m(Reading from backup — primary config not found)\x1b[0m\n');
  }

  console.log(`  \x1b[1mCompanion:\x1b[0m  ${companion.name}`);
  console.log(`  \x1b[1mPersonality:\x1b[0m ${companion.personality}`);
  console.log(`  \x1b[1mHatched:\x1b[0m    ${formatDate(companion.hatchedAt)}`);
  console.log(`  \x1b[1mMuted:\x1b[0m      ${config.companionMuted ? '\x1b[33myes\x1b[0m' : '\x1b[32mno\x1b[0m'}`);
  console.log('');
  console.log(IMMUTABLE_WARNING);
}

async function cmdRename(newName, flags) {
  const error = validateName(newName);
  if (error) { console.error(`Error: ${error}`); exit(1); }

  const config = await readConfig();
  if (!config.companion) {
    console.error('No companion found. Run /buddy in Claude Code first.');
    exit(1);
  }

  const oldName = config.companion.name;
  console.log(`  Current name: ${oldName}`);
  console.log(`  New name:     ${newName}`);
  console.log('');
  console.log(WRITE_WARNING);

  if (!(await confirm('Proceed?', flags))) {
    console.log('Cancelled.');
    return;
  }

  if (!flags.noBackup) {
    const backupPath = await createBackup();
    if (backupPath) console.log(`  Backup: ${basename(backupPath)}`);
  }

  config.companion.name = newName;
  await writeConfig(config);
  console.log(`  \x1b[32mRenamed: ${oldName} -> ${newName}\x1b[0m`);
}

async function cmdPersonality(text, flags) {
  const error = validatePersonality(text);
  if (error) { console.error(`Error: ${error}`); exit(1); }

  const config = await readConfig();
  if (!config.companion) {
    console.error('No companion found. Run /buddy in Claude Code first.');
    exit(1);
  }

  console.log(`  Current: ${config.companion.personality}`);
  console.log(`  New:     ${text}`);
  console.log('');
  console.log(WRITE_WARNING);

  if (!(await confirm('Proceed?', flags))) {
    console.log('Cancelled.');
    return;
  }

  if (!flags.noBackup) {
    const backupPath = await createBackup();
    if (backupPath) console.log(`  Backup: ${basename(backupPath)}`);
  }

  config.companion.personality = text;
  await writeConfig(config);
  console.log('  \x1b[32mPersonality updated.\x1b[0m');
}

async function cmdMute(flags) {
  const config = await readConfig();
  if (config.companionMuted === true) {
    console.log('  Already muted.');
    return;
  }

  if (!flags.noBackup) {
    const backupPath = await createBackup();
    if (backupPath) console.log(`  Backup: ${basename(backupPath)}`);
  }

  config.companionMuted = true;
  await writeConfig(config);
  console.log('  \x1b[33mCompanion muted.\x1b[0m Stops all network calls and UI display.');
}

async function cmdUnmute(flags) {
  const config = await readConfig();
  if (config.companionMuted !== true) {
    console.log('  Already unmuted.');
    return;
  }

  if (!flags.noBackup) {
    const backupPath = await createBackup();
    if (backupPath) console.log(`  Backup: ${basename(backupPath)}`);
  }

  config.companionMuted = false;
  await writeConfig(config);
  console.log('  \x1b[32mCompanion unmuted.\x1b[0m');
}

async function cmdBackup() {
  const backupPath = await createBackup();
  if (!backupPath) {
    console.error('No config file to back up. Only backups exist.');
    exit(1);
  }
  console.log(`  \x1b[32mBackup created:\x1b[0m ${basename(backupPath)}`);
}

async function cmdListBackups(flags) {
  const backups = await listBackupFiles();

  if (backups.length === 0) {
    console.log('  No backups found.');
    return;
  }

  if (flags.json) {
    const entries = await Promise.all(backups.map(async b => {
      try {
        const raw = await readFile(b.path, 'utf-8');
        const data = JSON.parse(raw);
        return {
          timestamp: b.timestamp,
          date: new Date(b.timestamp).toISOString(),
          companion: data.companion?.name ?? '(none)',
          muted: data.companionMuted ?? false,
        };
      } catch {
        return { timestamp: b.timestamp, error: 'unreadable' };
      }
    }));
    console.log(JSON.stringify(entries, null, 2));
    return;
  }

  console.log(`  Found ${backups.length} backup${backups.length === 1 ? '' : 's'}:\n`);

  // Show last 10
  const recent = backups.slice(-10);
  for (const b of recent) {
    try {
      const raw = await readFile(b.path, 'utf-8');
      const data = JSON.parse(raw);
      const name = data.companion?.name ?? '(none)';
      const date = new Date(b.timestamp).toISOString().replace('T', ' ').replace(/\.\d+Z/, '');
      const muted = data.companionMuted ? ' [muted]' : '';
      console.log(`  ${b.timestamp}  ${date}  ${name}${muted}`);
    } catch {
      console.log(`  ${b.timestamp}  (unreadable)`);
    }
  }

  if (backups.length > 10) {
    console.log(`\n  ... and ${backups.length - 10} older backups`);
  }
}

async function cmdRestore(timestampArg, flags) {
  const backups = await listBackupFiles();

  if (backups.length === 0) {
    console.error('No backups found.');
    exit(1);
  }

  let target;
  if (timestampArg) {
    const ts = parseInt(timestampArg, 10);
    target = backups.find(b => b.timestamp === ts);
    if (!target) {
      console.error(`Backup with timestamp ${timestampArg} not found. Use list-backups to see available.`);
      exit(1);
    }
  } else {
    target = backups[backups.length - 1];
    console.log(`  Using latest backup: ${target.timestamp}`);
  }

  const raw = await readFile(target.path, 'utf-8');
  const backupData = JSON.parse(raw);

  if (!backupData.companion) {
    console.error('Backup has no companion data.');
    exit(1);
  }

  console.log(`  Restore from: ${new Date(target.timestamp).toISOString()}`);
  console.log(`  Companion:    ${backupData.companion.name}`);
  console.log(`  Personality:  ${backupData.companion.personality.slice(0, 60)}...`);
  console.log('');

  if (!(await confirm('Restore these companion settings?', flags))) {
    console.log('Cancelled.');
    return;
  }

  // Read current config (or start fresh if missing)
  let config;
  try {
    config = await readConfig();
    delete config._source;
    delete config._backupPath;
  } catch {
    config = {};
  }

  // Only restore companion-related keys
  config.companion = backupData.companion;
  if ('companionMuted' in backupData) {
    config.companionMuted = backupData.companionMuted;
  }

  if (!flags.noBackup) {
    const bp = await createBackup();
    if (bp) console.log(`  Pre-restore backup: ${basename(bp)}`);
  }

  await writeConfig(config);
  console.log('  \x1b[32mCompanion restored.\x1b[0m');
}

// --- Sessions ---

const VALID_SKILLS = ['meditate', 'dream', 'breath'];
const VALID_SLOTS = ['primary', 'secondary', 'tertiary'];
const BUILTIN_PRESETS = ['deep-focus', 'debug-squad', 'dream-lab'];

function resolveSessionDir() {
  return join(resolveConfigDir(), 'sessions');
}

function resolveSessionPath(name) {
  return join(resolveSessionDir(), `${name}.json`);
}

async function listSessionFiles() {
  const dir = resolveSessionDir();
  if (!(await fileExists(dir))) return [];
  const files = await readdir(dir);
  return files.filter(f => f.endsWith('.json')).map(f => f.replace('.json', ''));
}

async function readSession(name) {
  const sessionPath = resolveSessionPath(name);
  if (!(await fileExists(sessionPath))) {
    throw new Error(`Session "${name}" not found. Use 'session list' to see available sessions.`);
  }
  const raw = await readFile(sessionPath, 'utf-8');
  return JSON.parse(raw);
}

async function writeSession(name, data) {
  const dir = resolveSessionDir();
  await mkdir(dir, { recursive: true });
  const sessionPath = resolveSessionPath(name);
  const tmpPath = sessionPath + '.tmp.' + Date.now();
  await writeFile(tmpPath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
  await rename(tmpPath, sessionPath);
}

function validateSessionName(name) {
  if (!name || name.length === 0) return 'Session name cannot be empty.';
  if (name.length > 30) return 'Session name too long (max 30 chars).';
  if (!/^[a-z0-9-]+$/.test(name)) return 'Session name must be lowercase alphanumeric with hyphens only.';
  return null;
}

function validateSkill(skill) {
  if (!VALID_SKILLS.includes(skill)) return `Invalid skill "${skill}". Valid: ${VALID_SKILLS.join(', ')}`;
  return null;
}

function validateSlot(slot) {
  if (!VALID_SLOTS.includes(slot)) return `Invalid slot "${slot}". Valid: ${VALID_SLOTS.join(', ')}`;
  return null;
}

function defaultAlmanac() {
  return {
    meditate: {
      mode: 'active',
      description: 'Grounding moments during pauses — the companion initiates stillness',
      cooldownMs: 60000,
      suppressedBy: ['error', 'test-fail'],
      minSessionMinutes: 5,
      maxPerWindow: { count: 1, windowMinutes: 10 },
    },
    dream: {
      mode: 'passive',
      description: 'Lateral, associative observations after milestones — oblique, never prescriptive',
      cooldownMs: 120000,
      triggerAffinity: ['large-diff', 'turn'],
      requiresMilestone: true,
      maxPerMilestone: 1,
    },
    breath: {
      mode: 'active',
      description: 'Paced breathing exercises during frustration — the companion breathes first',
      cooldownMs: 45000,
      frustrationThreshold: { errorsIn5Min: 2, retryPattern: true },
      maxPerWindow: { count: 2, windowMinutes: 15 },
    },
  };
}

// --- Session helpers for three-tier schema ---

function getSessionBuddies(session) {
  // Returns a unified list of { slot, config, tier } entries for display/mutation
  const result = [];
  if (session.bubbleBuddy) {
    result.push({
      slot: session.bubbleBuddy.slot || 'primary',
      config: { skills: session.bubbleBuddy.skills || [], ...(session.bubbleBuddy.config || {}) },
      tier: 'bubble',
    });
  }
  for (const b of (session.bootstrapped || [])) {
    result.push({ slot: b.slot, config: b.config, tier: 'bootstrapped' });
  }
  return result;
}

function findSlotEntry(session, slot) {
  if (slot === 'primary') {
    return session.bubbleBuddy ? { ref: session.bubbleBuddy, tier: 'bubble' } : null;
  }
  const entry = (session.bootstrapped || []).find(b => b.slot === slot);
  return entry ? { ref: entry, tier: 'bootstrapped' } : null;
}

function getSkillsArray(entry, tier) {
  if (tier === 'bubble') return entry.skills || [];
  return entry.config?.skills || [];
}

function setSkillsArray(entry, tier, skills) {
  if (tier === 'bubble') entry.skills = skills;
  else entry.config.skills = skills;
}

async function cmdSessionCreate(name, flags) {
  const error = validateSessionName(name);
  if (error) { console.error(`Error: ${error}`); exit(1); }

  const sessionPath = resolveSessionPath(name);
  if (await fileExists(sessionPath)) {
    console.error(`Session "${name}" already exists.`);
    exit(1);
  }

  // Read current companion name for display
  let bubbleName = '(your hatched companion)';
  try {
    const config = await readConfig();
    if (config.companion?.name) bubbleName = config.companion.name;
  } catch { /* no existing config */ }

  const session = {
    session: name,
    description: '',
    driver: { role: 'claude-code', awareness: ['roster', 'skills', 'addressed-names'] },
    bubbleBuddy: { slot: 'primary', skills: [] },
    bootstrapped: [],
    almanac: defaultAlmanac(),
  };

  await writeSession(name, session);
  console.log(`  \x1b[32mSession "${name}" created.\x1b[0m`);
  console.log(`  Tier 1 (Driver):  Claude Code`);
  console.log(`  Tier 2 (Bubble):  ${bubbleName} in primary slot (identity from config)`);
  console.log(`  Tier 3:           (none — add with 'session add-buddy')`);
  console.log('');
  console.log('  Add bubble skills: node buddy-config.mjs session set-skill ' + name + ' primary meditate');
  console.log('  Add bootstrapped:  node buddy-config.mjs session add-buddy ' + name);
}

async function cmdSessionList(flags) {
  const sessions = await listSessionFiles();
  const config = await readConfig().catch(() => ({}));
  const active = config.activeSession || null;
  const bubbleName = config.companion?.name || '(bubble)';

  if (sessions.length === 0) {
    console.log('  No sessions found. Create one: node buddy-config.mjs session create <name>');
    return;
  }

  if (flags.json) {
    const entries = [];
    for (const name of sessions) {
      try {
        const s = await readSession(name);
        const buddies = getSessionBuddies(s);
        entries.push({
          name,
          active: name === active,
          tiers: { driver: 'claude-code', bubble: bubbleName, bootstrapped: (s.bootstrapped || []).map(b => b.config.name) },
          description: s.description || '',
        });
      } catch { entries.push({ name, error: 'unreadable' }); }
    }
    console.log(JSON.stringify(entries, null, 2));
    return;
  }

  console.log(`  Found ${sessions.length} session${sessions.length === 1 ? '' : 's'}:\n`);
  for (const name of sessions) {
    try {
      const s = await readSession(name);
      const marker = name === active ? ' \x1b[32m(active)\x1b[0m' : '';
      const bubbleSkills = s.bubbleBuddy?.skills?.length ? ` [${s.bubbleBuddy.skills.join(',')}]` : '';
      const bootNames = (s.bootstrapped || []).map(b => {
        const skills = b.config.skills?.length ? ` [${b.config.skills.join(',')}]` : '';
        return `${b.config.name}${skills}`;
      });
      const roster = [`${bubbleName}${bubbleSkills}`, ...bootNames].join(' + ');
      console.log(`  ${name}${marker} — ${roster}`);
      if (s.description) console.log(`    ${s.description}`);
    } catch {
      console.log(`  ${name} (unreadable)`);
    }
  }
}

async function cmdSessionShow(name, flags) {
  const session = await readSession(name);
  const config = await readConfig().catch(() => ({}));
  const isActive = config.activeSession === name;
  const bubbleName = config.companion?.name || '(hatched companion)';

  if (flags.json) {
    console.log(JSON.stringify({ ...session, active: isActive, resolvedBubbleName: bubbleName }, null, 2));
    return;
  }

  console.log(`  \x1b[1mSession:\x1b[0m ${session.session}${isActive ? ' \x1b[32m(active)\x1b[0m' : ''}`);
  if (session.description) console.log(`  \x1b[1mDescription:\x1b[0m ${session.description}`);
  console.log('');

  // Tier 1 — Driver
  console.log('  \x1b[1m[Tier 1 — Driver]\x1b[0m Claude Code');
  console.log(`    Awareness: ${(session.driver?.awareness || []).join(', ')}`);
  console.log('');

  // Tier 2 — Bubble Buddy
  const bubbleSkills = (session.bubbleBuddy?.skills || [])
    .map(s => { const def = session.almanac?.[s]; return `${s} (${def?.mode || '?'})`; })
    .join(', ') || '(none)';
  console.log(`  \x1b[1m[Tier 2 — Bubble Buddy]\x1b[0m ${bubbleName} (${session.bubbleBuddy?.slot || 'primary'})`);
  console.log('    Identity: from ~/.claude/.claude.json (hash-derived)');
  console.log(`    Skills: ${bubbleSkills}`);
  console.log('');

  // Tier 3 — Bootstrapped
  if ((session.bootstrapped || []).length === 0) {
    console.log('  \x1b[1m[Tier 3 — Bootstrapped]\x1b[0m (none)');
  } else {
    for (const b of session.bootstrapped) {
      const skills = (b.config.skills || [])
        .map(s => { const def = session.almanac?.[s]; return `${s} (${def?.mode || '?'})`; })
        .join(', ') || '(none)';
      console.log(`  \x1b[1m[Tier 3 — ${b.slot}]\x1b[0m ${b.config.name} — ${b.config.species}`);
      console.log(`    Personality: ${b.config.personality.slice(0, 80)}${b.config.personality.length > 80 ? '...' : ''}`);
      console.log(`    Skills: ${skills}`);
      console.log('');
    }
  }

  console.log('  \x1b[2mAlmanac skills: meditate (active), dream (passive), breath (active)\x1b[0m');
}

async function cmdSessionActivate(name, flags) {
  // Verify session exists
  await readSession(name);

  const config = await readConfig();
  const oldSession = config.activeSession || null;

  if (oldSession === name) {
    console.log(`  Session "${name}" is already active.`);
    return;
  }

  if (!flags.noBackup) {
    const bp = await createBackup();
    if (bp) console.log(`  Backup: ${basename(bp)}`);
  }

  config.activeSession = name;
  await writeConfig(config);
  console.log(`  \x1b[32mActivated session "${name}".\x1b[0m`);
  if (oldSession) console.log(`  Previous: ${oldSession}`);
  console.log('  Takes effect on next Claude Code session.');
}

async function cmdSessionAddBuddy(sessionName, flags) {
  const session = await readSession(sessionName);
  const bootstrapped = session.bootstrapped || [];

  if (bootstrapped.length >= 2) {
    console.error('Maximum 2 bootstrapped buddies per session (secondary + tertiary).');
    exit(1);
  }

  const usedSlots = bootstrapped.map(b => b.slot);
  const nextSlot = ['secondary', 'tertiary'].find(s => !usedSlots.includes(s));

  const rl = createInterface({ input: stdin, output: stdout });
  try {
    const name = await rl.question('  Buddy name (1-14 chars): ');
    const nameErr = validateName(name);
    if (nameErr) { console.error(`Error: ${nameErr}`); exit(1); }

    const species = await rl.question('  Species (owl, mushroom, ghost, axolotl, robot, etc.): ');
    const personality = await rl.question('  Personality (max 200 chars): ');
    const persErr = validatePersonality(personality);
    if (persErr) { console.error(`Error: ${persErr}`); exit(1); }

    const skillInput = await rl.question(`  Skills (comma-separated, from: ${VALID_SKILLS.join(', ')}): `);
    const skills = skillInput.split(',').map(s => s.trim()).filter(Boolean);
    for (const s of skills) {
      const err = validateSkill(s);
      if (err) { console.error(`Error: ${err}`); exit(1); }
    }

    if (!session.bootstrapped) session.bootstrapped = [];
    session.bootstrapped.push({
      slot: nextSlot,
      config: { name, personality, species: species || 'owl', skills },
    });

    await writeSession(sessionName, session);
    console.log(`  \x1b[32mAdded ${name} to ${nextSlot} slot (Tier 3 — bootstrapped).\x1b[0m`);
  } finally {
    rl.close();
  }
}

async function cmdSessionRemoveBuddy(sessionName, slot, flags) {
  if (slot === 'primary') {
    console.error('Cannot remove the bubble buddy (primary slot). It is always present.');
    console.error('Use "session set-skill" to change its skills, or "mute" to disable it.');
    exit(1);
  }

  const err = validateSlot(slot);
  if (err) { console.error(`Error: ${err}`); exit(1); }

  const session = await readSession(sessionName);
  const bootstrapped = session.bootstrapped || [];
  const idx = bootstrapped.findIndex(b => b.slot === slot);
  if (idx === -1) {
    console.error(`No bootstrapped buddy in slot "${slot}".`);
    exit(1);
  }

  const removed = bootstrapped[idx].config.name;

  if (!(await confirm(`Remove ${removed} from ${slot}?`, flags))) {
    console.log('Cancelled.');
    return;
  }

  session.bootstrapped.splice(idx, 1);
  await writeSession(sessionName, session);
  console.log(`  \x1b[32mRemoved ${removed} from ${slot} (Tier 3).\x1b[0m`);
}

async function cmdSessionSetSkill(sessionName, slot, skill) {
  const slotErr = validateSlot(slot);
  if (slotErr) { console.error(`Error: ${slotErr}`); exit(1); }
  const skillErr = validateSkill(skill);
  if (skillErr) { console.error(`Error: ${skillErr}`); exit(1); }

  const session = await readSession(sessionName);
  const found = findSlotEntry(session, slot);
  if (!found) { console.error(`No buddy in slot "${slot}".`); exit(1); }

  const skills = getSkillsArray(found.ref, found.tier);
  if (skills.includes(skill)) {
    const label = found.tier === 'bubble' ? '(bubble buddy)' : found.ref.config.name;
    console.log(`  ${label} already has ${skill}.`);
    return;
  }

  skills.push(skill);
  setSkillsArray(found.ref, found.tier, skills);
  await writeSession(sessionName, session);
  const label = found.tier === 'bubble' ? 'Bubble buddy' : found.ref.config.name;
  console.log(`  \x1b[32m${label} learned ${skill}.\x1b[0m`);
}

async function cmdSessionUnsetSkill(sessionName, slot, skill) {
  const slotErr = validateSlot(slot);
  if (slotErr) { console.error(`Error: ${slotErr}`); exit(1); }
  const skillErr = validateSkill(skill);
  if (skillErr) { console.error(`Error: ${skillErr}`); exit(1); }

  const session = await readSession(sessionName);
  const found = findSlotEntry(session, slot);
  if (!found) { console.error(`No buddy in slot "${slot}".`); exit(1); }

  const skills = getSkillsArray(found.ref, found.tier);
  if (!skills.includes(skill)) {
    const label = found.tier === 'bubble' ? '(bubble buddy)' : found.ref.config.name;
    console.log(`  ${label} doesn't have ${skill}.`);
    return;
  }

  const filtered = skills.filter(s => s !== skill);
  setSkillsArray(found.ref, found.tier, filtered);
  await writeSession(sessionName, session);
  const label = found.tier === 'bubble' ? 'Bubble buddy' : found.ref.config.name;
  console.log(`  \x1b[32m${label} forgot ${skill}.\x1b[0m`);
}

async function cmdSessionPreset(presetName, flags) {
  if (!BUILTIN_PRESETS.includes(presetName)) {
    console.error(`Unknown preset "${presetName}". Available: ${BUILTIN_PRESETS.join(', ')}`);
    exit(1);
  }

  const sessionPath = resolveSessionPath(presetName);
  if (await fileExists(sessionPath)) {
    console.error(`Session "${presetName}" already exists. Delete it first or choose another name.`);
    exit(1);
  }

  // Load from bundled presets (adjacent to this script)
  const scriptDir = new URL('.', import.meta.url).pathname;
  const presetPath = join(scriptDir, 'sessions', `${presetName}.json`);

  if (!(await fileExists(presetPath))) {
    throw new Error(`Preset file not found at ${presetPath}. Reinstall buddy-config.`);
  }

  const raw = await readFile(presetPath, 'utf-8');
  const preset = JSON.parse(raw);

  const dir = resolveSessionDir();
  await mkdir(dir, { recursive: true });
  await writeSession(presetName, preset);

  const buddies = preset.slots.map(s => s.config.name).join(', ');
  console.log(`  \x1b[32mPreset "${presetName}" installed.\x1b[0m`);
  console.log(`  Buddies: ${buddies}`);
  console.log(`  Activate: node buddy-config.mjs session activate ${presetName}`);
}

async function cmdSession(subcommand, args, flags) {
  switch (subcommand) {
    case 'create':       await cmdSessionCreate(args[0], flags); break;
    case 'list':         await cmdSessionList(flags); break;
    case 'show':         await cmdSessionShow(args[0], flags); break;
    case 'activate':     await cmdSessionActivate(args[0], flags); break;
    case 'add-buddy':    await cmdSessionAddBuddy(args[0], flags); break;
    case 'remove-buddy': await cmdSessionRemoveBuddy(args[0], args[1], flags); break;
    case 'set-skill':    await cmdSessionSetSkill(args[0], args[1], args[2]); break;
    case 'unset-skill':  await cmdSessionUnsetSkill(args[0], args[1], args[2]); break;
    case 'preset':       await cmdSessionPreset(args[0], flags); break;
    default:
      console.error(`Unknown session subcommand: ${subcommand}`);
      console.log('  Available: create, list, show, activate, add-buddy, remove-buddy, set-skill, unset-skill, preset');
      exit(1);
  }
}

// --- Help ---

function showHelp() {
  console.log(`
\x1b[1mbuddy-config\x1b[0m — Read and modify Claude Code companion config

\x1b[1mUsage:\x1b[0m node buddy-config.mjs <command> [options]

\x1b[1mCommands:\x1b[0m
  show                    Show current companion state
  rename <new-name>       Change companion name (1-14 chars, single word)
  personality <text>      Change companion personality (max 200 chars)
  mute                    Mute companion (stops all network calls)
  unmute                  Unmute companion
  backup                  Create a manual backup
  restore [timestamp]     Restore companion from backup (latest if omitted)
  list-backups            List available backups with timestamps

\x1b[1mSession Commands:\x1b[0m
  session create <name>                   Create multi-buddy session
  session list                            List saved sessions
  session show <name>                     Show session roster and skills
  session activate <name>                 Set session as active
  session add-buddy <session>             Add buddy to session (interactive)
  session remove-buddy <session> <slot>   Remove buddy from slot
  session set-skill <session> <slot> <skill>    Assign almanac skill
  session unset-skill <session> <slot> <skill>  Remove almanac skill
  session preset <name>                   Install preset (deep-focus, debug-squad, dream-lab)

\x1b[1mAlmanac Skills:\x1b[0m
  meditate    Grounding moments during pauses (active, 60s cooldown)
  dream       Lateral observations after milestones (passive, 120s cooldown)
  breath      Paced breathing during frustration (active, 45s cooldown)

\x1b[1mOptions:\x1b[0m
  --no-backup             Skip auto-backup before write operations
  --force                 Skip confirmation prompts
  --config-dir <path>     Override config directory (default: ~/.claude)
  --json                  Output in JSON format
  --help, -h              Show this help

\x1b[2mNote: Species, rarity, stats, eyes, hat, and shiny cannot be changed.
They are deterministically derived from your account ID hash each session.\x1b[0m
`);
}

// --- Main ---

async function main() {
  const { command, args, flags } = parseArgs();

  if (flags.help || !command) { showHelp(); exit(command ? 0 : 1); }

  try {
    switch (command) {
      case 'show':         await cmdShow(flags); break;
      case 'rename':       await cmdRename(args.join(' '), flags); break;
      case 'personality':  await cmdPersonality(args.join(' '), flags); break;
      case 'mute':         await cmdMute(flags); break;
      case 'unmute':       await cmdUnmute(flags); break;
      case 'backup':       await cmdBackup(); break;
      case 'restore':      await cmdRestore(args[0], flags); break;
      case 'list-backups': await cmdListBackups(flags); break;
      case 'session':      await cmdSession(args[0], args.slice(1), flags); break;
      default:
        console.error(`Unknown command: ${command}`);
        showHelp();
        exit(1);
    }
  } catch (err) {
    console.error(`\x1b[31mError:\x1b[0m ${err.message}`);
    exit(1);
  }
}

main();
