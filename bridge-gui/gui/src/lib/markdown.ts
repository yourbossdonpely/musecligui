import { escapeHtml } from './protocol';

let mdSeq = 0;
export const mdStore: Record<string, string> = {};

export function inlineMd(s: string): string {
  let e = escapeHtml(s);
  e = e.replace(/`([^`]+?)`/g, '<code>$1</code>');
  e = e.replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>');
  e = e.replace(/(^|[\s(])\*([^*\n]+?)\*/g, '$1<em>$2</em>');
  e = e.replace(/\[([^\]]+?)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  return e;
}
export function mdCodeBlock(code: string, lang: string): string {
  const id = 'md' + ++mdSeq;
  mdStore[id] = code;
  return '<div class="md-code"><div class="md-code-head"><span>' + escapeHtml(lang || 'code') + '</span><button data-md-copy="' + id + '">Copy</button></div><pre>' + escapeHtml(code) + '</pre></div>';
}
export function renderMarkdown(src: string): string {
  try {
    const lines = String(src).split('\n');
    let html = '';
    let inCode = false;
    let codeLang = '';
    const codeBuf: string[] = [];
    const listBuf: string[] = [];
    const flushList = () => {
      if (listBuf.length) {
        html += '<ul>' + listBuf.map((li) => '<li>' + inlineMd(li) + '</li>').join('') + '</ul>';
        listBuf.length = 0;
      }
    };
    for (const line of lines) {
      const fence = line.match(/^```(\w*)\s*$/);
      if (fence) {
        if (inCode) {
          html += mdCodeBlock(codeBuf.join('\n'), codeLang);
          codeBuf.length = 0;
          inCode = false;
        } else {
          flushList();
          inCode = true;
          codeLang = fence[1] || '';
        }
        continue;
      }
      if (inCode) {
        codeBuf.push(line);
        continue;
      }
      const h = line.match(/^(#{1,4})\s+(.*)$/);
      if (h) {
        flushList();
        html += '<h' + h[1].length + '>' + inlineMd(h[2]) + '</h' + h[1].length + '>';
        continue;
      }
      const li = line.match(/^\s*(?:[-*]|\d+[.)])\s+(.*)$/);
      if (li) {
        listBuf.push(li[1]);
        continue;
      }
      if (/^\s*$/.test(line)) {
        flushList();
        continue;
      }
      flushList();
      html += '<p>' + inlineMd(line) + '</p>';
    }
    if (inCode) html += mdCodeBlock(codeBuf.join('\n'), codeLang);
    flushList();
    return html || escapeHtml(src);
  } catch {
    return escapeHtml(src);
  }
}