import type { ChatMsg, AttachedFile } from './types';

export function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
export function escapeHtml(t: string): string {
  return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
export function fmtSize(n: number): string {
  if (n < 1024) return n + ' B';
  if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1048576).toFixed(1) + ' MB';
}
export function cmpVersions(a: string, b: string): number {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}
export function usageParts(u: string | null | undefined): { pct: string | null; reset: string } {
  const m = (u || '').match(/(\d+)%/);
  const r = (u || '').match(/resets?\s+in\s+(.+)$/i);
  return { pct: m ? m[1] : null, reset: r ? r[1].trim() : '' };
}
export interface ToolMeta { ico: string; cls: string }
export function toolMeta(name: string | null | undefined): ToolMeta {
  const n = String(name || '').toLowerCase();
  if (/write|edit|apply|patch|multiedit/.test(n)) return { ico: '✎', cls: 't-write' };
  if (/shell|command|exec|terminal|bash/.test(n)) return { ico: '>_', cls: 't-term' };
  if (/web|fetch|browser|http/.test(n)) return { ico: '🌐', cls: 't-web' };
  if (/search|grep|glob|find|list/.test(n)) return { ico: '🔍', cls: 't-search' };
  if (/read|view|open|cat/.test(n)) return { ico: '📄', cls: 't-read' };
  if (/model|response|think/.test(n)) return { ico: '✦', cls: 't-model' };
  return { ico: '⚙', cls: 't-misc' };
}
export function extractDetail(raw: unknown): string {
  try {
    const keys = ['command', 'cmd', 'path', 'file', 'query', 'url', 'pattern'];
    const seen = new Set<object>();
    const walk = (o: unknown, d: number): string | null => {
      if (!o || d > 3 || typeof o !== 'object' || seen.has(o)) return null;
      seen.add(o);
      const rec = o as Record<string, unknown>;
      for (const k of keys) if (typeof rec[k] === 'string' && rec[k]) return rec[k] as string;
      for (const k in rec) {
        const r = walk(rec[k], d + 1);
        if (r) return r;
      }
      return null;
    };
    const r = walk(raw, 0);
    return r ? String(r).slice(0, 160) : '';
  } catch {
    return '';
  }
}
export interface ExecParams {
  id: string; command: string; cwd?: string; mode: string; model?: string; effort?: string;
  contributor?: string; sessionId?: string; maxSteps?: number;
  flags: Record<string, unknown>; history: { role: string; text: string }[]; context?: string; provider?: string;
}
export function buildExec(p: ExecParams): Record<string, unknown> {
  return {
    id: p.id, action: 'exec', command: p.command, cwd: p.cwd,
    mode: p.mode === 'custom' ? 'build' : p.mode,
    model: p.model || undefined, effort: p.effort || undefined,
    contributor: p.contributor === 'on' ? 'on' : undefined,
    sessionId: p.sessionId, maxSteps: p.maxSteps, flags: p.flags,
    history: p.history, context: p.context || undefined, provider: p.provider,
  };
}
export function buildHistory(messages: ChatMsg[]): { role: string; text: string }[] {
  return messages
    .filter((m) => m.type === 'user' || m.type === 'muse')
    .slice(-10)
    .map((m) => ({ role: m.type, text: m.text }));
}
export function buildContext(files: AttachedFile[]): string {
  if (!files.length) return '';
  return files.map((a) => '--- ' + a.rel + ' ---\n' + a.content).join('\n\n');
}