import type { Project, Session, Settings, ChatMsg } from './types';
import { defaultSettings } from './modes';
import { uuid } from './protocol';

export interface KV { getItem(k: string): string | null; setItem(k: string, v: string): void }
function browserStore(): KV | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}
function read<T>(store: KV | null | undefined, key: string, fallback: T): T {
  try {
    const raw = (store ?? browserStore())?.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
function write(store: KV | null | undefined, key: string, value: unknown): void {
  try {
    (store ?? browserStore())?.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable */
  }
}
function backfillSession(s: Partial<Session> & { messages?: ChatMsg[] }): Session {
  return {
    id: typeof s.id === 'number' ? s.id : Date.now() + Math.random(),
    sid: typeof s.sid === 'string' && s.sid ? s.sid : uuid(),
    name: typeof s.name === 'string' ? s.name : 'Session',
    time: typeof s.time === 'string' ? s.time : '',
    messages: Array.isArray(s.messages) ? (s.messages as ChatMsg[]) : [],
    tokensUsed: typeof s.tokensUsed === 'number' ? s.tokensUsed : 0,
  };
}
export function loadProjects(store?: KV): Project[] {
  const raw = read<Partial<Project>[]>(store, 'muse_projects', []);
  if (!Array.isArray(raw)) return [];
  return raw.map((p) => ({
    id: typeof p.id === 'number' ? p.id : Date.now() + Math.random(),
    name: typeof p.name === 'string' ? p.name : 'Project',
    path: typeof p.path === 'string' ? p.path : '',
    expanded: !!p.expanded,
    sessions: Array.isArray(p.sessions) ? p.sessions.map(backfillSession) : [],
  }));
}
export function saveProjects(store: KV | undefined, projects: Project[]): void {
  write(store, 'muse_projects', projects);
}
export function loadSettings(store?: KV): Settings {
  const d = defaultSettings();
  const raw = read<Partial<Settings>>(store, 'muse_settings', {});
  return { ...d, ...raw, flags: { ...d.flags, ...(raw.flags ?? {}) }, contextWindows: { ...d.contextWindows, ...(raw.contextWindows ?? {}) } };
}
export function saveSettings(store: KV | undefined, settings: Settings): void {
  write(store, 'muse_settings', settings);
}
export interface Selection { p: number | null; s: number | null }
export function loadSelection(store?: KV): Selection | null {
  const raw = read<{ p: unknown; s: unknown } | null>(store, 'muse_selected', null);
  if (!raw || typeof raw !== 'object') return null;
  return {
    p: typeof raw.p === 'number' ? raw.p : null,
    s: typeof raw.s === 'number' ? raw.s : null,
  };
}
export function saveSelection(store: KV | undefined, sel: Selection): void {
  write(store, 'muse_selected', sel);
}