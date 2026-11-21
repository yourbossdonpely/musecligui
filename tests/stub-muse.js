const fs = require('fs');
const args = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function main() {
  if (args[0] === 'exec' && args.includes('--list-models')) { console.log('muse-spark-1.3\nmuse-ember-1.0'); return; }
  if (args[0] === 'exec') {
    const i = args.indexOf('--prompt-file');
    let prompt = '';
    if (i >= 0 && args[i + 1]) prompt = fs.readFileSync(args[i + 1], 'utf8');
    if (!prompt) { console.error('stub: empty prompt'); process.exitCode = 3; return; }
    const slow = prompt.includes('[SLOW]');
    const fail = prompt.includes('[FAIL]');
    const cwdMode = prompt.includes('[CWD]');
    const finalText = cwdMode ? 'CWD:' + process.cwd() : 'Hello from stub!';
    let seq = 0;
    const send = (pt, p) => console.log(JSON.stringify({ schema_version: 1, sequence: ++seq, payload_type: pt, payload: p }));
    send('runtime.command.accepted', { kind: 'command_accepted' });
    send('task.lifecycle.proposed', { kind: 'task_lifecycle', task_id: 't1', event: { kind: 'proposed', task_kind: 'tool.read_file' } });
    send('task.lifecycle.started', { kind: 'task_lifecycle', task_id: 't1', event: { kind: 'started', operation: 'read_file' } });
    for (const c of (cwdMode ? [finalText] : ['Hello ', 'from ', 'stub!'])) { send('run.output.delta', { kind: 'run_output_delta', text: c }); if (slow) await sleep(1500); }
    send('task.lifecycle.completed', { kind: 'task_lifecycle', task_id: 't1', event: { kind: 'completed' } });
    send('run.usage', { kind: 'run_usage', models: [{ model: 'stub', input_tokens: 10, output_tokens: 5, calls: 1 }], calls: 1 });
    if (fail) { send('run.terminal.failed', { kind: 'run_terminal', terminal: 'failed', text: '', reason: 'stub failure' }); process.exitCode = 1; return; }
    send('run.terminal.completed', { kind: 'run_terminal', terminal: 'completed', text: finalText, reason: null });
    return;
  }
  if (args[0] === 'usage') { console.log('Tier: Stub Plan\nWindow: 12% used, resets in 1h\nWeekly: 3% used, resets in 2d'); return; }
  if (args[0] === 'skills' && args[1] === 'list') { console.log(JSON.stringify({ skills: [{ id: 'a', display_name: 'A', scope: 'user', activation: 'on', description: 'Skill A' }, { id: 'b', name: 'b', scope: 'project', activation: 'off', description: 'Skill B' }], diagnostics: [] })); return; }
  if (args[0] === 'skills' && (args[1] === 'enable' || args[1] === 'disable')) { console.log(JSON.stringify({ ok: true })); return; }
  if (args[0] === 'mcp' && args[1] === 'list') { console.log(JSON.stringify({ servers: [{ name: 'demo', url: 'http://x' }] })); return; }
  if (args[0] === 'mcp' && args[1] === 'add') { console.log(JSON.stringify({ ok: true, name: args[2] })); return; }
  if (args[0] === 'mcp' && args[1] === 'remove') { console.log(JSON.stringify({ ok: true })); return; }
  if (args[0] === 'mcp' && args[1] === 'get') { console.log(JSON.stringify({ name: args[2], url: 'http://x' })); return; }
  if (args[0] === 'sessions') { console.log(JSON.stringify({ sessions: [{ sessionId: 's1', name: 'demo' }] })); return; }
  console.error('stub: unknown args ' + args.join(' ')); process.exitCode = 2;
}
main();