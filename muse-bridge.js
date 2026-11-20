// muse-bridge.js v2 — WebSocket bridge between muse-gui.html and the Muse CLI.
// Protocol: client sends {id, action, ...}; server replies {id, type:'result', ...}
// for requests, and streams {id, type:'exec-*'} events for agent runs.
const WebSocket = require('ws');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const PORT = process.env.MUSE_BRIDGE_PORT || 8765;
const VERSION = '2.0.0';

// ---------------- muse executable ----------------
// Prefer the versioned native exe directly (clean argv, no shell quoting issues).
// MUSE_CMD override: path to .cmd/.bat/.exe, or a .js stub (run with node, for tests).
function resolveMuse() {
  const over = process.env.MUSE_CMD;
  if (over) {
    if (/\.js$/i.test(over)) return { file: process.execPath, prefix: [over], shell: false, label: over };
    return { file: over, prefix: [], shell: /(\.cmd|\.bat)$/i.test(over), label: over };
  }
  const dir = path.join(process.env.LOCALAPPDATA || '', 'Programs', 'muse');
  try {
    const exes = fs.readdirSync(dir)
      .filter((f) => /^muse-bin-.*\.exe$/i.test(f))
      .map((f) => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t);
    if (exes.length) return { file: path.join(dir, exes[0].f), prefix: [], shell: false, label: exes[0].f };
  } catch (e) { /* fall through */ }
  const cmd = path.join(dir, 'muse.cmd');
  if (fs.existsSync(cmd)) return { file: cmd, prefix: [], shell: true, label: cmd };
  return { file: 'muse', prefix: [], shell: true, label: 'muse (PATH)' };
}
const MUSE = resolveMuse();

// ---------------- validation ----------------
const ALLOW = {
  provider: new Set(['meta', 'echo']),
  effort: new Set(['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra']),
  approvalMode: new Set(['untrusted', 'on-request', 'never']),
  sandboxNetwork: new Set(['restricted', 'enabled', 'proxy-only']),
  contributor: new Set(['on', 'off']),
  scope: new Set(['user', 'project', 'built-in', 'plugin']),
};
function cleanSlug(v) {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,120}$/.test(s) ? s : null;
}
function cleanInt(v, min, max) {
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
}
function inside(root, p) {
  const r = path.resolve(root).toLowerCase();
  const q = path.resolve(root, p).toLowerCase();
  return q === r || q.startsWith(r + path.sep);
}
function tempInside(dir) {
  const d = path.resolve(dir).toLowerCase();
  const tmps = [process.env.TMPDIR, process.env.TEMP, process.env.TMP, os.tmpdir()].filter(Boolean);
  return tmps.some((t) => {
    const r = path.relative(d, path.resolve(t).toLowerCase());
    return r === '' || (!r.startsWith('..') && !path.isAbsolute(r));
  });
}

// ---------------- process helpers ----------------
function spawnMuse(args, opts = {}) {
  return spawn(MUSE.file, [...(MUSE.prefix || []), ...args], {
    shell: MUSE.shell, cwd: opts.cwd || process.cwd(), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
}
function runMuse(args, opts = {}) {
  return new Promise((resolve) => {
    let child;
    try { child = spawnMuse(args, opts); } catch (e) { resolve({ code: -1, stdout: '', stderr: String((e && e.message) || e) }); return; }
    let stdout = '', stderr = '';
    const t = setTimeout(() => { try { child.kill(); } catch (e) {} }, opts.timeout || 90000);
    child.stdout.on('data', (d) => { stdout += d; if (stdout.length > 3000000) { try { child.kill(); } catch (e) {} } });
    child.stderr.on('data', (d) => { stderr += d; if (stderr.length > 200000) stderr = stderr.slice(-200000); });
    child.on('error', (e) => { clearTimeout(t); resolve({ code: -1, stdout, stderr: String((e && e.message) || e) }); });
    child.on('close', (code) => { clearTimeout(t); resolve({ code, stdout, stderr }); });
  });
}
function runCmd(file, args, opts = {}) {
  return new Promise((resolve) => {
    let child;
    try { child = spawn(file, args, { shell: false, cwd: opts.cwd || process.cwd(), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }); } catch (e) { resolve({ code: -1, stdout: '', stderr: String((e && e.message) || e) }); return; }
    let stdout = '', stderr = '';
    const t = setTimeout(() => { try { child.kill(); } catch (e) {} }, opts.timeout || 15000);
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('error', (e) => { clearTimeout(t); resolve({ code: -1, stdout, stderr: String((e && e.message) || e) }); });
    child.on('close', (code) => { clearTimeout(t); resolve({ code, stdout, stderr }); });
  });
}

function send(socket, obj) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(obj));
}
function fail(socket, msg, action, error) {
  console.log('reject ' + action + ': ' + String(error).slice(0, 300));
  send(socket, { id: msg.id || null, type: 'result', action, ok: false, error: String(error) });
}

// ---------------- exec (streaming) ----------------
const running = new Map(); // socket -> record

function buildPrompt(msg, cmd) {
  const parts = [];
  if (msg.mode === 'plan') parts.push('MODE: You are in READ-ONLY PLANNING mode. Explore the codebase and propose a concrete plan. Do not modify any files and do not run shell commands that change state.');
  if (msg.mode === 'research') parts.push('MODE: Deep-research mode. Use your web tools to research thoroughly. Answer with findings and cite sources as URLs for key claims.');
  if (Array.isArray(msg.history) && msg.history.length) {
    parts.push('[Previous conversation — for context only]');
    for (const h of msg.history.slice(-12)) {
      const role = h && h.role === 'muse' ? 'Muse' : 'User';
      parts.push(role + ': ' + String((h && h.text) || '').slice(0, 4000));
    }
    parts.push('[New request]');
  }
  if (typeof msg.context === 'string' && msg.context.trim()) {
    parts.push('[Attached file context]\n' + msg.context.slice(0, 30000));
  }
  parts.push(cmd);
  return parts.join('\n\n');
}

function handleJsonLine(socket, rec, line) {
  let ev;
  try { ev = JSON.parse(line); } catch (e) {
    if (!rec.legacy) send(socket, { id: rec.id, type: 'exec-log', text: line.slice(0, 2000) });
    return;
  }
  rec.counts.events++;
  const p = ev.payload || {};
  const pt = ev.payload_type || '';
  if (pt === 'run.output.delta' && typeof p.text === 'string') {
    rec.deltas += p.text; rec.counts.deltas++;
    if (!rec.legacy) send(socket, { id: rec.id, type: 'exec-delta', text: p.text });
  } else if (pt === 'run.usage') {
    rec.usage = p;
    if (!rec.legacy) send(socket, { id: rec.id, type: 'exec-usage', usage: p });
  } else if (pt.indexOf('run.terminal.') === 0) {
    rec.final = { terminal: p.terminal || pt.slice(13), text: p.text || '', reason: p.reason || null };
  } else if (pt.indexOf('task.lifecycle.') === 0) {
    const e = p.event || {};
    rec.counts.tools++;
    if (!rec.legacy) send(socket, { id: rec.id, type: 'exec-tool', taskId: p.task_id || e.task_id || null, name: e.operation || e.task_kind || p.task_kind || 'task', event: e.kind || pt.slice(15), raw: ev });
  }
}

function finishExec(socket, rec, end) {
  if (rec.done) return; rec.done = true;
  clearTimeout(rec.timer);
  try { fs.unlinkSync(rec.promptFile); } catch (e) {}
  if (running.get(socket) === rec) running.delete(socket);
  const text = (rec.final && rec.final.text) || rec.deltas || '(no output)';
  console.log('exec done: terminal=' + ((rec.final && rec.final.terminal) || '?') + ' exit=' + (end.exitCode != null ? end.exitCode : '?') + ' deltas=' + rec.counts.deltas + ' tools=' + rec.counts.tools + (end.error ? ' error=' + String(end.error).slice(0, 200) : ''));
  const failed = end.error || (typeof end.exitCode === 'number' && end.exitCode !== 0 && !rec.final);
  if (rec.legacy) {
    send(socket, failed
      ? { type: 'error', text: end.error || ('exit code ' + end.exitCode) }
      : { type: 'output', text });
    return;
  }
  send(socket, { id: rec.id, type: 'exec-done', text, exitCode: end.exitCode != null ? end.exitCode : null, terminal: (rec.final && rec.final.terminal) || (failed ? 'failed' : 'completed'), reason: (rec.final && rec.final.reason) || end.error || null, usage: rec.usage || null, stats: rec.counts });
}

async function handleExec(socket, msg) {
  const id = msg.id || null;
  const legacy = !msg.action;
  if (running.has(socket)) {
    if (legacy) send(socket, { type: 'error', text: 'An agent run is already in progress. Stop it first.' });
    else send(socket, { id, type: 'result', action: 'exec', ok: false, error: 'An agent run is already in progress. Stop it first.' });
    return;
  }
  const cmd = typeof msg.command === 'string' ? msg.command.trim() : '';
  if (!cmd) { legacy ? send(socket, { type: 'error', text: 'No command provided' }) : fail(socket, msg, 'exec', 'No command provided'); return; }
  const cwd = typeof msg.cwd === 'string' && msg.cwd ? msg.cwd : process.cwd();
  if (tempInside(cwd)) {
    const err = 'Refusing to run: the OS temp folder is inside "' + cwd + '" (the Muse runtime fails there). Pick a project folder outside it.';
    legacy ? send(socket, { type: 'error', text: err }) : fail(socket, msg, 'exec', err);
    return;
  }
  const provider = ALLOW.provider.has(msg.provider) ? msg.provider : 'meta';
  const model = msg.model ? cleanSlug(msg.model) : null;
  if (msg.model && !model) { fail(socket, msg, 'exec', 'Invalid model id'); return; }
  const effort = msg.effort ? (ALLOW.effort.has(msg.effort) ? msg.effort : null) : null;
  if (msg.effort && !effort) { fail(socket, msg, 'exec', 'Invalid reasoning effort'); return; }
  const contributor = msg.contributor ? (ALLOW.contributor.has(msg.contributor) ? msg.contributor : null) : null;
  if (msg.contributor && !contributor) { fail(socket, msg, 'exec', 'Invalid contributor mode'); return; }
  const sessionId = msg.sessionId ? cleanSlug(msg.sessionId) : null;
  if (msg.sessionId && !sessionId) { fail(socket, msg, 'exec', 'Invalid session id'); return; }
  const maxSteps = msg.maxSteps != null ? cleanInt(msg.maxSteps, 1, 1000) : null;
  if (msg.maxSteps != null && maxSteps == null) { fail(socket, msg, 'exec', 'Invalid max steps (1-1000)'); return; }
  const f = msg.flags || {};
  const approvalMode = ALLOW.approvalMode.has(f.approvalMode) ? f.approvalMode : 'never';
  const sandboxNetwork = ALLOW.sandboxNetwork.has(f.sandboxNetwork) ? f.sandboxNetwork : null;

  console.log('exec: "' + cmd.slice(0, 100) + '" | cwd=' + cwd + ' | model=' + (model || 'default') + ' | mode=' + (msg.mode || 'build'));
  const promptFile = path.join(os.tmpdir(), 'muse-prompt-' + crypto.randomBytes(8).toString('hex') + '.txt');
  try { fs.writeFileSync(promptFile, buildPrompt(msg, cmd), 'utf8'); } catch (e) { fail(socket, msg, 'exec', 'Cannot write prompt file: ' + e.message); return; }

  const args = ['exec', '--json', '--prompt-file', promptFile];
  if (provider !== 'meta') args.push('--provider', provider);
  if (model) args.push('--model', model);
  if (effort) args.push('--reasoning-effort', effort);
  if (contributor) args.push('--contributor-mode', contributor);
  if (sessionId) args.push('--session-id', sessionId);
  if (maxSteps) args.push('--max-model-steps', String(maxSteps));
  if (f.yolo) { args.push('--yolo'); }
  else {
    args.push('--approval-mode', approvalMode);
    if (f.trustWorkspace !== false) args.push('--trust-workspace');
    if (f.sandbox === false) args.push('--disable-sandbox');
    else if (sandboxNetwork) args.push('--sandbox-network', sandboxNetwork);
    if (f.write === false) args.push('--disable-write');
    if (f.shell === false) args.push('--disable-shell');
  }
  if (f.webTools === false) args.push('--disable-web-tools');

  let child;
  try { child = spawnMuse(args, { cwd }); } catch (e) {
    try { fs.unlinkSync(promptFile); } catch (x) {}
    const err = 'Failed to start Muse: ' + e.message;
    legacy ? send(socket, { type: 'error', text: err }) : fail(socket, msg, 'exec', err);
    return;
  }
  const rec = { child, id, legacy, promptFile, done: false, deltas: '', final: null, usage: null, counts: { events: 0, deltas: 0, tools: 0, logs: 0 }, timer: null };
  running.set(socket, rec);
  if (!legacy) send(socket, { id, type: 'exec-start', pid: child.pid || null });

  let buf = '';
  child.stdout.on('data', (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (line) handleJsonLine(socket, rec, line);
    }
    if (buf.length > 1000000) buf = buf.slice(-1000000);
  });
  let ebuf = '';
  child.stderr.on('data', (d) => {
    ebuf += d;
    let i;
    while ((i = ebuf.indexOf('\n')) >= 0) {
      const line = ebuf.slice(0, i).trim();
      ebuf = ebuf.slice(i + 1);
      if (line && rec.counts.logs < 100 && !legacy) { rec.counts.logs++; send(socket, { id: rec.id, type: 'exec-log', text: line.slice(0, 2000) }); }
    }
    if (ebuf.length > 200000) ebuf = ebuf.slice(-200000);
  });
  rec.timer = setTimeout(() => { try { child.kill(); } catch (e) {} finishExec(socket, rec, { error: 'Timed out after 10 minutes' }); }, 600000);
  child.on('error', (e) => finishExec(socket, rec, { error: 'Muse process error: ' + ((e && e.message) || e) }));
  child.on('close', (code) => {
    const rest = buf.trim();
    if (rest) handleJsonLine(socket, rec, rest);
    finishExec(socket, rec, { exitCode: code });
  });
}

function handleStop(socket, msg) {
  const rec = running.get(socket);
  if (!rec) { send(socket, { id: msg.id || null, type: 'result', action: 'stop', ok: true, data: { stopped: false } }); return; }
  try { rec.child.kill(); } catch (e) {}
  setTimeout(() => { try { if (!rec.done) rec.child.kill('SIGKILL'); } catch (e) {} }, 3000);
  send(socket, { id: msg.id || null, type: 'result', action: 'stop', ok: true, data: { stopped: true } });
}

// ---------------- buffered actions ----------------
let modelsCache = { at: 0, data: null };
function parseUsage(out) {
  const data = { tier: null, window: null, weekly: null, raw: String(out).trim().slice(0, 1000) };
  for (const line of String(out).split('\n')) {
    const t = line.trim();
    if (t.indexOf('Tier:') === 0) data.tier = t.slice(5).trim();
    else if (t.indexOf('Window:') === 0) data.window = t.slice(7).trim();
    else if (t.indexOf('Weekly:') === 0) data.weekly = t.slice(7).trim();
  }
  return data;
}

async function handleBuffered(socket, msg, action) {
  const id = msg.id || null;
  const ok = (data) => send(socket, { id, type: 'result', action, ok: true, data });
  const bad = (error) => send(socket, { id, type: 'result', action, ok: false, error: String(error) });
  try {
    if (action === 'ping') return ok({ version: VERSION, muse: MUSE.label });
    if (action === 'skills-list') {
      const r = await runMuse(['skills', 'list', '--source', 'all', '--json'], { cwd: __dirname, timeout: 120000 });
      if (r.code !== 0) throw new Error('skills list failed: ' + (r.stderr || ('exit ' + r.code)).slice(0, 500));
      const j = JSON.parse(r.stdout);
      const skills = ((j && j.skills) || []).slice(0, 400).map((s) => ({ id: s.id, name: s.display_name || s.name || s.id, scope: s.scope || 'user', activation: s.activation || 'on', desc: String(s.short_description || s.description || '').replace(/\s+/g, ' ').slice(0, 180), warnings: Array.isArray(s.diagnostics) ? s.diagnostics.length : 0 }));
      return ok({ skills, count: ((j && j.skills) || []).length });
    }
    if (action === 'skills-set') {
      const sid = cleanSlug(msg.skillId);
      if (!sid) throw new Error('Invalid skill id');
      const scope = ALLOW.scope.has(msg.scope) ? msg.scope : 'user';
      const verb = msg.enabled === false ? 'disable' : 'enable';
      const r = await runMuse(['skills', verb, sid, '--scope', scope, '--json'], { cwd: __dirname, timeout: 60000 });
      if (r.code !== 0) throw new Error('skills ' + verb + ' failed: ' + ((r.stdout + '\n' + r.stderr) || ('exit ' + r.code)).slice(0, 800));
      return ok({ id: sid, enabled: verb === 'enable', output: (r.stdout || '').slice(0, 1000) });
    }
    if (action === 'models-list') {
      if (modelsCache.data && Date.now() - modelsCache.at < 600000) return ok({ models: modelsCache.data, cached: true });
      const r = await runMuse(['exec', '--list-models'], { cwd: __dirname, timeout: 90000 });
      if (r.code !== 0) throw new Error('--list-models failed: ' + ((r.stderr || r.stdout) || ('exit ' + r.code)).slice(0, 500));
      const models = r.stdout.split('\n').map((s) => s.trim()).filter((s) => cleanSlug(s));
      modelsCache = { at: Date.now(), data: models };
      return ok({ models, cached: false });
    }
    if (action === 'usage') {
      const r = await runMuse(['usage'], { cwd: __dirname, timeout: 60000 });
      if (r.code !== 0) throw new Error('usage failed: ' + ((r.stderr || r.stdout) || ('exit ' + r.code)).slice(0, 500));
      return ok(parseUsage(r.stdout));
    }
    if (action === 'mcp-list') {
      const r = await runMuse(['mcp', 'list', '--json'], { cwd: __dirname, timeout: 60000 });
      if (r.code !== 0) throw new Error('mcp list failed: ' + ((r.stderr || r.stdout) || ('exit ' + r.code)).slice(0, 500));
      try { return ok(JSON.parse(r.stdout)); } catch (e) { return ok({ raw: r.stdout.slice(0, 2000) }); }
    }
    if (action === 'sessions-list') {
      const r = await runMuse(['sessions', '--json'], { cwd: __dirname, timeout: 60000 });
      if (r.code !== 0) throw new Error('sessions failed: ' + ((r.stderr || r.stdout) || ('exit ' + r.code)).slice(0, 500));
      try { return ok(JSON.parse(r.stdout)); } catch (e) { return ok({ raw: r.stdout.slice(0, 2000) }); }
    }
    if (action === 'fs-list') {
      const root = msg.root;
      const rel = msg.rel || '';
      if (typeof root !== 'string' || !root) throw new Error('No root folder');
      if (!inside(root, rel)) throw new Error('Path escapes project root');
      const dir = path.resolve(root, rel);
      const ents = fs.readdirSync(dir, { withFileTypes: true });
      const out = [];
      for (const e of ents.slice(0, 1000)) {
        const full = path.join(dir, e.name);
        let size = null;
        if (e.isFile()) { try { size = fs.statSync(full).size; } catch (x) {} }
        out.push({ name: e.name, type: e.isDirectory() ? 'dir' : (e.isFile() ? 'file' : 'other'), size });
      }
      out.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : (a.type === 'dir' ? -1 : 1)));
      return ok({ path: dir, entries: out });
    }
    if (action === 'fs-read') {
      const root = msg.root;
      const rel = msg.rel || '';
      if (typeof root !== 'string' || !root || !rel) throw new Error('No file');
      if (!inside(root, rel)) throw new Error('Path escapes project root');
      const full = path.resolve(root, rel);
      const st = fs.statSync(full);
      if (!st.isFile()) throw new Error('Not a file');
      if (st.size > 200 * 1024) throw new Error('File too large to preview (' + st.size + ' bytes)');
      const content = fs.readFileSync(full, 'utf8');
      if (content.indexOf('\0') >= 0) throw new Error('Binary file — cannot preview as text');
      return ok({ path: full, size: st.size, content });
    }
    if (action === 'git-status') {
      const cwd = typeof msg.cwd === 'string' && msg.cwd ? msg.cwd : null;
      if (!cwd) throw new Error('No folder');
      const r = await runCmd('git', ['status', '--short'], { cwd, timeout: 15000 });
      if (r.code !== 0) return ok({ repo: false });
      return ok({ repo: true, lines: r.stdout.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 60) });
    }
    return bad('Unknown action: ' + action);
  } catch (e) { return bad(e.message || e); }
}

// ---------------- server ----------------
const wss = new WebSocket.Server({ port: PORT });
console.log('Muse Bridge v' + VERSION + ' running on ws://localhost:' + PORT);
console.log('Using Muse CLI: ' + MUSE.label);

wss.on('connection', (socket) => {
  console.log('GUI connected');
  socket.on('message', async (data) => {
    let msg;
    try { msg = JSON.parse(data); } catch (e) { send(socket, { id: null, type: 'result', action: '?', ok: false, error: 'Invalid message: ' + e.message }); return; }
    try {
      const action = msg.action || (msg.command ? 'exec' : null);
      if (action === 'exec') { await handleExec(socket, msg); return; }
      if (action === 'stop') { handleStop(socket, msg); return; }
      if (!action) { fail(socket, msg, '?', 'Unknown message: no action or command'); return; }
      await handleBuffered(socket, msg, action);
    } catch (e) { fail(socket, msg, msg.action || '?', (e && e.message) || e); }
  });
  socket.on('close', () => {
    const rec = running.get(socket);
    if (rec) {
      try { rec.child.kill(); } catch (e) {}
      clearTimeout(rec.timer);
      try { fs.unlinkSync(rec.promptFile); } catch (e) {}
      running.delete(socket);
    }
  });
});