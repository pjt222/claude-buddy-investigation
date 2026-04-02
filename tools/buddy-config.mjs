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
