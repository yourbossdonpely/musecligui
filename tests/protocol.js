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
  console.error('Missing dependency: run `npm install` in the repo root first.');
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
  const proc = spawn(process.execPath, [path.join(ROOT, 'muse-bridge.js')], {
    env: { ...process.env, MUSE_BRIDGE_PORT: '18765', MUSE_CMD: path.join(__dirname, 'stub-muse.js') },
    cwd: ROOT, stdio: 'ignore',
  });
  try {
    await waitBridge(15000);
    await runTests(proj);
  } catch (e) {
    check('harness', false, (e && e.stack) || e);
  } finally {
    try { proc.kill(); } catch (e) {}
  }
  const fails = results.filter((r) => !r).length;
  console.log('SUMMARY pass=' + (results.length - fails) + ' fail=' + fails);
  process.exit(fails ? 1 : 0);
}

async function runTests(proj) {
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
  function execStream(payload) {
    return new Promise((resolve, reject) => {
      const id = 'e' + ++reqId;
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
  check('ping', ping.ok && ping.data.version === '2.2.0', JSON.stringify(ping));
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
  const leg = await new Promise((resolve) => { legacyHandler = resolve; ws.send(JSON.stringify({ command: 'legacy hi' })); setTimeout(() => resolve({ timeout: true }), 15000); });
  check('legacy-output', leg.type === 'output' && leg.text === 'Hello from stub!', JSON.stringify(leg).slice(0, 200));
  legacyHandler = null;
  ws.close();
}

main();