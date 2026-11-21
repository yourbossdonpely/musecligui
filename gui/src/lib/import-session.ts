import type { ChatMsg } from './types';

type Role = 'user' | 'muse' | 'system';

function mdSection(body: string, role: Exclude<Role, 'system'>, out: ChatMsg[]): void {
  let buf: string[] = [];
  const flush = () => {
    const t = buf.join('\n').trim();
    buf = [];
    if (t) out.push({ type: role, text: t });
  };
  for (const line of body.split('\n')) {
    if (/^>\s?/.test(line)) {
      flush();
      const t = line.replace(/^>\s?/, '').trim();
      if (t) out.push({ type: 'system', text: t });
    } else {
      buf.push(line);
    }
  }
  flush();
}

export function parseSessionFile(fileName: string, text: string): { name: string; messages: ChatMsg[] } {
  const base = fileName.replace(/\.[^.]+$/, '') || 'Imported';
  if (/\.json$/i.test(fileName)) {
    let j: unknown;
    try {
      j = JSON.parse(text);
    } catch {
      throw new Error('Invalid JSON.');
    }
    const arr = (Array.isArray(j) ? j : (j as { messages?: unknown }).messages) as unknown[];
    if (!Array.isArray(arr) || !arr.length) throw new Error('No messages found in JSON.');
    const messages = arr
      .filter((m): m is { type: Role; text: string } => !!m && typeof m === 'object' && ((m as { type: unknown }).type === 'user' || (m as { type: unknown }).type === 'muse' || (m as { type: unknown }).type === 'system') && typeof (m as { text: unknown }).text === 'string' && ((m as { text: string }).text.trim().length > 0))
      .map((m) => ({ type: m.type, text: m.text }));
    if (!messages.length) throw new Error('No messages found in JSON.');
    let name = base;
    if (!Array.isArray(j) && typeof (j as { name?: unknown }).name === 'string' && (j as { name: string }).name.trim()) {
      name = (j as { name: string }).name;
    }
    return { name, messages };
  }
  if (/\.md(arkdown)?$/i.test(fileName)) {
    const parts = text.split(/^##\s+(You|Muse)\s*$/m);
    const messages: ChatMsg[] = [];
    for (let i = 1; i + 1 < parts.length; i += 2) {
      mdSection(parts[i + 1], parts[i].toLowerCase() === 'you' ? 'user' : 'muse', messages);
    }
    if (!messages.length) throw new Error('No messages found in markdown.');
    return { name: base, messages };
  }
  throw new Error('Unsupported file type (use .md or .json).');
}