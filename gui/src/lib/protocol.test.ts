// @vitest-environment node
import { uuid, escapeHtml, fmtSize, cmpVersions, usageParts, toolMeta, extractDetail, buildExec, buildHistory, buildContext } from './protocol';

test('uuid looks like a v4 uuid', () => {
  expect(uuid()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});
test('escapeHtml escapes markup', () => {
  expect(escapeHtml('<b>a&"b"</b>')).toBe('&lt;b&gt;a&amp;&quot;b&quot;&lt;/b&gt;');
});
test('fmtSize formats bytes', () => {
  expect(fmtSize(512)).toBe('512 B');
  expect(fmtSize(2048)).toBe('2.0 KB');
  expect(fmtSize(3145728)).toBe('3.0 MB');
});
test('cmpVersions orders versions', () => {
  expect(cmpVersions('2.1.0', '2.0.0')).toBe(1);
  expect(cmpVersions('2.0.0', '2.1.0')).toBe(-1);
  expect(cmpVersions('2.10.0', '2.9.0')).toBe(1);
  expect(cmpVersions('2.1.0', '2.1.0')).toBe(0);
});
test('usageParts splits percent and reset', () => {
  expect(usageParts('21% used, resets in 2h 4m')).toEqual({ pct: '21', reset: '2h 4m' });
  expect(usageParts(null)).toEqual({ pct: null, reset: '' });
});
test('toolMeta classifies tool families', () => {
  expect(toolMeta('tool.read_file')).toEqual({ ico: '📄', cls: 't-read' });
  expect(toolMeta('edit_file')).toEqual({ ico: '✎', cls: 't-write' });
  expect(toolMeta('shell.exec')).toEqual({ ico: '>_', cls: 't-term' });
  expect(toolMeta('web_search')).toEqual({ ico: '🌐', cls: 't-web' });
  expect(toolMeta('something-else')).toEqual({ ico: '⚙', cls: 't-misc' });
});
test('extractDetail finds nested command/path', () => {
  expect(extractDetail({ payload: { event: { command: 'npm test' } } })).toBe('npm test');
  expect(extractDetail({ a: [{ b: { path: 'C:\\x\\y.txt' } }] })).toBe('C:\\x\\y.txt');
  expect(extractDetail({})).toBe('');
});
test('buildExec maps custom mode to build', () => {
  const m = buildExec({ id: 'e1', command: 'hi', mode: 'custom', history: [], flags: {} });
  expect(m['action']).toBe('exec');
  expect(m['mode']).toBe('build');
  expect(m['command']).toBe('hi');
});
test('buildHistory keeps last 10 user/muse turns', () => {
  const msgs = Array.from({ length: 15 }, (_, i) => ({ type: 'user' as const, text: 'm' + i }));
  const h = buildHistory([{ type: 'system', text: 's' }, ...msgs]);
  expect(h.length).toBe(10);
  expect(h[0]).toEqual({ role: 'user', text: 'm5' });
});
test('buildContext joins attachments', () => {
  expect(buildContext([])).toBe('');
  expect(buildContext([{ rel: 'a.txt', content: 'hi' }])).toBe('--- a.txt ---\nhi');
});
test('fmtTokens formats token counts', async () => {
  const { fmtTokens } = await import('./protocol');
  expect(fmtTokens(999)).toBe('999');
  expect(fmtTokens(1500)).toBe('1.5k');
  expect(fmtTokens(38060)).toBe('38.1k');
  expect(fmtTokens(2500000)).toBe('2.5M');
});