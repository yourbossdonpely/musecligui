// @vitest-environment node
import { parseSessionFile } from './import-session';

test('parses exported markdown', () => {
  const r = parseSessionFile('chat.md', '# P — S1\n\n## You\nhello\n\n## Muse\nhi there\n\n> note\n');
  expect(r.name).toBe('chat');
  expect(r.messages).toEqual([
    { type: 'user', text: 'hello' },
    { type: 'muse', text: 'hi there' },
    { type: 'system', text: 'note' },
  ]);
});
test('parses json array and object shapes', () => {
  const a = parseSessionFile('s.json', JSON.stringify([{ type: 'user', text: 'a' }, { type: 'weird', text: 'b' }, { type: 'muse', text: 'c' }]));
  expect(a.messages).toEqual([{ type: 'user', text: 'a' }, { type: 'muse', text: 'c' }]);
  const o = parseSessionFile('s.json', JSON.stringify({ name: 'Old', messages: [{ type: 'user', text: 'x' }] }));
  expect(o.name).toBe('Old');
  expect(o.messages.length).toBe(1);
});
test('rejects garbage', () => {
  expect(() => parseSessionFile('x.md', 'no sections here')).toThrow();
  expect(() => parseSessionFile('x.json', '{oops')).toThrow();
  expect(() => parseSessionFile('x.txt', 'hello')).toThrow();
});