// @-mentions for the composer. A mention token is '@' + non-space chars where
// '@' starts the text or follows whitespace. Directories in the query (e.g.
// "@src/ut") scope the file listing. Mentioned files are read at send time and
// appended as fenced context while the echo keeps the clean text.
export interface MentionToken {
  start: number;
  query: string;
}

export function findMentionToken(value: string, caret: number): MentionToken | null {
  const text = String(value ?? "");
  const at = Math.max(0, Math.min(Math.floor(caret) || 0, text.length));
  const upto = text.slice(0, at);
  const sigil = upto.lastIndexOf("@");
  if (sigil < 0) {
    return null;
  }
  if (sigil > 0 && !/\s/.test(upto[sigil - 1] as string)) {
    return null;
  }
  const query = upto.slice(sigil + 1);
  if (!/^[^\s@]*$/.test(query)) {
    return null;
  }
  if (at >= text.length || /\s/.test(text.slice(at, at + 1))) {
    return { start: sigil, query };
  }
  return null;
}

export function splitMentionQuery(query: string): { dir: string; file: string } {
  const slash = query.lastIndexOf("/");
  if (slash < 0) {
    return { dir: "", file: query };
  }
  return { dir: query.slice(0, slash), file: query.slice(slash + 1) };
}

export function applyMention(value: string, caret: number, start: number, rel: string): { value: string; caret: number } {
  const text = String(value ?? "");
  const at = Math.max(0, Math.min(Math.floor(caret) || 0, text.length));
  const next = `${text.slice(0, start)}@${rel} ${text.slice(at).replace(/^\s+/, "")}`;
  return { value: next, caret: start + rel.length + 2 };
}

const EXTRACT_RE = /(?:^|\s)@([^\s@]+)/g;

export function extractMentions(text: string): string[] {
  const found: string[] = [];
  EXTRACT_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = EXTRACT_RE.exec(String(text ?? "")))) {
    const rel = match[1].replace(/[.,;:!?)]+$/, "");
    if (rel && !found.includes(rel)) {
      found.push(rel);
    }
  }
  return found;
}

export function buildMentionContext(files: { rel: string; content: string }[]): string {
  if (!files.length) {
    return "";
  }
  const parts = files.map(({ rel, content }) => `File @${rel}:\n\`\`\`\n${content}\n\`\`\``);
  return `\n\n[Attached files]\n${parts.join("\n\n")}`;
}
