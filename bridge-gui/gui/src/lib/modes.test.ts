// @vitest-environment node
import { MODES, permsPreview, permsSummary, defaultSettings } from './modes';

test('build preview uses yolo only', () => {
  const p = permsPreview({ ...defaultSettings(), mode: 'build', flags: { ...MODES.build.flags } });
  expect(p).toContain('--yolo');
  expect(p).not.toContain('--disable-write');
});
test('plan preview is read-only', () => {
  const p = permsPreview({ ...defaultSettings(), mode: 'plan', flags: { ...MODES.plan.flags } });
  expect(p).toContain('--disable-write');
  expect(p).toContain('--disable-shell');
  expect(p).not.toContain('--yolo');
});
test('supervised keeps sandbox network', () => {
  const p = permsPreview({ ...defaultSettings(), mode: 'supervised', flags: { ...MODES.supervised.flags } });
  expect(p).toContain('--sandbox-network proxy-only');
});
test('preview includes model and effort', () => {
  const p = permsPreview({ ...defaultSettings(), model: 'muse-spark-1.3', effort: 'low' });
  expect(p).toContain('--model muse-spark-1.3');
  expect(p).toContain('--reasoning-effort low');
});
test('summaries label modes', () => {
  expect(permsSummary('plan', MODES.plan.flags)).toBe('Plan');
  expect(permsSummary('custom', { ...MODES.build.flags, yolo: false, write: false })).toContain('read-only');
});