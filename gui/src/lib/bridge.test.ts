// @vitest-environment node
import { BridgeClient } from './bridge';

interface Fake { sent: string[]; closed: boolean; onerror: (() => void) | null; onopen: ((e: unknown) => void) | null; onmessage: ((e: { data: string }) => void) | null; onclose: (() => void) | null; send(d: string): void; close(): void; open(): void; receive(o: unknown): void }
function makeFake(): Fake {
  return {
    sent: [], closed: false, onopen: null, onmessage: null, onclose: null, onerror: null,
    send(d: string) { this.sent.push(d); },
    close() { this.closed = true; if (this.onclose) this.onclose(); },
    open() { if (this.onopen) this.onopen({}); },
    receive(o: unknown) { if (this.onmessage) this.onmessage({ data: JSON.stringify(o) }); },
  };
}

test('connect opens and rpc round-trips', async () => {
  const f = makeFake();
  const c = new BridgeClient(() => f);
  c.connect('ws://x');
  expect(c.connected).toBe(false);
  f.open();
  expect(c.connected).toBe(true);
  const p = c.rpc('ping', {});
  const sent = JSON.parse(f.sent[0]);
  expect(sent.action).toBe('ping');
  f.receive({ id: sent.id, type: 'result', action: 'ping', ok: true, data: { version: '2.1.0' } });
  await expect(p).resolves.toEqual({ version: '2.1.0' });
});
test('rpc rejects on error and timeout', async () => {
  const f = makeFake();
  const c = new BridgeClient(() => f);
  c.connect('ws://x'); f.open();
  const p1 = c.rpc('usage', {});
  f.receive({ id: JSON.parse(f.sent[0]).id, type: 'result', action: 'usage', ok: false, error: 'boom' });
  await expect(p1).rejects.toThrow('boom');
  await expect(c.rpc('usage', {}, 20)).rejects.toThrow('timed out');
});
test('exec events route to handler', async () => {
  const f = makeFake();
  const c = new BridgeClient(() => f);
  c.connect('ws://x'); f.open();
  const got: string[] = [];
  c.onExec('e9', (m) => { got.push(m.type); });
  f.receive({ id: 'e9', type: 'exec-delta', text: 'hi' });
  f.receive({ id: 'e9', type: 'exec-done', text: 'hi' });
  expect(got).toEqual(['exec-delta', 'exec-done']);
});
test('close rejects pending and clears', async () => {
  const f = makeFake();
  const c = new BridgeClient(() => f);
  c.connect('ws://x'); f.open();
  const p = c.rpc('usage', {}, 5000);
  c.close();
  await expect(p).rejects.toThrow();
  expect(c.connected).toBe(false);
});
test('exec result errors route to exec handler', async () => {
  const f = makeFake();
  const c = new BridgeClient(() => f);
  c.connect('ws://x'); f.open();
  const got: string[] = [];
  c.onExec('e5', (m) => { got.push(String(m.type)); });
  f.receive({ id: 'e5', type: 'result', action: 'exec', ok: false, error: 'nope' });
  expect(got).toEqual(['result']);
});
