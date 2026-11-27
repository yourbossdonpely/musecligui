// @vitest-environment node
import { buildSessionMarkdown } from './export-session';

test('builds transcript markdown', () => {
  const md = buildSessionMarkdown('P', 'S1', [
    { type: 'user', text: 'a' },
    { type: 'muse', text: 'b' },
    { type: 'system', text: 'c' },
  ]);
  expect(md).toContain('# P — S1');
  expect(md).toContain('## You\na');
  expect(md).toContain('## Muse\nb');
  expect(md).toContain('> c');
});