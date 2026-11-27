// Bridge protocol suite. Self-contained: spawns the bridge on 18765 with the
// stub CLI, runs all assertions, shuts down. Run: npm run test:bridge (root).
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let WebSocket;
try {
  WebSocket = require(path.join(ROOT, 'node_modules', 'ws'));
} catch (e) {
  console.error('Missing dependency: run `npm install` in bridge-gui/ first.');
  process.exit(2);
}

const results = [];
function check(name, cond, extra) {
  results.push(!cond ? 0 : 1);
  console.log((cond ? 'PASS' : 'FAIL') + ' ' + name + (cond ? '' : ' :: ' + String(extra).slice(0, 300)));
}

function makeProj() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'muse-proto-'));
  fs.mkdirSync(path.join(dir, 'sub'));
  fs.writeFileSync(path.join(dir, 'a.txt'), 'hello-fs');
  fs.writeFileSync(path.join(dir, 'sub', 'b.txt'), 'bee');
  fs.writeFileSync(path.join(dir, 'bin.dat'), Buffer.from([0, 1, 2, 3]));
  spawnSync('git', ['init'], { cwd: dir, stdio: 'ignore' });
  spawnSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'add', 'a.txt'], { cwd: dir, stdio: 'ignore' });
  spawnSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-m', 'init'], { cwd: dir, stdio: 'ignore' });
  fs.writeFileSync(path.join(dir, 'a.txt'), 'hello-fs-CHANGED');
  return dir;
}

function waitBridge(ms) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const iv = setInterval(() => {
      const s = new WebSocket('ws://localhost:18765');
      s.on('open', () => { clearInterval(iv); s.close(); resolve(); });
      s.on('error', () => { s.close(); if (Date.now() - t0 > ms) { clearInterval(iv); reject(new Error('bridge never came up')); } });
    }, 300);
  });
}

async function main() {
  const proj = makeProj();
  const stubDump = path.join(os.tmpdir(), 'muse-stub-args-' + process.pid + '.jsonl');
  try { fs.unlinkSync(stubDump); } catch (e) {}
  try {
    for (const f of fs.readdirSync(path.join(ROOT, 'api-runs'))) {
      if (/^run-/.test(f)) fs.rmSync(path.join(ROOT, 'api-runs', f), { recursive: true, force: true });
    }
  } catch (e) {}
  const proc = spawn(process.execPath, [path.join(ROOT, 'muse-bridge.js')], {
    env: { ...process.env, MUSE_BRIDGE_PORT: '18765', MUSE_CMD: path.join(__dirname, 'stub-muse.js'), MUSE_PICKER_CMD: 'echo C:\\\\picked', MUSE_API_PORT: '18766', MUSE_API_KEY: 'test-key-123', STUB_DUMP_ARGS: stubDump },
    cwd: ROOT, stdio: process.env.MUSE_BRIDGE_LOG ? ['ignore', 'pipe', 'pipe'] : 'ignore',
  });
  if (process.env.MUSE_BRIDGE_LOG) {
    const blogPath = path.join(os.tmpdir(), 'muse-bridge-log-' + process.pid + '.txt');
    try { fs.unlinkSync(blogPath); } catch (e) {}
    proc.stdout.on('data', (dd) => { try { fs.appendFileSync(blogPath, dd); } catch (e) {} });
    proc.stderr.on('data', (dd) => { try { fs.appendFileSync(blogPath, dd); } catch (e) {} });
    console.log("bridge log: " + blogPath);
  }
  try {
    await waitBridge(15000);
    await runTests(proj, stubDump);
  } catch (e) {
    check('harness', false, (e && e.stack) || e);
  } finally {
    try { proc.kill(); } catch (e) {}
    try { fs.unlinkSync(stubDump); } catch (e) {}
  }
  const fails = results.filter((r) => !r).length;
  console.log('SUMMARY pass=' + (results.length - fails) + ' fail=' + fails);
  process.exit(fails ? 1 : 0);
}

async function runTests(proj, stubDump) {
  const ws = await new Promise((resolve, reject) => {
    const s = new WebSocket('ws://localhost:18765');
    s.on('open', () => resolve(s));
    s.on('error', reject);
  });
  let reqId = 0;
  const pending = new Map();
  const streamHandlers = new Map();
  let legacyHandler = null;
  ws.on('message', (data) => {
    const m = JSON.parse(data.toString());
    if (m.type === 'result' && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    else if (m.id && streamHandlers.has(m.id)) streamHandlers.get(m.id)(m);
    else if ((m.type === 'output' || m.type === 'error') && legacyHandler) legacyHandler(m);
  });
  function rpc(action, payload) {
    payload = payload || {};
    return new Promise((resolve, reject) => {
      const id = 'r' + ++reqId;
      pending.set(id, resolve);
      const o = { id, action };
      for (const k in payload) o[k] = payload[k];
      ws.send(JSON.stringify(o));
      setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error('rpc timeout ' + action)); } }, 20000);
    });
  }
  function execStream(payload, fixedId) {
    return new Promise((resolve, reject) => {
      const id = fixedId || ('e' + ++reqId);
      const events = [];
      streamHandlers.set(id, (m) => { events.push(m); if (m.type === 'exec-done') { streamHandlers.delete(id); resolve(events); } });
      const o = { id, action: 'exec' };
      for (const k in payload) o[k] = payload[k];
      ws.send(JSON.stringify(o));
      setTimeout(() => { if (streamHandlers.has(id)) { streamHandlers.delete(id); reject(new Error('exec timeout')); } }, 30000);
    });
  }
  function oneShot(obj, ms) {
    return new Promise((resolve) => {
      const id = 'x' + ++reqId;
      pending.set(id, resolve);
      obj.id = id;
      ws.send(JSON.stringify(obj));
      setTimeout(() => { if (pending.has(id)) { pending.delete(id); resolve({ timeout: true }); } }, ms || 10000);
    });
  }

  const ping = await rpc('ping');
  check('ping', ping.ok && ping.data.version === '2.7.0' && ping.data.paused === false, JSON.stringify(ping));
  const pick = await rpc('pick-folder', {});
  check('pick-folder', pick.ok && pick.data.path === 'C:\\\\picked', JSON.stringify(pick));
  const drives = await rpc('fs-drives');
  check('fs-drives', drives.ok && drives.data.drives.length > 0, JSON.stringify(drives).slice(0, 200));
  const models = await rpc('models-list');
  check('models-list', models.ok && models.data.models.length === 2, JSON.stringify(models));
  const usage = await rpc('usage');
  check('usage', usage.ok && usage.data.tier === 'Stub Plan', JSON.stringify(usage));
  const skills = await rpc('skills-list');
  check('skills-list', skills.ok && skills.data.count === 2, JSON.stringify(skills).slice(0, 200));
  const sset = await rpc('skills-set', { skillId: 'a', enabled: false, scope: 'user' });
  check('skills-set', sset.ok && sset.data.enabled === false, JSON.stringify(sset));
  const mcp = await rpc('mcp-list');
  check('mcp-list', mcp.ok && mcp.data.servers.length === 1, JSON.stringify(mcp));
  const madd = await rpc('mcp-add', { name: 'demo2', url: 'https://x.test' });
  check('mcp-add-url', madd.ok && madd.data.name === 'demo2', JSON.stringify(madd));
  const madd2 = await rpc('mcp-add', { name: 'cmd1', command: ['node', 'srv.js'] });
  check('mcp-add-cmd', madd2.ok, JSON.stringify(madd2));
  const maddBad = await rpc('mcp-add', { name: '!!!', url: 'https://x.test' });
  check('mcp-add-invalid', maddBad.ok === false, JSON.stringify(maddBad));
  const maddBad2 = await rpc('mcp-add', { name: 'u1', url: 'ftp://x' });
  check('mcp-add-badurl', maddBad2.ok === false, JSON.stringify(maddBad2));
  const mget = await rpc('mcp-get', { name: 'demo2' });
  check('mcp-get', mget.ok && mget.data.name === 'demo2', JSON.stringify(mget));
  const mrm = await rpc('mcp-remove', { name: 'demo2' });
  check('mcp-remove', mrm.ok, JSON.stringify(mrm));
  const sess = await rpc('sessions-list');
  check('sessions-list', sess.ok && sess.data.sessions.length === 1, JSON.stringify(sess));
  const ls = await rpc('fs-list', { root: proj, rel: '' });
  check('fs-list', ls.ok && ls.data.entries.some((e) => e.name === 'a.txt'), JSON.stringify(ls).slice(0, 200));
  const esc = await rpc('fs-list', { root: proj, rel: '..\\..' });
  check('fs-escape-blocked', esc.ok === false, JSON.stringify(esc));
  const rd = await rpc('fs-read', { root: proj, rel: 'a.txt' });
  check('fs-read', rd.ok && rd.data.content === 'hello-fs-CHANGED', JSON.stringify(rd).slice(0, 200));
  const bin = await rpc('fs-read', { root: proj, rel: 'bin.dat' });
  check('fs-read-binary-blocked', bin.ok === false, JSON.stringify(bin).slice(0, 200));
  const git = await rpc('git-status', { cwd: proj });
  check('git-status', git.ok && git.data.repo === true, JSON.stringify(git));
  const diff = await rpc('git-diff', { cwd: proj });
  check('git-diff', diff.ok && diff.data.repo === true && diff.data.diff.includes('CHANGED'), JSON.stringify(diff).slice(0, 200));
  const diffBad = await rpc('git-diff', { cwd: proj, rel: '-x' });
  check('git-diff-flag-blocked', diffBad.ok === false, JSON.stringify(diffBad));
  const unk = await rpc('nope-action');
  check('unknown-action', unk.ok === false, JSON.stringify(unk));
  const evs = await execStream({ command: 'hi', cwd: proj, flags: { yolo: true } });
  const types = evs.map((e) => e.type);
  const done = evs[evs.length - 1];
  check('exec-stream', types[0] === 'exec-start' && done.type === 'exec-done' && done.text === 'Hello from stub!', types.join(','));
  check('exec-usage', evs.some((e) => e.type === 'exec-usage'), types.join(','));
  const badm = await oneShot({ action: 'exec', command: 'hi', cwd: proj, model: 'bad model!' });
  check('exec-bad-model', badm.ok === false, JSON.stringify(badm).slice(0, 200));
  const home = await rpc('exec', { command: 'hi', cwd: process.env.USERPROFILE || process.env.HOME });
  check('exec-home-refused', home.ok === false && /temp/i.test(home.error || ''), JSON.stringify(home).slice(0, 200));
  const st0 = await rpc('stop');
  check('stop-idle', st0.ok && st0.data.stopped === false, JSON.stringify(st0));
  const slowP = execStream({ command: '[SLOW] wait', cwd: proj, flags: {} });
  await new Promise((r) => setTimeout(r, 1200));
  const st1 = await rpc('stop');
  check('stop-busy', st1.ok && st1.data.stopped === true, JSON.stringify(st1));
  const sevs = await slowP;
  check('stop-exec-done-arrives', sevs[sevs.length - 1].type === 'exec-done', sevs.map((e) => e.type).join(','));
  const parA = execStream({ command: '[SLOW] par A', cwd: proj, flags: {} }, 'parA');
  const parB = execStream({ command: '[SLOW] par B', cwd: proj, flags: {} }, 'parB');
  await new Promise((r) => setTimeout(r, 1500));
  const stOne = await rpc('stop', { runId: 'parA' });
  check('parallel-stop-one', stOne.ok && stOne.data.stopped === true && stOne.data.count === 1, JSON.stringify(stOne));
  const evA = await parA;
  check('parallel-one-done', evA[evA.length - 1].type === 'exec-done', evA.map((e) => e.type).join(','));
  const stRest = await rpc('stop');
  check('parallel-stop-rest', stRest.ok && stRest.data.count === 1, JSON.stringify(stRest));
  const evB = await parB;
  check('parallel-rest-done', evB[evB.length - 1].type === 'exec-done', evB.map((e) => e.type).join(','));
  const http = require('http');
  function httpReq(method, pth, body, key, extraHeaders) {
    return new Promise((resolve, reject) => {
      const data = body != null ? JSON.stringify(body) : null;
      const headers = {};
      if (key) headers['Authorization'] = 'Bearer ' + key;
      if (extraHeaders) for (const k in extraHeaders) headers[k] = extraHeaders[k];
      if (data) { headers['Content-Type'] = 'application/json'; headers['Content-Length'] = Buffer.byteLength(data); }
      const req = http.request({ host: '127.0.0.1', port: 18766, path: pth, method, headers, timeout: 60000 }, (res) => {
        let raw = '';
        res.on('data', (c) => { raw += c; });
        res.on('end', () => resolve({ status: res.statusCode, raw }));
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(new Error('http timeout')); });
      if (data) req.write(data);
      req.end();
    });
  }
  const KEY = 'test-key-123';
  const health = await httpReq('GET', '/health');
  check('api-health', health.status === 200 && health.raw.includes('"ok"'), health.raw.slice(0, 100));
  const noauth = await httpReq('GET', '/v1/models');
  check('api-401', noauth.status === 401, noauth.raw.slice(0, 100));
  const amod = await httpReq('GET', '/v1/models', null, KEY);
  const amodj = JSON.parse(amod.raw);
  check('api-models', amod.status === 200 && amodj.object === 'list' && amodj.data.length === 2 && amodj.data[0].id === 'muse-spark-1.3', amod.raw.slice(0, 200));
  const chat = await httpReq('POST', '/v1/chat/completions', { model: 'muse-spark-1.3', messages: [{ role: 'system', content: 'be brief' }, { role: 'user', content: 'hi' }] }, KEY);
  const chatj = JSON.parse(chat.raw);
  check('api-chat', chat.status === 200 && chatj.choices[0].message.content === 'Hello from stub!' && chatj.usage.prompt_tokens === 14 && chatj.usage.completion_tokens === 4 && chatj.usage.total_tokens === 18, chat.raw.slice(0, 300));
  const sse = await new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: 18766, path: '/v1/chat/completions', method: 'POST', headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' }, timeout: 60000 }, (res) => {
      let raw = '';
      res.on('data', (c) => { raw += c; });
      res.on('end', () => resolve({ status: res.statusCode, raw }));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.write(JSON.stringify({ model: 'muse-spark-1.3', stream: true, messages: [{ role: 'user', content: 'hi' }] }));
    req.end();
  });
  const sseText = sse.raw.split('\n').filter((l) => l.startsWith('data: ') && l.indexOf('[DONE]') < 0).map((l) => { try { return JSON.parse(l.slice(6)).choices[0].delta.content || ''; } catch (e) { return ''; } }).join('');
  check('api-stream', sse.status === 200 && sseText === 'Hello from stub!' && sse.raw.includes('[DONE]'), sse.raw.slice(0, 200));
  check('api-stream-finish', sse.raw.indexOf('"finish_reason":"stop"') >= 0, sse.raw.slice(-250));
  check('api-stream-usage', sse.raw.indexOf('"prompt_tokens"') >= 0, sse.raw.slice(-250));
  let leftovers = [];
  for (let i = 0; i < 10; i++) {
    leftovers = fs.readdirSync(path.join(ROOT, 'api-runs'));
    if (!leftovers.length) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  check('api-scratch-clean', leftovers.length === 0, JSON.stringify(leftovers));
  const bad1 = await httpReq('POST', '/v1/chat/completions', { messages: [] }, KEY);
  check('api-400-empty', bad1.status === 400, bad1.raw.slice(0, 120));
  const bad2 = await httpReq('POST', '/v1/chat/completions', { model: 'x', messages: [{ role: 'user', content: 'hi' }], metadata: { cwd: 'relative/path' } }, KEY);
  check('api-400-relcwd', bad2.status === 400, bad2.raw.slice(0, 120));
  const nf = await httpReq('GET', '/nope', null, KEY);
  check('api-404', nf.status === 404, nf.raw.slice(0, 120));
  const shr = await rpc('share-create', { title: 'T', project: 'P', messages: [{ role: 'user', text: 'hello <b>share</b>' }, { role: 'muse', text: 'hi' }] });
  check('share-create', shr.ok && /\/share\/sh-/.test(shr.data.url || ''), JSON.stringify(shr).slice(0, 200));
  const shPage = await httpReq('GET', new URL(shr.data.url).pathname);
  check('share-page', shPage.status === 200 && shPage.raw.includes('&lt;b&gt;share&lt;/b&gt;') && shPage.raw.indexOf('<b>share</b>') < 0, shPage.raw.slice(0, 200));
  const sh404 = await httpReq('GET', '/share/sh-nope');
  check('share-404', sh404.status === 404, sh404.raw.slice(0, 80));
  const shBig = await rpc('share-create', { title: 'T', messages: new Array(600).fill({ role: 'user', text: 'x' }) });
  check('share-cap', shBig.ok === false, JSON.stringify(shBig).slice(0, 200));
  const sum = await rpc('summarize', { text: 'User: hi\n\nMuse: hello there' });
  check('summarize', sum.ok && sum.data.summary === 'Hello from stub!', JSON.stringify(sum).slice(0, 200));
  const sumEmpty = await rpc('summarize', { text: '   ' });
  check('summarize-empty', sumEmpty.ok === false, JSON.stringify(sumEmpty).slice(0, 200));
  const leg = await new Promise((resolve) => { legacyHandler = resolve; ws.send(JSON.stringify({ command: 'legacy hi' })); setTimeout(() => resolve({ timeout: true }), 15000); });
  check('legacy-output', leg.type === 'output' && leg.text === 'Hello from stub!', JSON.stringify(leg).slice(0, 200));
  legacyHandler = null;
  const hdrChat = await httpReq('POST', '/v1/chat/completions', { model: 'muse-spark-1.3', messages: [{ role: 'user', content: '[CWD] where am i' }] }, KEY, { 'x-muse-cwd': proj });
  let hdrChatOk = false;
  try { hdrChatOk = hdrChat.status === 200 && JSON.parse(hdrChat.raw).choices[0].message.content.toLowerCase() === ('CWD:' + proj).toLowerCase(); } catch (e) {}
  check('api-header-cwd', hdrChatOk, hdrChat.raw.slice(0, 200));
  const hdrBad = await httpReq('POST', '/v1/chat/completions', { model: 'muse-spark-1.3', messages: [{ role: 'user', content: 'hi' }] }, KEY, { 'x-muse-cwd': 'relative/path' });
  check('api-400-relheader', hdrBad.status === 400, hdrBad.raw.slice(0, 120));
  try { fs.unlinkSync(stubDump); } catch (e) {}
  const planChat = await httpReq('POST', '/v1/chat/completions', { model: 'muse-spark-1.3', messages: [{ role: 'user', content: 'hi' }] }, KEY, { 'x-muse-mode': 'plan' });
  let planFlagsOk = false;
  try {
    const lastArgs = JSON.parse(fs.readFileSync(stubDump, 'utf8').trim().split('\n').pop());
    planFlagsOk = planChat.status === 200 && lastArgs.includes('--disable-write') && lastArgs.includes('--disable-shell') && lastArgs.indexOf('--yolo') < 0;
  } catch (e) {}
  check('api-mode-plan-flags', planFlagsOk, planChat.raw.slice(0, 120));
  const badMode = await httpReq('POST', '/v1/chat/completions', { model: 'muse-spark-1.3', messages: [{ role: 'user', content: 'hi' }], metadata: { mode: 'evil' } }, KEY);
  check('api-400-badmode', badMode.status === 400, badMode.raw.slice(0, 120));
  check('api-400-no-leak', fs.readdirSync(path.join(ROOT, 'api-runs')).length === 0, 'scratch leaked on 400');
  const unkMode = await httpReq('POST', '/v1/chat/completions', { model: 'muse-spark-1.3', messages: [{ role: 'user', content: 'hi' }] }, KEY, { 'x-muse-mode': 'oracle' });
  check('api-mode-unknown-header-ignored', unkMode.status === 200, unkMode.raw.slice(0, 120));
  const wireDir = fs.mkdtempSync(path.join(os.tmpdir(), 'muse-wire-'));
  const wire1 = await rpc('opencode-wire', { path: wireDir });
  let wire1Ok = wire1.ok && wire1.data.status === 'wrote';
  try { wire1Ok = wire1Ok && JSON.parse(fs.readFileSync(path.join(wireDir, 'opencode.json'), 'utf8')).providers.muse.body.metadata.cwd === wireDir; } catch (e) { wire1Ok = false; }
  check('opencode-wire-wrote', wire1Ok, JSON.stringify(wire1).slice(0, 200));
  const wire2 = await rpc('opencode-wire', { path: wireDir });
  check('opencode-wire-again', wire2.ok && wire2.data.status === 'already-wired', JSON.stringify(wire2).slice(0, 200));
  const wireBad = await rpc('opencode-wire', { path: 'relative/path' });
  check('opencode-wire-badpath', wireBad.ok === false, JSON.stringify(wireBad).slice(0, 200));
  const ostat = await rpc('opencode-status');
  check('opencode-status', ostat.ok && typeof ostat.data.pluginInstalled === 'boolean', JSON.stringify(ostat).slice(0, 200));
  try { fs.rmSync(wireDir, { recursive: true, force: true }); } catch (e) {}
  const cpre = await rpc('checkpoint-create', { cwd: proj });
  check('checkpoint-create', cpre.ok && cpre.data.repo === true && /^cp-/.test(cpre.data.id || ''), JSON.stringify(cpre).slice(0, 200));
  fs.appendFileSync(path.join(proj, 'a.txt'), '-AGENT-EDIT');
  const cundo = await rpc('checkpoint-undo', { checkpointId: cpre.data.id });
  check('checkpoint-undo', cundo.ok === true, JSON.stringify(cundo).slice(0, 200));
  check('checkpoint-restored', fs.readFileSync(path.join(proj, 'a.txt'), 'utf8') === 'hello-fs-CHANGED', 'pre-run state not restored');
  const cundo2 = await rpc('checkpoint-undo', { checkpointId: cpre.data.id });
  check('checkpoint-undo-once', cundo2.ok === false, JSON.stringify(cundo2).slice(0, 200));
  const cplain = fs.mkdtempSync(path.join(os.tmpdir(), 'muse-norepo-'));
  const cnr = await rpc('checkpoint-create', { cwd: cplain });
  check('checkpoint-nonrepo', cnr.ok && cnr.data.repo === false, JSON.stringify(cnr).slice(0, 200));
  try { fs.rmSync(cplain, { recursive: true, force: true }); } catch (e) {}
  fs.writeFileSync(path.join(proj, 'bad.js'), 'const x = ;\n');
  fs.writeFileSync(path.join(proj, 'bad.json'), '{oops');
  const dg = await rpc('diagnose', { cwd: proj });
  const dgFiles = (dg.ok && dg.data.issues.map((x) => x.file).sort().join(',')) || '';
  check('diagnose', dg.ok && dg.data.repo === true && dgFiles.indexOf('bad.js') >= 0 && dgFiles.indexOf('bad.json') >= 0, JSON.stringify(dg).slice(0, 300));
  fs.unlinkSync(path.join(proj, 'bad.js'));
  fs.unlinkSync(path.join(proj, 'bad.json'));
  const bst = await rpc('bridge-stop');
  check('bridge-stop', bst.ok && bst.data.paused === true, JSON.stringify(bst));
  const pingP = await rpc('ping');
  check('bridge-stop-ping', pingP.ok && pingP.data.paused === true, JSON.stringify(pingP));
  const execP = await rpc('exec', { command: 'hi', cwd: proj });
  check('bridge-stop-exec-refused', execP.ok === false && /stopped/i.test(execP.error || ''), JSON.stringify(execP).slice(0, 200));
  const chatP = await httpReq('POST', '/v1/chat/completions', { model: 'muse-spark-1.3', messages: [{ role: 'user', content: 'hi' }] }, KEY);
  check('bridge-stop-chat-503', chatP.status === 503, chatP.raw.slice(0, 120));
  const brt = await rpc('bridge-start');
  check('bridge-start', brt.ok && brt.data.paused === false, JSON.stringify(brt));
  const evs2 = await execStream({ command: 'hi again', cwd: proj, flags: { yolo: true } });
  check('bridge-start-exec-works', evs2[evs2.length - 1].type === 'exec-done', evs2.map((e) => e.type).join(','));
  const shut = await rpc('bridge-shutdown');
  check('bridge-shutdown-ack', shut.ok && shut.data.shutdown === true, JSON.stringify(shut));
  const closed = await new Promise((resolve) => { ws.on('close', () => resolve(true)); setTimeout(() => resolve(false), 8000); });
  check('bridge-shutdown-exits', closed === true, 'bridge did not exit');
  ws.close();
}

main();