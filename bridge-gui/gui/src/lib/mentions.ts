// @-mention support for the composer. A mention token is '@' + non-space chars
// where '@' starts the text or follows whitespace. Directories in the query
// (e.g. "@src/ut") scope the file listing.
export interface MentionToken { start: number; query: string }

export function findMentionToken(value: string, caret: number): MentionToken | null {
  const v = String(value || '');
  const c = Math.max(0, Math.min(caret | 0, v.length));
  const upto = v.slice(0, c);
  const at = upto.lastIndexOf('@');
  if (at < 0) return null;
  if (at > 0 && !/\s/.test(upto[at - 1])) return null;
  const query = upto.slice(at + 1);
  if (!/^[^\s@]*$/.test(query)) return null;
  if (/\s/.test(v.slice(c, c + 1)) || c >= v.length) return { start: at, query };
  return null;
}

export function splitMentionQuery(query: string): { dir: string; file: string } {
  const i = query.lastIndexOf('/');
  if (i < 0) return { dir: '', file: query };
  return { dir: query.slice(0, i), file: query.slice(i + 1) };
}

export function applyMention(value: string, caret: number, start: number, rel: string): { value: string; caret: number } {
  const v = String(value || '');
  const c = Math.max(0, Math.min(caret | 0, v.length));
  const next = v.slice(0, start) + '@' + rel + ' ' + v.slice(c).replace(/^\s+/, '');
  return { value: next, caret: start + rel.length + 2 };
}

const EXTRACT_RE = /(?:^|\s)@([^\s@]+)/g;

export function extractMentions(text: string): string[] {
  const out: string[] = [];
  EXTRACT_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = EXTRACT_RE.exec(String(text || '')))) {
    const rel = m[1].replace(/[.,;:!?)]+$/, '');
    if (rel && !out.includes(rel)) out.push(rel);
  }
  return out;
}
