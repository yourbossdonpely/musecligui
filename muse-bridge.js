// muse-bridge.js v2.5.2 — WebSocket bridge + OpenAI-compatible HTTP API for the Muse CLI.
// WS protocol: client sends {id, action, ...}; server replies {id, type:'result', ...}
// for requests, and streams {id, type:'exec-*'} events for agent runs.
// HTTP API (localhost only, bearer key): GET /v1/models, POST /v1/chat/completions.
const WebSocket = require('ws');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const http = require('http');

const PORT = process.env.MUSE_BRIDGE_PORT || 8765;
const VERSION = '2.5.2';

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
    try { child = spawn(file, args, { shell: !!opts.shell, cwd: opts.cwd || process.cwd(), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }); } catch (e) { resolve({ code: -1, stdout: '', stderr: String((e && e.message) || e) }); return; }
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
}// ---------------- shared agent runner ----------------
// Spawns `muse exec --json` and parses the JSONL stream. Used by BOTH the
// WebSocket bridge and the HTTP API so behavior can never drift apart.
function buildPrompt(msg, cmd) {
  const parts = [];
  if (msg.mode === 'plan') parts.push('MODE: You are in READ-ONLY PLANNING mode. Explore the codebase and propose a concrete plan. Do not modify any files and do not run shell commands that change state.');
  if (msg.mode === 'research') parts.push('MODE: Deep-research mode. Use your web tools to research thoroughly. Answer with findings and cite sources as URLs for key claims.');
  if (msg.mode === 'debug') parts.push('MODE: Debugging. Reproduce the reported issue, find the root cause, apply the smallest correct fix, then verify with tests or a reproduction. Explain what was wrong.');
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

function textOfContent(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.filter((p) => p && p.type === 'text' && typeof p.text === 'string').map((p) => p.text).join('\n');
  return '';
}

// OpenAI messages[] -> one prompt. Drops oldest turns past ~120k chars (keeps system).
function promptFromMessages(messages) {
  const sys = [];
  let turns = [];
  for (const m of messages.slice(-40)) {
    const text = textOfContent(m.content).slice(0, 20000);
    if (!text.trim()) continue;
    if (m.role === 'system') sys.push(text);
    else if (m.role === 'assistant') turns.push('Muse: ' + text);
    else turns.push('User: ' + text);
  }
  let size = sys.join('\n').length + turns.join('\n').length;
  while (turns.length > 2 && size > 120000) {
    const dropped = turns.shift();
    size -= (dropped ? dropped.length : 0) + 1;
  }
  const parts = [];
  if (sys.length) parts.push('[System instructions]\n' + sys.join('\n\n'));
  if (turns.length) parts.push('[Conversation]\n' + turns.join('\n\n'));
  return parts.join('\n\n');
}

function runAgentRun({ commandArgs, cwd, promptText, timeoutMs = 600000, onEvent = () => {} }) {
  const promptFile = path.join(os.tmpdir(), 'muse-prompt-' + crypto.randomBytes(8).toString('hex') + '.txt');
  try {
    fs.writeFileSync(promptFile, promptText, 'utf8');
  } catch (e) {
    return { promise: Promise.resolve({ text: '(no output)', exitCode: null, terminal: 'failed', reason: 'Cannot write prompt file: ' + e.message, usage: null, counts: { events: 0, deltas: 0, tools: 0, logs: 0 } }), kill: () => {} };
  }
  let child = null;
  let timer = null;
  const rec = { deltas: '', final: null, usage: null, counts: { events: 0, deltas: 0, tools: 0, logs: 0 }, done: false };
  const promise = new Promise((resolve) => {
    const finish = (end) => {
      if (rec.done) return;
      rec.done = true;
      clearTimeout(timer);
      try { fs.unlinkSync(promptFile); } catch (e) {}
      const text = (rec.final && rec.final.text) || rec.deltas || '(no output)';
      const failed = end.error || (typeof end.exitCode === 'number' && end.exitCode !== 0 && !rec.final);
      resolve({
        text,
        exitCode: end.exitCode != null ? end.exitCode : null,
        terminal: (rec.final && rec.final.terminal) || (failed ? 'failed' : 'completed'),
        reason: (rec.final && rec.final.reason) || end.error || null,
        usage: rec.usage || null,
        stats: rec.counts,
      });
    };
    const handleLine = (line) => {
      let ev;
      try { ev = JSON.parse(line); } catch (e) {
        onEvent({ t: 'log', text: line.slice(0, 2000) });
        return;
      }
      rec.counts.events++;
      const p = ev.payload || {};
      const pt = ev.payload_type || '';
      if (pt === 'run.output.delta' && typeof p.text === 'string') {
        rec.deltas += p.text;
        rec.counts.deltas++;
        onEvent({ t: 'delta', text: p.text });
      } else if (pt === 'run.usage') {
        rec.usage = p;
        onEvent({ t: 'usage', usage: p });
      } else if (pt.indexOf('run.terminal.') === 0) {
        rec.final = { terminal: p.terminal || pt.slice(13), text: p.text || '', reason: p.reason || null };
      } else if (pt.indexOf('task.lifecycle.') === 0) {
        const e = p.event || {};
        rec.counts.tools++;
        onEvent({ t: 'tool', taskId: p.task_id || e.task_id || null, name: e.operation || e.task_kind || p.task_kind || 'task', event: e.kind || pt.slice(15), raw: ev });
      }
    };
    try {
      child = spawnMuse(['exec', '--json', '--prompt-file', promptFile, ...commandArgs], { cwd });
    } catch (e) {
      finish({ error: 'Failed to start Muse: ' + e.message });
      return;
    }
    onEvent({ t: 'start', pid: (child && child.pid) || null });
    let buf = '';
    child.stdout.on('data', (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (line) handleLine(line);
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
        if (line && rec.counts.logs < 100) {
          rec.counts.logs++;
          onEvent({ t: 'log', text: line.slice(0, 2000) });
        }
      }
      if (ebuf.length > 200000) ebuf = ebuf.slice(-200000);
    });
    timer = setTimeout(() => {
      try { child.kill(); } catch (e) {}
      finish({ error: 'Timed out after 10 minutes' });
    }, timeoutMs);
    child.on('error', (e) => finish({ error: 'Muse process error: ' + ((e && e.message) || e) }));
    child.on('close', (code) => {
      const rest = buf.trim();
      if (rest) handleLine(rest);
      finish({ exitCode: code });
    });
  });
  return { promise, kill: (sig) => { try { if (child) child.kill(sig); } catch (e) {} } };
}

let modelsCache = { at: 0, data: null };
async function getModels() {
  if (modelsCache.data && Date.now() - modelsCache.at < 600000) return { models: modelsCache.data, cached: true };
  const r = await runMuse(['exec', '--list-models'], { cwd: __dirname, timeout: 90000 });
  if (r.code !== 0) throw new Error('--list-models failed: ' + ((r.stderr || r.stdout) || ('exit ' + r.code)).slice(0, 500));
  const models = r.stdout.split('\n').map((s) => s.trim()).filter((s) => cleanSlug(s));
  modelsCache = { at: Date.now(), data: models };
  return { models, cached: false };
}

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

function sumUsage(u) {
  let inp = 0;
  let out = 0;
  const mods = (u && u.models) || [];
  mods.forEach((x) => {
    inp += x.input_tokens || 0;
    out += x.output_tokens || 0;
  });
  return { inp, out };
}// ---------------- exec (streaming, over WebSocket) ----------------
const running = new Map(); // socket -> { id, legacy, kill }

function finishExec(socket, rec, end) {
  const text = end.text;
  const failed = end.terminal === 'failed';
  if (rec.legacy) {
    send(socket, failed ? { type: 'error', text: end.reason || ('exit code ' + end.exitCode) } : { type: 'output', text });
    return;
  }
  send(socket, { id: rec.id, type: 'exec-done', text, exitCode: end.exitCode, terminal: end.terminal, reason: end.reason, usage: end.usage, stats: end.stats });
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

  const prompt = buildPrompt(msg, cmd);
  const rest = [];
  if (provider !== 'meta') rest.push('--provider', provider);
  if (model) rest.push('--model', model);
  if (effort) rest.push('--reasoning-effort', effort);
  if (contributor) rest.push('--contributor-mode', contributor);
  if (sessionId) rest.push('--session-id', sessionId);
  if (maxSteps) rest.push('--max-model-steps', String(maxSteps));
  if (f.yolo) { rest.push('--yolo'); }
  else {
    rest.push('--approval-mode', approvalMode);
    if (f.trustWorkspace !== false) rest.push('--trust-workspace');
    if (f.sandbox === false) rest.push('--disable-sandbox');
    else if (sandboxNetwork) rest.push('--sandbox-network', sandboxNetwork);
    if (f.write === false) rest.push('--disable-write');
    if (f.shell === false) rest.push('--disable-shell');
  }
  if (f.webTools === false) rest.push('--disable-web-tools');

  console.log('exec: "' + cmd.slice(0, 100) + '" | cwd=' + cwd + ' | model=' + (model || 'default') + ' | mode=' + (msg.mode || 'build'));
  const rec = { id, legacy, kill: () => {} };
  running.set(socket, rec);
  const { promise, kill } = runAgentRun({
    commandArgs: rest,
    cwd,
    promptText: prompt,
    onEvent: (ev) => {
      if (legacy) return;
      if (ev.t === 'start') send(socket, { id, type: 'exec-start', pid: ev.pid });
      else if (ev.t === 'delta') send(socket, { id, type: 'exec-delta', text: ev.text });
      else if (ev.t === 'tool') send(socket, { id, type: 'exec-tool', taskId: ev.taskId, name: ev.name, event: ev.event, raw: ev.raw });
      else if (ev.t === 'usage') send(socket, { id, type: 'exec-usage', usage: ev.usage });
      else if (ev.t === 'log') send(socket, { id, type: 'exec-log', text: ev.text });
    },
  });
  rec.kill = kill;
  const end = await promise;
  if (running.get(socket) === rec) running.delete(socket);
  console.log('exec done: terminal=' + end.terminal + ' exit=' + (end.exitCode != null ? end.exitCode : '?') + ' deltas=' + end.stats.deltas + ' tools=' + end.stats.tools + (end.reason && end.terminal === 'failed' ? ' error=' + String(end.reason).slice(0, 200) : ''));
  finishExec(socket, rec, end);
}

function handleStop(socket, msg) {
  const rec = running.get(socket);
  if (!rec) { send(socket, { id: msg.id || null, type: 'result', action: 'stop', ok: true, data: { stopped: false } }); return; }
  try { rec.kill(); } catch (e) {}
  setTimeout(() => { try { if (running.get(socket) === rec) rec.kill('SIGKILL'); } catch (e) {} }, 3000);
  send(socket, { id: msg.id || null, type: 'result', action: 'stop', ok: true, data: { stopped: true } });
}

// ---------------- buffered actions ----------------
async function handleBuffered(socket, msg, action) {
  const id = msg.id || null;
  const ok = (data) => send(socket, { id, type: 'result', action, ok: true, data });
  const bad = (error) => send(socket, { id, type: 'result', action, ok: false, error: String(error) });
  try {
    if (action === 'ping') return ok({ version: VERSION, muse: MUSE.label });
    if (action === 'api-info') {
      if (!apiEnabled) return ok({ enabled: false, url: null, key: null });
      return ok({ enabled: true, url: 'http://127.0.0.1:' + apiPort + '/v1', key: API_KEY });
    }
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
      return ok(await getModels());
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
    if (action === 'fs-drives') {
      const drives = [];
      if (process.platform === 'win32') {
        for (let c = 65; c <= 90; c++) {
          const d = String.fromCharCode(c) + ':\\';
          try { if (fs.existsSync(d)) drives.push({ path: d, label: 'Drive ' + String.fromCharCode(c) }); } catch (e) {}
        }
        drives.push({ path: os.homedir(), label: 'Home' });
      } else {
        drives.push({ path: '/', label: 'Root' });
      }
      return ok({ drives });
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
    if (action === 'git-diff') {
      const cwd = msg.cwd;
      if (typeof cwd !== 'string' || !cwd) throw new Error('No folder');
      const args = ['diff', '--no-color', '--'];
      if (typeof msg.rel === 'string' && msg.rel) {
        if (msg.rel.charAt(0) === '-' || msg.rel.length > 500) throw new Error('Invalid path');
        args.push(msg.rel);
      }
      const r = await runCmd('git', args, { cwd, timeout: 20000 });
      if (r.code !== 0) return ok({ repo: false });
      return ok({ repo: true, diff: r.stdout.slice(0, 100000), truncated: r.stdout.length > 100000 });
    }
    if (action === 'mcp-add') {
      const name = cleanSlug(msg.name);
      if (!name) throw new Error('Invalid server name');
      const scope = msg.scope === 'project' ? 'project' : 'user';
      let args;
      if (typeof msg.url === 'string' && msg.url.trim()) {
        if (!/^https?:\/\/[^/\s]+/.test(msg.url.trim())) throw new Error('Invalid URL (http/https only)');
        args = ['mcp', 'add', name, '--url', msg.url.trim(), '--' + scope];
      } else if (Array.isArray(msg.command) && msg.command.length) {
        if (msg.command.length > 20 || !msg.command.every((x) => typeof x === 'string' && x && x.length < 500)) throw new Error('Invalid command');
        args = ['mcp', 'add', name, '--' + scope, '--', ...msg.command];
      } else throw new Error('Provide url or command');
      const r = await runMuse(args, { cwd: __dirname, timeout: 60000 });
      if (r.code !== 0) throw new Error('mcp add failed: ' + ((r.stdout + '\n' + r.stderr) || ('exit ' + r.code)).slice(0, 800));
      return ok({ name, output: (r.stdout || '').slice(0, 1000) });
    }
    if (action === 'mcp-remove') {
      const name = cleanSlug(msg.name);
      if (!name) throw new Error('Invalid server name');
      const scope = msg.scope === 'project' ? 'project' : 'user';
      const r = await runMuse(['mcp', 'remove', name, '--' + scope], { cwd: __dirname, timeout: 60000 });
      if (r.code !== 0) throw new Error('mcp remove failed: ' + ((r.stdout + '\n' + r.stderr) || ('exit ' + r.code)).slice(0, 800));
      return ok({ name, output: (r.stdout || '').slice(0, 1000) });
    }
    if (action === 'mcp-get') {
      const name = cleanSlug(msg.name);
      if (!name) throw new Error('Invalid server name');
      const r = await runMuse(['mcp', 'get', name, '--json'], { cwd: __dirname, timeout: 60000 });
      if (r.code !== 0) throw new Error('mcp get failed: ' + ((r.stderr || r.stdout) || ('exit ' + r.code)).slice(0, 500));
      try { return ok(JSON.parse(r.stdout)); } catch (e) { return ok({ raw: r.stdout.slice(0, 2000) }); }
    }
    if (action === 'pick-folder') {
      const startIn = typeof msg.startIn === 'string' && msg.startIn ? msg.startIn : os.homedir();
      if (process.env.MUSE_PICKER_CMD) {
        const sh = process.platform === 'win32' ? 'cmd.exe' : '/bin/sh';
        const shArgs = process.platform === 'win32' ? ['/d', '/s', '/c', process.env.MUSE_PICKER_CMD] : ['-c', process.env.MUSE_PICKER_CMD];
        const r = await runCmd(sh, shArgs, { timeout: 15000 });
        const out = (r.stdout || '').trim().split(/\r?\n/)[0] || '';
        if (!out) return ok({ cancelled: true });
        return ok({ path: out });
      }
      if (process.platform === 'win32') {
        const ps = "Add-Type -AssemblyName System.Windows.Forms; $d = New-Object System.Windows.Forms.FolderBrowserDialog; $d.Description = 'Select project folder'; $d.SelectedPath = '" + startIn.replace(/'/g, "''") + "'; $d.ShowNewFolderButton = $true; if ($d.ShowDialog() -eq 'OK') { $d.SelectedPath }";
        const r = await runCmd('powershell.exe', ['-NoProfile', '-STA', '-Command', ps], { timeout: 150000 });
        const out = (r.stdout || '').trim();
        if (!out) return ok({ cancelled: true });
        return ok({ path: out });
      }
      if (process.platform === 'darwin') {
        const r = await runCmd('osascript', ['-e', 'POSIX path of (choose folder default location "' + startIn.replace(/"/g, '') + '")'], { timeout: 150000 });
        const out = (r.stdout || '').trim();
        if (r.code !== 0 || !out) return ok({ cancelled: true });
        return ok({ path: out });
      }
      let r = await runCmd('zenity', ['--file-selection', '--directory', '--title=Select project folder'], { timeout: 150000 });
      if (r.code !== 0 && /ENOENT|not found/i.test(r.stderr || '')) r = await runCmd('kdialog', ['--getexistingdirectory', '.'], { timeout: 150000 });
      const out = (r.stdout || '').trim();
      if (r.code !== 0 || !out) return ok({ cancelled: true });
      return ok({ path: out });
    }
    return bad('Unknown action: ' + action);
  } catch (e) { return bad(e.message || e); }
}// ---------------- OpenAI-compatible HTTP API ----------------
// Localhost only + bearer key. Lets OpenCode, FreeBuff and friends use the
// subscription through the official CLI. Disable with MUSE_API_PORT=0.
const API_PORT_RAW = process.env.MUSE_API_PORT || '8766';
const apiEnabled = API_PORT_RAW !== '0' && API_PORT_RAW.toLowerCase() !== 'off';
const apiPort = parseInt(API_PORT_RAW, 10) || 8766;
const API_KEY_FILE = path.join(__dirname, '.muse-api-key');
function ensureApiKey() {
  if (process.env.MUSE_API_KEY) return process.env.MUSE_API_KEY;
  try {
    const k = fs.readFileSync(API_KEY_FILE, 'utf8').trim();
    if (k) return k;
  } catch (e) {}
  const k = 'mk-' + crypto.randomBytes(24).toString('hex');
  try {
    fs.writeFileSync(API_KEY_FILE, k + '\n');
  } catch (e) {}
  return k;
}
const API_KEY = ensureApiKey();
const API_ROOT = process.env.MUSE_API_ROOT || process.cwd();
const API_SCRATCH_ROOT = path.join(__dirname, 'api-runs');
let apiActiveRuns = 0;
const API_MAX_RUNS = 3;

function apiJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}
function apiErr(res, code, message, type) {
  apiJson(res, code, { error: { message: String(message).slice(0, 2000), type: type || 'api_error', code: null } });
}
function readBody(req, cap) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > cap) {
        reject(new Error('Body too large'));
        try { req.destroy(); } catch (e) {}
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function handleApi(req, res) {
  const url = new URL(req.url || '/', 'http://127.0.0.1');
  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/health')) {
    return apiJson(res, 200, { status: 'ok', app: 'muse-cli-gui', version: VERSION });
  }
  const auth = String(req.headers['authorization'] || '');
  if (auth !== 'Bearer ' + API_KEY) return apiErr(res, 401, 'Invalid API key', 'auth_error');
  if (req.method === 'GET' && url.pathname === '/v1/models') {
    try {
      const { models } = await getModels();
      return apiJson(res, 200, {
        object: 'list',
        data: models.map((id) => ({ id, object: 'model', created: Math.floor(Date.now() / 1000), owned_by: 'muse' })),
      });
    } catch (e) {
      return apiErr(res, 500, e.message || e, 'server_error');
    }
  }
  if (req.method === 'POST' && url.pathname === '/v1/chat/completions') {
    let body;
    try {
      body = JSON.parse(await readBody(req, 1024 * 1024));
    } catch (e) {
      return apiErr(res, 400, 'Invalid JSON body: ' + e.message, 'invalid_request');
    }
    const messages = body && body.messages;
    if (!Array.isArray(messages) || !messages.length) return apiErr(res, 400, 'messages must be a non-empty array', 'invalid_request');
    const model = body.model ? cleanSlug(String(body.model)) : null;
    if (body.model && !model) return apiErr(res, 400, 'Invalid model id', 'invalid_request');
    if (apiActiveRuns >= API_MAX_RUNS) {
      res.setHeader('Retry-After', '30');
      return apiErr(res, 429, 'Too many concurrent agent runs (max ' + API_MAX_RUNS + ')', 'rate_limit');
    }
    let cwd = null;
    let scratch = false;
    const metaCwd = body.metadata && body.metadata.cwd;
    if (typeof metaCwd === 'string' && metaCwd) {
      if (!path.isAbsolute(metaCwd)) return apiErr(res, 400, 'metadata.cwd must be an absolute path', 'invalid_request');
      cwd = metaCwd;
    } else {
      scratch = true;
      try { fs.mkdirSync(API_SCRATCH_ROOT, { recursive: true }); } catch (e) { return apiErr(res, 500, 'Cannot create API scratch dir', 'server_error'); }
      try { cwd = fs.mkdtempSync(path.join(API_SCRATCH_ROOT, 'run-')); } catch (e) { return apiErr(res, 500, 'Cannot create API run dir', 'server_error'); }
    }
    if (tempInside(cwd)) return apiErr(res, 400, 'Refusing cwd: the OS temp folder is inside it (the Muse runtime fails there)', 'invalid_request');
    const prompt = promptFromMessages(messages);
    if (!prompt.trim()) return apiErr(res, 400, 'messages contain no text', 'invalid_request');
    const rest = ['--yolo', '--trust-workspace'];
    if (model) rest.push('--model', model);
    const t0 = Date.now();
    console.log('api chat: model=' + (model || 'default') + ' msgs=' + messages.length + ' stream=' + (!!body.stream) + ' cwd=' + cwd);
    apiActiveRuns++;
    const finish = () => {
      apiActiveRuns = Math.max(0, apiActiveRuns - 1);
      if (scratch && cwd) { try { fs.rmSync(cwd, { recursive: true, force: true }); } catch (e) {} }
    };
    if (body.stream) {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      const id = 'chatcmpl-' + crypto.randomBytes(8).toString('hex');
      const created = Math.floor(Date.now() / 1000);
      const sendChunk = (delta, finish, usage) => {
        if (!res.writableEnded && !res.destroyed) res.write('data: ' + JSON.stringify({ id, object: 'chat.completion.chunk', created, model: model || 'muse-default', choices: [{ index: 0, delta, finish_reason: finish || null }], ...(usage ? { usage } : {}) }) + '\n\n');
      };
      let settled = false;
      const hb = setInterval(() => {
        if (!settled && !res.writableEnded && !res.destroyed) res.write(': ping\n\n');
      }, 15000);
      const { promise, kill } = runAgentRun({
        commandArgs: rest,
        cwd,
        promptText: prompt,
        onEvent: (ev) => {
          if (ev.t === 'delta') sendChunk({ content: ev.text });
        },
      });
      req.on('close', () => {
        if (!settled) {
          settled = true;
          clearInterval(hb);
          try { kill(); } catch (e) {}
          finish();
        }
      });
      try {
        const end = await promise;
        if (!settled) {
          settled = true;
          clearInterval(hb);
          const su = sumUsage(end.usage);
          const sUsage = (su.inp + su.out) > 0 ? { prompt_tokens: su.inp, completion_tokens: su.out, total_tokens: su.inp + su.out } : null;
          if (end.terminal === 'failed') sendChunk({ content: '(agent run failed: ' + (end.reason || 'unknown error').slice(0, 300) + ')' });
          sendChunk({}, 'stop', sUsage);
          if (!res.writableEnded && !res.destroyed) res.write('data: [DONE]\n\n');
          res.end();
          const u = sumUsage(end.usage);
          console.log('api chat done: terminal=' + end.terminal + ' ms=' + (Date.now() - t0) + ' in=' + u.inp + ' out=' + u.out);
        }
      } catch (e) {
        if (!settled) {
          settled = true;
          clearInterval(hb);
          try { res.end(); } catch (x) {}
        }
      } finally {
        finish();
      }
      return;
    }
    let settled = false;
    const { promise, kill } = runAgentRun({ commandArgs: rest, cwd, promptText: prompt, onEvent: () => {} });
    req.on('close', () => {
      if (!settled) {
        settled = true;
        try { kill(); } catch (e) {}
      }
    });
    try {
      const end = await promise;
      settled = true;
      finish();
      if (res.writableEnded || res.destroyed) return;
      const u = sumUsage(end.usage);
      console.log('api chat done: terminal=' + end.terminal + ' ms=' + (Date.now() - t0) + ' in=' + u.inp + ' out=' + u.out);
      if (end.terminal === 'failed') return apiErr(res, 500, end.reason || 'Agent run failed', 'server_error');
      return apiJson(res, 200, {
        id: 'chatcmpl-' + crypto.randomBytes(8).toString('hex'),
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: model || 'muse-default',
        choices: [{ index: 0, message: { role: 'assistant', content: end.text }, finish_reason: 'stop' }],
        usage: { prompt_tokens: u.inp, completion_tokens: u.out, total_tokens: u.inp + u.out },
      });
    } catch (e) {
      settled = true;
      finish();
      if (!res.writableEnded && !res.destroyed) return apiErr(res, 500, e.message || e, 'server_error');
    }
    return;
  }
  return apiErr(res, 404, 'Unknown endpoint: ' + url.pathname, 'not_found');
}

function startApi() {
  if (!apiEnabled) {
    console.log('Muse API disabled (MUSE_API_PORT=0)');
    return;
  }
  try {
    const server = http.createServer((req, res) => {
      handleApi(req, res).catch((e) => {
        try { apiErr(res, 500, e.message || e, 'server_error'); } catch (x) {}
      });
    });
    server.on('error', (e) => console.log('API server failed (bridge WS still running): ' + (e.message || e)));
    server.listen(apiPort, '127.0.0.1', () => console.log('Muse API on http://127.0.0.1:' + apiPort + ' (localhost only, key required)'));
  } catch (e) {
    console.log('API server failed (bridge WS still running): ' + (e.message || e));
  }
}

// ---------------- servers ----------------
const wss = new WebSocket.Server({ port: PORT });
console.log('Muse Bridge v' + VERSION + ' running on ws://localhost:' + PORT);
console.log('Using Muse CLI: ' + MUSE.label);
startApi();

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
      try { rec.kill(); } catch (e) {}
      running.delete(socket);
    }
  });
});