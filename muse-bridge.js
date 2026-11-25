// muse-bridge.js v2.7.0 — WebSocket bridge + OpenAI-compatible HTTP API for the Muse CLI.
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
const VERSION = '2.7.0';
// Name the console window so it is obvious what it is and that closing it stops the bridge.
try { process.title = 'Muse Bridge :' + PORT + ' (close this window to stop)'; } catch (e) {}
// Paused from the GUI footer (bridge-stop): runs are refused, process stays up for bridge-start.
let bridgePaused = false;

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
function modePrefix(mode) {
  if (mode === 'plan') return 'MODE: You are in READ-ONLY PLANNING mode. Explore the codebase and propose a concrete plan. Do not modify any files and do not run shell commands that change state.';
  if (mode === 'research') return 'MODE: Deep-research mode. Use your web tools to research thoroughly. Answer with findings and cite sources as URLs for key claims.';
  if (mode === 'debug') return 'MODE: Debugging. Reproduce the reported issue, find the root cause, apply the smallest correct fix, then verify with tests or a reproduction. Explain what was wrong.';
  return '';
}
function buildPrompt(msg, cmd) {
  const parts = [];
  const pre = modePrefix(msg.mode);
  if (pre) parts.push(pre);
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
}
// Tokens as seen from the API client's own context window, estimated at the
// standard ~4 chars/token. The CLI's internal input total is deliberately NOT
// reported: it carries ~38k of invisible baseline (its own system/tools) on
// every call, which corrupts the client's context meter and accumulates
// phantom tokens turn after turn (measured live: 38,066 in / 192 out for a
// one-word reply to a 10-word prompt). CLI reals stay in the bridge log.
function estTokens(s) {
  return Math.max(1, Math.ceil(String(s || '').length / 4));
}
function apiUsage(promptText, replyText) {
  const prompt_tokens = estTokens(promptText);
  const completion_tokens = estTokens(replyText);
  return { prompt_tokens, completion_tokens, total_tokens: prompt_tokens + completion_tokens };
}
// Execution modes for API clients (mirrors the GUI modes). The muse-cwd
// OpenCode plugin sends the session agent as x-muse-mode; per-request
// metadata.mode overrides it.
const API_MODES = { build: 1, supervised: 1, plan: 1, research: 1, debug: 1 };
function apiFlagsForMode(mode, model) {
  const rest = [];
  if (mode === 'build' || mode === 'debug') rest.push('--yolo', '--trust-workspace');
  else if (mode === 'supervised' || mode === 'research') rest.push('--approval-mode', 'never', '--trust-workspace', '--sandbox-network', 'proxy-only');
  else if (mode === 'plan') rest.push('--approval-mode', 'never', '--trust-workspace', '--disable-write', '--disable-shell');
  if (model) rest.push('--model', model);
  return rest;
}// ---------------- exec (streaming, over WebSocket) ----------------
const running = new Map(); // execId -> { socket, kill }
const MAX_WS_RUNS = 3;
function socketRunCount(socket) {
  let n = 0;
  for (const r of running.values()) if (r.socket === socket) n++;
  return n;
}

function finishExec(socket, id, legacy, end) {
  const text = end.text;
  const failed = end.terminal === 'failed';
  if (legacy) {
    send(socket, failed ? { type: 'error', text: end.reason || ('exit code ' + end.exitCode) } : { type: 'output', text });
    return;
  }
  send(socket, { id, type: 'exec-done', text, exitCode: end.exitCode, terminal: end.terminal, reason: end.reason, usage: end.usage, stats: end.stats });
}

async function handleExec(socket, msg) {
  const legacy = !msg.action;
  const id = msg.id || ('legacy-' + crypto.randomBytes(4).toString('hex'));
  if (bridgePaused) {
    const err = 'Bridge is stopped. Click Start in the GUI footer to resume.';
    legacy ? send(socket, { type: 'error', text: err }) : fail(socket, msg, 'exec', err);
    return;
  }
  if (socketRunCount(socket) >= MAX_WS_RUNS) {
    const err = 'Maximum ' + MAX_WS_RUNS + ' concurrent runs. Stop one first.';
    legacy ? send(socket, { type: 'error', text: err }) : send(socket, { id: msg.id || null, type: 'result', action: 'exec', ok: false, error: err });
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
  const cpId = await makeCheckpoint(cwd);
  const rec = { socket, kill: () => {} };
  running.set(id, rec);
  const { promise, kill } = runAgentRun({
    commandArgs: rest,
    cwd,
    promptText: prompt,
    onEvent: (ev) => {
      if (legacy) return;
      if (ev.t === 'start') send(socket, { id, type: 'exec-start', pid: ev.pid, checkpoint: cpId });
      else if (ev.t === 'delta') send(socket, { id, type: 'exec-delta', text: ev.text });
      else if (ev.t === 'tool') send(socket, { id, type: 'exec-tool', taskId: ev.taskId, name: ev.name, event: ev.event, raw: ev.raw });
      else if (ev.t === 'usage') send(socket, { id, type: 'exec-usage', usage: ev.usage });
      else if (ev.t === 'log') send(socket, { id, type: 'exec-log', text: ev.text });
    },
  });
  rec.kill = kill;
  const end = await promise;
  if (running.get(id) === rec) running.delete(id);
  if (!legacy) {
    try {
      const dg = await diagnoseFolder(cwd);
      if (dg.repo && dg.issues.length) send(socket, { id, type: 'exec-diagnostics', issues: dg.issues, checked: dg.checked });
    } catch (e) {}
  }
  console.log('exec done: terminal=' + end.terminal + ' exit=' + (end.exitCode != null ? end.exitCode : '?') + ' deltas=' + end.stats.deltas + ' tools=' + end.stats.tools + (end.reason && end.terminal === 'failed' ? ' error=' + String(end.reason).slice(0, 200) : ''));
  finishExec(socket, id, legacy, end);
}

function handleStop(socket, msg) {
  const only = typeof msg.runId === 'string' && msg.runId ? msg.runId : null;
  const targets = [];
  for (const [eid, rec] of running) {
    if (only ? eid === only : rec.socket === socket) targets.push([eid, rec]);
  }
  if (!targets.length) { send(socket, { id: msg.id || null, type: 'result', action: 'stop', ok: true, data: { stopped: false } }); return; }
  for (const [eid, rec] of targets) {
    try { rec.kill(); } catch (e) {}
    setTimeout(() => { try { if (running.get(eid) === rec) rec.kill('SIGKILL'); } catch (e) {} }, 3000);
  }
  send(socket, { id: msg.id || null, type: 'result', action: 'stop', ok: true, data: { stopped: true, count: targets.length } });
}

// ---------------- diagnostics (fast post-run syntax checks) ----------------
// Zero-install checkers over git-changed files: node --check for JS, in-house
// JSON parse, py_compile for Python, one PowerShell parse pass for .ps1, and
// tsc when it is already available. This is syntax-level triage, not full LSP.
async function diagnoseFolder(cwd) {
  const st = await runCmd('git', ['status', '--short'], { cwd, timeout: 15000 });
  if (st.code !== 0) return { repo: false };
  const files = [];
  for (const line of st.stdout.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    const rel = t.slice(2).trim().replace(/"/g, '');
    if (!rel || rel.endsWith('/')) continue;
    const arrow = rel.indexOf(' -> ');
    files.push(arrow >= 0 ? rel.slice(arrow + 4) : rel);
  }
  const issues = [];
  const skipped = [];
  let checked = 0;
  const push = (file, line, message, tool) => {
    if (issues.length < 50) issues.push({ file, line: line || null, message: String(message).slice(0, 300), tool });
  };
  const ps1batch = [];
  for (const rel of files.slice(0, 20)) {
    if (rel.length > 500 || rel.startsWith('-')) { skipped.push(rel); continue; }
    const full = path.resolve(cwd, rel);
    if (!inside(cwd, rel)) { skipped.push(rel); continue; }
    let stat = null;
    try { stat = fs.statSync(full); } catch (e) { continue; }
    if (!stat.isFile() || stat.size > 1024 * 1024) { skipped.push(rel); continue; }
    const ext = path.extname(rel).toLowerCase();
    if (ext === '.js' || ext === '.mjs' || ext === '.cjs') {
      checked++;
      const r = await runCmd(process.execPath, ['--check', full], { cwd, timeout: 15000 });
      if (r.code !== 0) {
        const m = (r.stderr || '').match(/([^:\n]+):(\d+)\n([\s\S]{1,300})/);
        push(rel, m ? parseInt(m[2], 10) : null, (m ? m[3].trim() : (r.stderr || 'syntax error').trim()).slice(0, 300), 'node');
      }
    } else if (ext === '.json') {
      checked++;
      try { JSON.parse(fs.readFileSync(full, 'utf8')); } catch (e) { push(rel, null, e.message, 'json'); }
    } else if (ext === '.py') {
      checked++;
      let r = await runCmd('py', ['-m', 'py_compile', full], { cwd, timeout: 15000 });
      if (r.code !== 0 && /ENOENT|not recognized|not found/i.test(r.stderr || '')) r = await runCmd('python', ['-m', 'py_compile', full], { cwd, timeout: 15000 });
      if (r.code !== 0 && !/ENOENT|not recognized|not found/i.test(r.stderr || '')) {
        const m = (r.stderr || '').match(/line (\d+)/i);
        const last = (r.stderr || '').trim().split('\n').pop();
        push(rel, m ? parseInt(m[1], 10) : null, last || 'compile error', 'py_compile');
      } else if (r.code !== 0) { checked--; skipped.push(rel); }
    } else if (ext === '.ps1') {
      ps1batch.push(rel);
    } else if (ext === '.ts' || ext === '.tsx' || ext === '.mts' || ext === '.cts') {
      const localTsc = path.join(cwd, 'node_modules', 'typescript', 'bin', 'tsc');
      const tsc = fs.existsSync(localTsc) ? localTsc : 'tsc';
      const args = fs.existsSync(localTsc) ? [localTsc, '--noEmit', '--skipLibCheck', full] : ['--noEmit', '--skipLibCheck', full];
      const bin = fs.existsSync(localTsc) ? process.execPath : tsc;
      checked++;
      const r = await runCmd(bin, args, { cwd, timeout: 60000 });
      if (r.code !== 0 && /ENOENT|not recognized|not found/i.test(r.stderr || '')) { checked--; skipped.push(rel); continue; }
      if (r.code !== 0) {
        const lines = (r.stdout + '\n' + (r.stderr || '')).split('\n').filter((l) => /error TS/i.test(l)).slice(0, 10);
        if (!lines.length) push(rel, null, 'typecheck failed', 'tsc');
        for (const l of lines) {
          const m = l.match(/\((\d+),\d+\):\s*(.*)/);
          push(rel, m ? parseInt(m[1], 10) : null, (m ? m[2] : l).trim(), 'tsc');
        }
      }
    } else {
      skipped.push(rel);
    }
  }
  if (ps1batch.length) {
    checked += ps1batch.length;
    const list = ps1batch.slice(0, 20).map((r) => r.replace(/'/g, "''")).join("','");
    const ps = "$errs=@(); foreach ($f in @('" + list + "')) { $e=$null; [void][System.Management.Automation.Language.Parser]::ParseFile((Join-Path '" + cwd.replace(/'/g, "''") + "' $f), [ref]$null, [ref]$e); foreach ($x in @($e)) { $errs += ($f + '|' + $x.Extent.StartLineNumber + '|' + $x.Message) } }; $errs -join \"`n\"";
    const r = await runCmd('powershell.exe', ['-NoProfile', '-Command', ps], { cwd, timeout: 60000 });
    if (r.code === 0 && r.stdout.trim()) {
      for (const line of r.stdout.trim().split('\n').slice(0, 20)) {
        const parts = line.split('|');
        if (parts.length >= 3) push(parts[0], parseInt(parts[1], 10) || null, parts.slice(2).join('|'), 'powershell');
      }
    }
  }
  return { repo: true, checked, skipped: skipped.slice(0, 20), issues };
}

// ---------------- checkpoints (per-run undo points) ----------------
// Captures the pre-run git state so the GUI can offer one-click undo of an
// agent run. Undo restores tracked files to the pre-run diff; new untracked
// files block undo (listed, never auto-deleted). Memory-only: a bridge
// restart drops old checkpoints.
const checkpoints = new Map(); // id -> { cwd, diff, truncated, files, time }
async function makeCheckpoint(cwd) {
  if (typeof cwd !== 'string' || !cwd) return null;
  const st = await runCmd('git', ['status', '--short'], { cwd, timeout: 15000 });
  if (st.code !== 0) return null;
  const d = await runCmd('git', ['diff', '--no-color'], { cwd, timeout: 20000 });
  if (d.code !== 0) return null;
  const cd = await runCmd('git', ['diff', '--cached', '--quiet'], { cwd, timeout: 15000 });
  const id = 'cp-' + crypto.randomBytes(8).toString('hex');
  const files = st.stdout.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 60);
  checkpoints.set(id, { cwd, diff: d.stdout, truncated: d.stdout.length > 200000, staged: cd.code !== 0, files, time: Date.now() });
  if (checkpoints.size > 50) {
    const oldest = checkpoints.keys().next().value;
    checkpoints.delete(oldest);
  }
  return id;
}
async function undoCheckpoint(id) {
  const cp = checkpoints.get(id);
  if (!cp) throw new Error('Checkpoint not found (bridge may have restarted)');
  if (cp.truncated) throw new Error('Checkpoint diff was too large to be reversible');
  if (cp.staged) throw new Error('There were staged changes at checkpoint time — unstage to use undo');
  const st = await runCmd('git', ['status', '--short'], { cwd: cp.cwd, timeout: 15000 });
  if (st.code !== 0) throw new Error('Not a git repo anymore: ' + cp.cwd);
  const nowFiles = st.stdout.split('\n').map((s) => s.trim()).filter(Boolean);
  const before = new Set(cp.files);
  const fresh = nowFiles.filter((l) => l.startsWith('??') && !before.has(l));
  if (fresh.length) throw new Error('New untracked files since checkpoint (delete or move them first): ' + fresh.slice(0, 5).join(', '));
  await runCmd('git', ['reset', '-q'], { cwd: cp.cwd, timeout: 30000 });
  const cl = await runCmd('git', ['checkout', '--', '.'], { cwd: cp.cwd, timeout: 30000 });
  if (cl.code !== 0) throw new Error('git checkout failed: ' + (cl.stderr || ('exit ' + cl.code)).slice(0, 300));
  if (cp.diff.trim()) {
    const pf = path.join(os.tmpdir(), 'muse-undocp-' + crypto.randomBytes(8).toString('hex') + '.diff');
    try {
      fs.writeFileSync(pf, cp.diff, 'utf8');
      const ap = await runCmd('git', ['apply', pf], { cwd: cp.cwd, timeout: 30000 });
      if (ap.code !== 0) throw new Error('Could not restore pre-run changes (tree is clean, checkpoint kept): ' + (ap.stderr || ('exit ' + ap.code)).slice(0, 300));
    } finally {
      try { fs.unlinkSync(pf); } catch (e) {}
    }
  }
  checkpoints.delete(id);
  return { cwd: cp.cwd, restored: cp.files.length };
}

// ---------------- buffered actions ----------------
async function handleBuffered(socket, msg, action) {
  const id = msg.id || null;
  const ok = (data) => send(socket, { id, type: 'result', action, ok: true, data });
  const bad = (error) => send(socket, { id, type: 'result', action, ok: false, error: String(error) });
  try {
    if (action === 'ping') return ok({ version: VERSION, muse: MUSE.label, paused: bridgePaused });
    if (action === 'bridge-stop') {
      bridgePaused = true;
      let stopped = 0;
      for (const entry of running) { try { entry[1].kill(); stopped++; } catch (e) {} }
      console.log('bridge stopped from GUI (paused, killed ' + stopped + ' run(s))');
      return ok({ paused: true, stoppedRuns: stopped });
    }
    if (action === 'bridge-start') {
      bridgePaused = false;
      console.log('bridge started from GUI (resumed)');
      return ok({ paused: false });
    }
    if (action === 'bridge-shutdown') {
      send(socket, { id, type: 'result', action, ok: true, data: { shutdown: true } });
      console.log('bridge shutdown from GUI');
      setTimeout(() => { try { process.exit(0); } catch (e) {} }, 300);
      return;
    }
    if (action === 'opencode-wire') {
      const dir = typeof msg.path === 'string' ? msg.path.trim() : '';
      if (!dir || !path.isAbsolute(dir)) throw new Error('Provide an absolute folder path');
      let st;
      try { st = fs.statSync(dir); } catch (e) { throw new Error('Folder not found: ' + dir); }
      if (!st.isDirectory()) throw new Error('Not a folder: ' + dir);
      if (tempInside(dir)) throw new Error('Refusing: the OS temp folder is inside "' + dir + '"');
      const cfg = path.join(dir, 'opencode.json');
      const body = { metadata: { cwd: dir } };
      if (fs.existsSync(cfg)) {
        let c;
        try { c = JSON.parse(fs.readFileSync(cfg, 'utf8')); } catch (e) { throw new Error('opencode.json exists but is not valid JSON — fix or delete it first'); }
        const have = c && c.providers && c.providers.muse && c.providers.muse.body && c.providers.muse.body.metadata && c.providers.muse.body.metadata.cwd;
        if (typeof have === 'string' && have) return ok({ path: cfg, status: 'already-wired' });
        const bak = cfg + '.bak-' + new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
        fs.copyFileSync(cfg, bak);
        c.providers = c.providers || {};
        c.providers.muse = c.providers.muse || {};
        c.providers.muse.body = body;
        if (!c.$schema) c.$schema = 'https://opencode.ai/config.json';
        fs.writeFileSync(cfg, JSON.stringify(c, null, 2));
        return ok({ path: cfg, status: 'merged', backup: bak });
      }
      const c = { $schema: 'https://opencode.ai/config.json', providers: { muse: { body } } };
      fs.writeFileSync(cfg, JSON.stringify(c, null, 2));
      return ok({ path: cfg, status: 'wrote' });
    }
    if (action === 'opencode-status') {
      const plugFile = path.join(os.homedir(), '.config', 'opencode', 'plugins', 'muse-cwd', 'index.js');
      let installed = false, current = false;
      try {
        const src = fs.readFileSync(path.join(__dirname, 'opencode-plugin-muse-cwd', 'index.js'), 'utf8');
        installed = fs.existsSync(plugFile);
        if (installed) current = fs.readFileSync(plugFile, 'utf8') === src;
      } catch (e) { try { installed = fs.existsSync(plugFile); } catch (x) {} }
      return ok({ pluginInstalled: installed, pluginCurrent: current, pluginPath: plugFile });
    }
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
    if (action === 'checkpoint-create') {
      const cwd = typeof msg.cwd === 'string' && msg.cwd ? msg.cwd : null;
      if (!cwd) throw new Error('No folder');
      const id = await makeCheckpoint(cwd);
      if (!id) return ok({ repo: false });
      const cp = checkpoints.get(id);
      return ok({ repo: true, id, files: cp.files });
    }
    if (action === 'checkpoint-undo') {
      if (!/^cp-[0-9a-f]{16}$/.test(String(msg.checkpointId || ''))) throw new Error('Invalid checkpoint id');
      return ok(await undoCheckpoint(String(msg.checkpointId)));
    }
    if (action === 'share-create') {
      const msgs = msg.messages;
      if (!Array.isArray(msgs) || !msgs.length || msgs.length > 500) throw new Error('Provide 1-500 messages');
      const clean = [];
      let total = 0;
      for (const m of msgs) {
        const role = m && (m.role === 'user' || m.role === 'muse' || m.role === 'system') ? m.role : null;
        const text = m && typeof m.text === 'string' ? m.text.slice(0, 50000) : '';
        if (!role || !text) continue;
        total += text.length;
        if (total > 1000000) throw new Error('Session too large to share (1MB cap)');
        clean.push({ role, text });
      }
      if (!clean.length) throw new Error('Nothing shareable in this session');
      const id = 'sh-' + crypto.randomBytes(8).toString('hex');
      shares.set(id, {
        title: String(msg.title || 'Shared session').slice(0, 120),
        project: String(msg.project || '').slice(0, 120),
        time: new Date().toISOString(),
        messages: clean,
      });
      if (shares.size > 20) shares.delete(shares.keys().next().value);
      return ok({ id, url: 'http://127.0.0.1:' + apiPort + '/share/' + id });
    }
    if (action === 'summarize') {
      const text = typeof msg.text === 'string' ? msg.text.slice(0, 100000) : '';
      if (!text.trim()) throw new Error('Nothing to summarize');
      const prompt = 'Summarize this coding-session transcript into a compact handoff for continuing the work. ' +
        'Cover: goals, key decisions, files changed and why, current state, and next steps. Under 1500 words. ' +
        'Output ONLY the summary, no preamble.\n\n[Transcript]\n' + text;
      const { promise } = runAgentRun({
        commandArgs: ['--approval-mode', 'never', '--disable-shell', '--disable-write', '--disable-web-tools'],
        cwd: __dirname,
        promptText: prompt,
        timeoutMs: 300000,
        onEvent: () => {},
      });
      const end = await promise;
      if (end.terminal === 'failed' || !end.text || end.text === '(no output)') throw new Error(end.reason || 'Summarizer produced no output');
      return ok({ summary: end.text.slice(0, 20000) });
    }
    if (action === 'diagnose') {
      const cwd = typeof msg.cwd === 'string' && msg.cwd ? msg.cwd : null;
      if (!cwd) throw new Error('No folder');
      return ok(await diagnoseFolder(cwd));
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
function escHtml(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
// Session share pages (localhost only, no key — same trust as /health).
// Memory-only: a bridge restart drops old shares.
const shares = new Map(); // id -> { title, project, time, messages }
function renderShare(sh) {
  const rows = sh.messages.map((m) => {
    const who = m.role === 'muse' ? 'Muse' : m.role === 'user' ? 'You' : 'System';
    const cls = m.role === 'muse' ? 'm' : m.role === 'user' ? 'u' : 's';
    return '<div class="msg ' + cls + '"><div class="who">' + who + '</div><pre>' + escHtml(m.text) + '</pre></div>';
  }).join('\n');
  return '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>' + escHtml(sh.title) + ' — Muse CLI GUI share</title><style>' +
    'body{background:#101010;color:#fafafa;font:14px/1.6 Inter,system-ui,sans-serif;margin:0}' +
    '.wrap{max-width:820px;margin:0 auto;padding:32px 20px}' +
    'h1{font-size:20px;margin:0 0 4px}.sub{color:#808080;font-size:12px;margin-bottom:24px}' +
    '.msg{border:1px solid #282828;border-radius:12px;padding:12px 16px;margin-bottom:12px;background:#161616}' +
    '.msg.u{border-color:#3b5cf6}.who{font-size:11px;font-weight:700;color:#aeaeae;margin-bottom:6px}' +
    '.msg pre{margin:0;white-space:pre-wrap;word-break:break-word;font:13px/1.65 Consolas,monospace}' +
    '</style></head><body><div class="wrap"><h1>' + escHtml(sh.title) + '</h1>' +
    '<div class="sub">' + escHtml(sh.project) + ' · shared ' + escHtml(sh.time) + ' · read-only replay from Muse CLI GUI (localhost)</div>' +
    rows + '</div></body></html>';
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
  if (req.method === 'GET' && url.pathname.startsWith('/share/')) {
    const sh = shares.get(url.pathname.slice(7));
    if (!sh) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Share not found (links expire when the bridge restarts)');
      return;
    }
    const html = renderShare(sh);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': Buffer.byteLength(html) });
    res.end(html);
    return;
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
    if (bridgePaused) return apiErr(res, 503, 'Bridge is stopped (paused from the GUI). Click Start to resume.', 'paused');
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
    let apiMode = 'build';
    const metaMode = body.metadata && body.metadata.mode;
    const hdrMode = typeof req.headers['x-muse-mode'] === 'string' ? req.headers['x-muse-mode'] : null;
    if (typeof metaMode === 'string' && metaMode) {
      if (!Object.prototype.hasOwnProperty.call(API_MODES, metaMode)) return apiErr(res, 400, 'metadata.mode must be one of build/supervised/plan/research/debug', 'invalid_request');
      apiMode = metaMode;
    } else if (hdrMode && Object.prototype.hasOwnProperty.call(API_MODES, hdrMode)) {
      apiMode = hdrMode;
    }
    if (apiActiveRuns >= API_MAX_RUNS) {
      res.setHeader('Retry-After', '30');
      return apiErr(res, 429, 'Too many concurrent agent runs (max ' + API_MAX_RUNS + ')', 'rate_limit');
    }
    let cwd = null;
    let scratch = false;
    const metaCwd = body.metadata && body.metadata.cwd;
    const hdrCwd = typeof req.headers['x-muse-cwd'] === 'string' ? req.headers['x-muse-cwd'] : null;
    let cwdSrc = 'scratch';
    if (typeof metaCwd === 'string' && metaCwd) {
      if (!path.isAbsolute(metaCwd)) return apiErr(res, 400, 'metadata.cwd must be an absolute path', 'invalid_request');
      cwd = metaCwd;
      cwdSrc = 'metadata';
    } else if (hdrCwd) {
      // Set by the muse-cwd OpenCode plugin from the live session directory,
      // so every OpenCode project runs in its own folder with no per-project file.
      if (!path.isAbsolute(hdrCwd)) return apiErr(res, 400, 'x-muse-cwd must be an absolute path', 'invalid_request');
      cwd = hdrCwd;
      cwdSrc = 'header';
    } else {
      scratch = true;
      try { fs.mkdirSync(API_SCRATCH_ROOT, { recursive: true }); } catch (e) { return apiErr(res, 500, 'Cannot create API scratch dir', 'server_error'); }
      try { cwd = fs.mkdtempSync(path.join(API_SCRATCH_ROOT, 'run-')); } catch (e) { return apiErr(res, 500, 'Cannot create API run dir', 'server_error'); }
    }
    // Any 400 past this point must drop a scratch dir it just made.
    const dropScratch = () => { if (scratch && cwd) { try { fs.rmSync(cwd, { recursive: true, force: true }); } catch (e) {} } };
    if (tempInside(cwd)) { dropScratch(); return apiErr(res, 400, 'Refusing cwd: the OS temp folder is inside it (the Muse runtime fails there)', 'invalid_request'); }
    let prompt = promptFromMessages(messages);
    if (!prompt.trim()) { dropScratch(); return apiErr(res, 400, 'messages contain no text', 'invalid_request'); }
    const pre = modePrefix(apiMode);
    if (pre) prompt = pre + '\n\n' + prompt;
    if (process.env.MUSE_DEBUG_API === '1') {
      let toolsBytes = 0;
      try { toolsBytes = Array.isArray(body.tools) ? JSON.stringify(body.tools).length : 0; } catch (e) {}
      const comp = messages.map((m) => (m.role || '?') + ':' + textOfContent(m.content).length).join(' ');
      console.log('api debug: body=' + (req.headers['content-length'] || '?') + ' msgs=' + messages.length + ' [' + comp + '] tools=' + (Array.isArray(body.tools) ? body.tools.length : 0) + 'x' + toolsBytes + 'B promptChars=' + prompt.length);
    }
    const rest = apiFlagsForMode(apiMode, model);
    const t0 = Date.now();
    console.log('api chat: model=' + (model || 'default') + ' mode=' + apiMode + ' msgs=' + messages.length + ' stream=' + (!!body.stream) + ' cwd=' + cwd + ' src=' + cwdSrc);
    apiActiveRuns++;
    // Best-effort immediate cleanup, run BEFORE the final bytes flush so a
    // client can never observe a completed response with the scratch dir
    // still present.
    const finishSync = () => {
      if (scratch && cwd) { try { fs.rmSync(cwd, { recursive: true, force: true }); } catch (e) {} }
    };
    const finish = () => {
      apiActiveRuns = Math.max(0, apiActiveRuns - 1);
      if (scratch && cwd) {
        const dir = cwd;
        let tries = 0;
        const attempt = () => {
          try {
            fs.rmSync(dir, { recursive: true, force: true });
          } catch (e) {
            if (e && e.code === 'ENOENT') return;
            // Windows often holds fresh dirs briefly (AV scan, handle release).
            if (++tries < 4) setTimeout(attempt, 150);
            else console.log('api scratch cleanup failed for ' + dir + ': ' + ((e && e.message) || e));
          }
        };
        attempt();
      }
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
          finishSync();
          const sUsage = apiUsage(prompt, end.text);
          if (end.terminal === 'failed') sendChunk({ content: '(agent run failed: ' + (end.reason || 'unknown error').slice(0, 300) + ')' });
          sendChunk({}, 'stop', sUsage);
          if (!res.writableEnded && !res.destroyed) res.write('data: [DONE]\n\n');
          res.end();
          const u = sumUsage(end.usage);
          console.log('api chat done: terminal=' + end.terminal + ' ms=' + (Date.now() - t0) + ' cliIn=' + u.inp + ' cliOut=' + u.out + ' repIn=' + sUsage.prompt_tokens + ' repOut=' + sUsage.completion_tokens);
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
      finishSync();
      finish();
      if (res.writableEnded || res.destroyed) return;
      const u = sumUsage(end.usage);
      const rep = apiUsage(prompt, end.text);
      console.log('api chat done: terminal=' + end.terminal + ' ms=' + (Date.now() - t0) + ' cliIn=' + u.inp + ' cliOut=' + u.out + ' repIn=' + rep.prompt_tokens + ' repOut=' + rep.completion_tokens);
      if (end.terminal === 'failed') return apiErr(res, 500, end.reason || 'Agent run failed', 'server_error');
      return apiJson(res, 200, {
        id: 'chatcmpl-' + crypto.randomBytes(8).toString('hex'),
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: model || 'muse-default',
        choices: [{ index: 0, message: { role: 'assistant', content: end.text }, finish_reason: 'stop' }],
        usage: rep,
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
    for (const [eid, rec] of running) {
      if (rec.socket === socket) {
        try { rec.kill(); } catch (e) {}
        running.delete(eid);
      }
    }
  });
});