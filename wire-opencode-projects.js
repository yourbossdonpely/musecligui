'use strict';
// wire-opencode-projects.js - auto-wire every known OpenCode project directory
// with the muse cwd body merge, so API agents run in the session's own folder.
// Reads project dirs from OpenCode's SQLite store (read-only). Skips home dir,
// temp, missing dirs, and projects already wired. Run by setup.ps1 stage 2.
// Test override: WIRE_TEST_DIRS="dir1;dir2" replaces DB discovery.
const fs = require('fs');
const os = require('os');
const path = require('path');

function log(m) { console.log('[wire] ' + m); }

function discover() {
  if (process.env.WIRE_TEST_DIRS) return process.env.WIRE_TEST_DIRS.split(';').filter(Boolean);
  const dbPath = path.join(os.homedir(), '.local', 'share', 'opencode', 'opencode.db');
  if (!fs.existsSync(dbPath)) { log('no opencode.db, nothing to do'); return []; }
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(dbPath, { readonly: true });
  const dirs = new Set();
  try {
    for (const r of db.prepare('SELECT DISTINCT directory FROM session_v2 WHERE directory IS NOT NULL').all()) dirs.add(r.directory);
    try {
      for (const r of db.prepare('SELECT DISTINCT directory FROM project_directory').all()) dirs.add(r.directory);
    } catch (e) { /* older schema */
    }
  } finally { db.close(); }
  return [...dirs];
}

function needsWire(dir) {
  const cfg = path.join(dir, 'opencode.json');
  if (!fs.existsSync(cfg)) return 'missing';
  try {
    const c = JSON.parse(fs.readFileSync(cfg, 'utf8'));
    const cwd = c && c.providers && c.providers.muse && c.providers.muse.body && c.providers.muse.body.metadata && c.providers.muse.body.metadata.cwd;
    if (typeof cwd === 'string' && cwd) return 'ok';
    return 'merge';
  } catch (e) { return 'broken'; }
}

function writeCfg(dir, mode) {
  const cfg = path.join(dir, 'opencode.json');
  const body = { metadata: { cwd: dir } };
  if (mode === 'merge') {
    const bak = cfg + '.bak-' + new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
    fs.copyFileSync(cfg, bak);
    const c = JSON.parse(fs.readFileSync(cfg, 'utf8'));
    c.providers = c.providers || {};
    c.providers.muse = c.providers.muse || {};
    c.providers.muse.body = body;
    if (!c.$schema) c.$schema = 'https://opencode.ai/config.json';
    fs.writeFileSync(cfg, JSON.stringify(c, null, 2));
    log('merged ' + cfg);
  } else {
    const c = { $schema: 'https://opencode.ai/config.json', providers: { muse: { body } } };
    fs.writeFileSync(cfg, JSON.stringify(c, null, 2));
    log('wrote ' + cfg);
  }
}

(function main() {
  const home = os.homedir().toLowerCase();
  const tmp = os.tmpdir().toLowerCase();
  let wired = 0, skipped = 0;
  for (const raw of discover()) {
    const dir = path.normalize(raw);
    const low = dir.toLowerCase();
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) { log('skip (missing): ' + raw); skipped++; continue; }
    if (low === home || low.startsWith(tmp)) { log('skip (home/temp): ' + raw); skipped++; continue; }
    const st = needsWire(dir);
    if (st === 'ok') { log('skip (wired): ' + raw); skipped++; continue; }
    if (st === 'broken') { log('skip (broken json, left alone): ' + raw); skipped++; continue; }
    try { writeCfg(dir, st); wired++; } catch (e) { log('FAIL ' + raw + ': ' + e.message); }
  }
  log('done wired=' + wired + ' skipped=' + skipped);
})()
