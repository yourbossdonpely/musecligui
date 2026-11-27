// @vitest-environment node
import { renderMarkdown } from './markdown';

const SRC = '# Hi\n\n**bold** and `code` and *ital*\n\n```js\nconst a = 1;\n```\n\n- one\n- two\n\n[U](https://x.com)\n\n<script>alert(1)</script>';

test('markdown renders headings, bold, code', () => {
  const out = renderMarkdown(SRC);
  expect(out).toContain('<h1>Hi</h1>');
  expect(out).toContain('<strong>bold</strong>');
  expect(out).toContain('<code>code</code>');
});
test('markdown renders fences, lists, links', () => {
  const out = renderMarkdown(SRC);
  expect(out).toContain('md-code');
  expect(out).toContain('const a = 1;');
  expect(out).toContain('<ul>');
  expect(out).toContain('<li>one</li>');
  expect(out).toContain('<a href="https://x.com"');
});
test('markdown escapes hostile html', () => {
  const out = renderMarkdown(SRC);
  expect(out).not.toContain('<script>');
  expect(out).toContain('&lt;script&gt;');
});
test('markdown never throws', () => {
  expect(() => renderMarkdown('')).not.toThrow();
  expect(() => renderMarkdown('```unclosed\nfoo')).not.toThrow();
});