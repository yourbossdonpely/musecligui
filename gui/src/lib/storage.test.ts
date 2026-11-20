// @vitest-environment node
import { loadProjects, saveProjects, loadSettings, saveSettings, loadSelection, saveSelection } from './storage';

function mem(initial?: Record<string, string>) {
  const m = new Map<string, string>(Object.entries(initial ?? {}));
  return { getItem: (k: string) => (m.has(k) ? m.get(k)! : null), setItem: (k: string, v: string) => { m.set(k, v); } };
}

test('loadProjects backfills sid and messages', () => {
  const s = mem({ muse_projects: JSON.stringify([{ id: 1, name: 'P', path: 'C:\\p', sessions: [{ id: 2, name: 'S1', messages: [{ type: 'user', text: 'hi' }] }] }]) });
  const ps = loadProjects(s);
  expect(ps.length).toBe(1);
  expect(ps[0].sessions[0].sid).toMatch(/^[0-9a-f-]{36}$/);
  expect(ps[0].sessions[0].messages.length).toBe(1);
});
test('loadProjects tolerates corrupt data', () => {
  expect(loadProjects(mem({ muse_projects: '{oops' }))).toEqual([]);
  expect(loadProjects(mem())).toEqual([]);
});
test('projects round-trip', () => {
  const s = mem();
  saveProjects(s, [{ id: 1, name: 'P', path: 'C:\\p', sessions: [] }]);
  expect(loadProjects(s)[0].name).toBe('P');
});
test('settings merge with defaults', () => {
  const s = mem({ muse_settings: JSON.stringify({ mode: 'plan' }) });
  const st = loadSettings(s);
  expect(st.mode).toBe('plan');
  expect(st.flags.approvalMode).toBe('never');
  expect(st.model).toBe('');
});
test('selection round-trip', () => {
  const s = mem();
  expect(loadSelection(s)).toBeNull();
  saveSelection(s, { p: 1, s: 2 });
  expect(loadSelection(s)).toEqual({ p: 1, s: 2 });
});