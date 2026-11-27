import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { BridgeClient, type IBridge } from '../lib/bridge';
import type { AttachedFile, ChatMsg, Project, Session, Settings } from '../lib/types';
import { loadProjects, saveProjects, loadSettings, saveSettings, loadSelection, saveSelection, type Selection } from '../lib/storage';
import { MODES, defaultSettings } from '../lib/modes';
import { cmpVersions, uuid } from '../lib/protocol';
import { extractMentions } from '../lib/mentions';
import { stopSpeech } from '../lib/speech';
import { buildSessionMarkdown } from '../lib/export-session';
import { parseSessionFile } from '../lib/import-session';
import { MAX_RUNS, useRunEngine, type RunState } from './run';

export const BRIDGE_URL = String(import.meta.env.VITE_BRIDGE_URL || 'ws://localhost:8765');
export const MIN_BRIDGE = '2.7.0';
export type ConnStatus = 'connecting' | 'open' | 'closed';
export interface ToastMsg { id: number; text: string }
export type ModalKind = 'project' | 'picker' | 'model' | 'perms' | 'file' | 'mcp' | null;
export interface ModalState { kind: ModalKind; editProject?: number | null; onPick?: ((p: string) => void) | null; previewRel?: string | null }

interface AppValue {
  client: IBridge;
  status: ConnStatus;
  bridgeOutdated: string | null;
  projects: Project[];
  sel: Selection;
  settings: Settings;
  attached: AttachedFile[];
  run: RunState | null;
  runs: RunState[];
  stopRun: (id: string) => void;
  liveCount: () => number;
  toasts: ToastMsg[];
  modal: ModalState;
  runsDone: number;
  usage: { tier: string; window: string; weekly: string } | null;
  refreshUsage: () => void;
  lastTokens: { inp: number; out: number } | null;
  inspectorTab: string;
  setInspectorTab: (t: string) => void;
  draft: string;
  setDraft: (s: string) => void;
  project: Project | null;
  session: Session | null;
  currentMessages: ChatMsg[];
  reconnect: () => void;
  toast: (t: string) => void;
  openModal: (m: ModalState) => void;
  closeModal: () => void;
  appendMessage: (m: ChatMsg) => void;
  selectProject: (idx: number) => void;
  toggleProject: (idx: number) => void;
  addProject: (name: string, path: string) => Promise<string | null>;
  updateProject: (idx: number, name: string, path: string) => Promise<string | null>;
  deleteProject: (idx: number) => void;
  addSession: (pIdx: number) => void;
  selectSession: (pIdx: number, sIdx: number) => void;
  deleteSession: (pIdx: number, sIdx: number) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  setMode: (mode: string) => void;
  attachFile: (rel: string, content: string) => boolean;
  queue: string[];
  clearQueue: () => void;
  importSession: (pIdx: number, fileName: string, text: string) => void;
  exportCurrentSession: () => void;
  removeAttach: (i: number) => void;
  send: (text: string) => void;
  stop: () => void;
  bridgePaused: boolean;
  stopBridge: () => void;
  startBridge: () => void;
  quitBridge: () => void;
  compactSession: () => void;
}

const AppCtx = createContext<AppValue | null>(null);
export function useApp(): AppValue {
  const v = useContext(AppCtx);
  if (!v) throw new Error('useApp outside provider');
  return v;
}

let toastSeq = 0;

export function AppProvider({ client: injected, children }: { client?: IBridge; children: React.ReactNode }) {
  const [client] = useState<IBridge>(() => injected ?? new BridgeClient());
  const [status, setStatus] = useState<ConnStatus>('connecting');
  const [bridgeOutdated, setBridgeOutdated] = useState<string | null>(null);
  const [bridgePaused, setBridgePaused] = useState(false);
  const [projects, setProjects] = useState<Project[]>(() => loadProjects());
  const [sel, setSel] = useState<Selection>(() => loadSelection() ?? { p: null, s: null });
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [attached, setAttached] = useState<AttachedFile[]>([]);
  const [draft, setDraft] = useState('');
  const [ephemeral, setEphemeral] = useState<ChatMsg[]>([]);
  const [toasts, setToasts] = useState<ToastMsg[]>([]);
  const [modal, setModal] = useState<ModalState>({ kind: null });
  const [queue, setQueue] = useState<string[]>([]);
  const [runsDone, setRunsDone] = useState(0);
  const [usage, setUsage] = useState<{ tier: string; window: string; weekly: string } | null>(null);
  const [lastTokens, setLastTokens] = useState<{ inp: number; out: number } | null>(null);
  const [inspectorTab, setInspectorTab] = useState('files');

  const snap = useRef({ projects, sel, settings, attached });
  snap.current = { projects, sel, settings, attached };

  useEffect(() => { saveProjects(undefined, projects); }, [projects]);
  useEffect(() => { saveSettings(undefined, settings); }, [settings]);
  useEffect(() => { saveSelection(undefined, sel); }, [sel]);

  const toast = useCallback((text: string) => {
    const id = ++toastSeq;
    setToasts((prev) => [...prev, { id, text }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  const appendMessage = useCallback((msg: ChatMsg) => {
    const stamped: ChatMsg = { time: new Date().toISOString(), ...msg };
    const { projects: ps, sel: s } = snap.current;
    const p = ps.find((x) => x.id === s.p);
    const sess = p?.sessions.find((x) => x.id === s.s);
    if (!p || !sess) {
      setEphemeral((prev) => [...prev, stamped]);
      return;
    }
    setProjects((prev) => prev.map((x) => (x.id === p.id ? { ...x, sessions: x.sessions.map((y) => (y.id === sess.id ? { ...y, messages: [...y.messages, stamped] } : y)) } : x)));
  }, []);

  const bumpRuns = useCallback(() => setRunsDone((n) => n + 1), []);
  const refreshUsage = useCallback(() => {
    if (!client.connected) return;
    client.rpc('usage', {}, 60000).then(
      (u) => { const v = u as { tier?: string; window?: string; weekly?: string }; setUsage({ tier: v.tier ?? '', window: v.window ?? '', weekly: v.weekly ?? '' }); },
      () => {},
    );
  }, [client]);
  useEffect(() => { refreshUsage(); }, [refreshUsage, status, runsDone]);
  const setTokens = useCallback((t: { inp: number; out: number }) => setLastTokens(t), []);
  const clearAttached = useCallback(() => setAttached([]), []);
  const getSnap = useCallback(() => snap.current, []);
  const addSessionTokens = useCallback((n: number) => {
    const sid = snap.current.sel.s;
    if (sid == null) return;
    setProjects((prev) => prev.map((p) => ({ ...p, sessions: p.sessions.map((s) => (s.id === sid ? { ...s, tokensUsed: (s.tokensUsed ?? 0) + n } : s)) })));
  }, []);
  const { run, runs, send: engineSend, stop, stopRun, liveCount } = useRunEngine({ client, getSnap, appendMessage, toast, bumpRuns, clearAttached, setLastTokens: setTokens, addSessionTokens });

  const stopBridge = useCallback(() => {
    client.rpc('bridge-stop', {}, 15000).then(
      () => { setBridgePaused(true); toast('Bridge stopped — runs paused. Click Start to resume.'); },
      (e) => toast('Stop failed: ' + (e instanceof Error ? e.message : String(e))),
    );
  }, [client, toast]);
  const startBridge = useCallback(() => {
    client.rpc('bridge-start', {}, 15000).then(
      () => { setBridgePaused(false); toast('Bridge started.'); },
      (e) => toast('Start failed: ' + (e instanceof Error ? e.message : String(e))),
    );
  }, [client, toast]);
  const quitBridge = useCallback(() => {
    client.rpc('bridge-shutdown', {}, 15000).then(
      () => toast('Bridge shutting down — re-run MuseCLIGUI.exe to restart. This window reconnects automatically.'),
      (e) => toast('Shutdown failed: ' + (e instanceof Error ? e.message : String(e))),
    );
  }, [client, toast]);
  const reconnect = useCallback(() => {
    setStatus('connecting');
    setBridgeOutdated(null);
    client.connect(BRIDGE_URL);
  }, [client]);

  useEffect(() => {
    let alive = true;
    let retry: ReturnType<typeof setTimeout> | null = null;
    client.onOpen = () => {
      if (!alive) return;
      setStatus('open');
      client.rpc('ping', {}, 10000).then(
        (info) => {
          if (!alive) return;
          const cur = String((info as { version?: string; paused?: boolean } | null)?.version ?? '0');
          setBridgePaused((info as { paused?: boolean } | null)?.paused === true);
          setBridgeOutdated(cmpVersions(cur, MIN_BRIDGE) < 0 ? cur : null);
        },
        () => { if (alive) setBridgeOutdated('?'); },
      );
    };
    client.onClose = () => {
      if (!alive) return;
      setStatus('closed');
      retry = setTimeout(() => {
        if (!alive) return;
        setStatus('connecting');
        client.connect(BRIDGE_URL);
      }, 3000);
    };
    client.onLegacy = (text, isError) => {
      if (!alive) return;
      appendMessage({ type: 'muse', text: (isError ? 'Error: ' : '') + text });
    };
    client.connect(BRIDGE_URL);
    return () => {
      alive = false;
      if (retry) clearTimeout(retry);
      client.close();
    };
  }, [client, appendMessage]);

  const project = useMemo(() => projects.find((p) => p.id === sel.p) ?? null, [projects, sel.p]);
  const session = useMemo(() => project?.sessions.find((s) => s.id === sel.s) ?? null, [project, sel.s]);
  const compactWarned = useRef<number | null>(null);
  useEffect(() => {
    if (session?.id == null) return;
    const win = settings.contextWindows?.[settings.model] ?? 0;
    const used = session.tokensUsed ?? 0;
    if (win > 0 && used / win >= 0.8 && compactWarned.current !== session.id) {
      compactWarned.current = session.id;
      toast('Session context is over 80% — press Compact to continue fresh.');
    }
  }, [session, settings, toast]);
  const currentMessages = useMemo(() => session?.messages ?? ephemeral, [session, ephemeral]);

  const selectProject = useCallback((idx: number) => {
    setProjects((prev) => {
      const p = prev[idx];
      if (!p) return prev;
      const keep = p.sessions.some((s) => s.id === snap.current.sel.s);
      setSel({ p: p.id, s: keep ? snap.current.sel.s : (p.sessions[0]?.id ?? null) });
      return prev.map((x, i) => (i === idx ? { ...x, expanded: true } : x));
    });
  }, []);
  const toggleProject = useCallback((idx: number) => {
    setProjects((prev) => {
      const p = prev[idx];
      if (!p) return prev;
      const expanded = !p.expanded;
      if (expanded) {
        const keep = p.sessions.some((s) => s.id === snap.current.sel.s);
        setSel({ p: p.id, s: keep ? snap.current.sel.s : (p.sessions[0]?.id ?? null) });
      }
      return prev.map((x, i) => (i === idx ? { ...x, expanded } : x));
    });
  }, []);

  const checkPath = useCallback(async (path: string): Promise<string | null> => {
    if (!client.connected) return null;
    try {
      await client.rpc('fs-list', { root: path, rel: '' }, 15000);
      return null;
    } catch {
      return 'Folder not found or not readable: ' + path;
    }
  }, [client]);

  const addProject = useCallback(async (name: string, path: string): Promise<string | null> => {
    if (!name.trim() || !path.trim()) return 'Please fill in both project name and folder path.';
    const err = await checkPath(path.trim());
    if (err) {
      toast(err);
      return err;
    }
    const now = new Date();
    const np: Project = {
      id: Date.now() + Math.random(), name: name.trim(), path: path.trim(), expanded: true,
      sessions: [{ id: Date.now(), sid: '', name: 'Session 1', tokensUsed: 0, time: now.toLocaleDateString() + ' ' + now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), messages: [] }],
    };
    np.sessions[0].sid = uuid();
    setProjects((prev) => [...prev, np]);
    setSel({ p: np.id, s: np.sessions[0].id });
    return null;
  }, [checkPath, toast]);

  const updateProject = useCallback(async (idx: number, name: string, path: string): Promise<string | null> => {
    if (!name.trim() || !path.trim()) return 'Please fill in both project name and folder path.';
    const err = await checkPath(path.trim());
    if (err) {
      toast(err);
      return err;
    }
    setProjects((prev) => prev.map((p, i) => (i === idx ? { ...p, name: name.trim(), path: path.trim() } : p)));
    const p = snap.current.projects[idx];
    if (p) setSel((s) => ({ ...s, p: p.id }));
    return null;
  }, [checkPath, toast]);

  const deleteProject = useCallback((idx: number) => {
    setProjects((prev) => {
      const gone = prev[idx]?.id === snap.current.sel.p;
      if (gone) setSel({ p: null, s: null });
      return prev.filter((_, i) => i !== idx);
    });
  }, []);

  const addSession = useCallback((pIdx: number) => {
    const now = new Date();
    const sid = uuid();
    setProjects((prev) => {
      const p = prev[pIdx];
      if (!p) return prev;
      const s: Session = { id: Date.now() + Math.random(), sid, name: 'Session ' + (p.sessions.length + 1), tokensUsed: 0, time: now.toLocaleDateString() + ' ' + now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), messages: [] };
      setSel({ p: p.id, s: s.id });
      return prev.map((x, i) => (i === pIdx ? { ...x, sessions: [...x.sessions, s] } : x));
    });
  }, []);
  const selectSession = useCallback((pIdx: number, sIdx: number) => {
    const p = snap.current.projects[pIdx];
    const s = p?.sessions[sIdx];
    if (p && s) setSel({ p: p.id, s: s.id });
  }, []);
  const deleteSession = useCallback((pIdx: number, sIdx: number) => {
    setProjects((prev) => {
      const p = prev[pIdx];
      if (!p || p.sessions.length <= 1) {
        if (p) toast('Cannot delete the last session — create a new one first.');
        return prev;
      }
      const was = p.sessions[sIdx]?.id === snap.current.sel.s;
      const sessions = p.sessions.filter((_, i) => i !== sIdx);
      if (was) setSel({ p: p.id, s: sessions[0].id });
      return prev.map((x, i) => (i === pIdx ? { ...x, sessions } : x));
    });
  }, [toast]);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => ({ ...prev, ...patch, flags: { ...prev.flags, ...(patch.flags ?? {}) } }));
  }, []);
  const setMode = useCallback((mode: string) => {
    const def = MODES[mode];
    if (!def) return;
    setSettings((prev) => ({ ...prev, mode, flags: { ...def.flags } }));
  }, []);
  const attachFile = useCallback((rel: string, content: string): boolean => {
    const cur = snap.current.attached;
    if (cur.length >= 5) {
      toast('Attach limit reached (5 files).');
      return false;
    }
    if (cur.some((a) => a.rel === rel)) {
      toast('Already attached: ' + rel);
      return false;
    }
    setAttached((prev) => [...prev, { rel, content: content.slice(0, 15000) }]);
    return true;
  }, [toast]);
  const removeAttach = useCallback((i: number) => {
    setAttached((prev) => prev.filter((_, ix) => ix !== i));
  }, []);
  const queueRef = useRef<string[]>([]);
  queueRef.current = queue;
  const exportCurrentSession = useCallback(() => {
    const { projects: ps, sel: s } = snap.current;
    const p = ps.find((x) => x.id === s.p);
    const sess = p?.sessions.find((x) => x.id === s.s);
    if (!p || !sess) {
      toast('No session selected.');
      return;
    }
    const md = buildSessionMarkdown(p.name, sess.name, sess.messages);
    try {
      const u = URL as unknown as { createObjectURL?: (b: Blob) => string; revokeObjectURL?: (u: string) => void };
      if (typeof u.createObjectURL !== 'function') {
        toast('Export not supported in this browser.');
        return;
      }
      const blob = new Blob([md], { type: 'text/markdown' });
      const a = document.createElement('a');
      a.href = u.createObjectURL(blob);
      a.download = 'muse-session-' + Date.now() + '.md';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        if (u.revokeObjectURL) u.revokeObjectURL(a.href);
        a.remove();
      }, 1000);
      toast('Session exported.');
    } catch (e) {
      toast('Export failed: ' + (e instanceof Error ? e.message : String(e)));
    }
  }, [toast]);
  const importSession = useCallback((pIdx: number, fileName: string, text: string) => {
    let parsed;
    try {
      parsed = parseSessionFile(fileName, text);
    } catch (e) {
      toast('Import failed: ' + (e instanceof Error ? e.message : String(e)));
      return;
    }
    const now = new Date();
    setProjects((prev) => {
      const p = prev[pIdx];
      if (!p) return prev;
      const s = { id: Date.now() + Math.random(), sid: uuid(), name: parsed.name, tokensUsed: 0, time: now.toLocaleDateString() + ' ' + now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), messages: parsed.messages.map((m) => ({ ...m, time: now.toISOString() })) };
      setSel({ p: p.id, s: s.id });
      return prev.map((x, i) => (i === pIdx ? { ...x, sessions: [...x.sessions, s] } : x));
    });
    toast('Imported ' + parsed.messages.length + ' messages.');
  }, [toast]);
  const handleSlash = useCallback((raw: string) => {
    const cmd = raw.trim().split(/\s+/)[0].toLowerCase();
    const modes: Record<string, string> = { '/build': 'build', '/supervised': 'supervised', '/plan': 'plan', '/research': 'research', '/debug': 'debug' };
    if (modes[cmd]) {
      setMode(modes[cmd]);
      toast('Mode: ' + MODES[modes[cmd]].label);
      return;
    }
    if (cmd === '/export') {
      exportCurrentSession();
      return;
    }
    if (cmd === '/clear') {
      const idx = snap.current.projects.findIndex((p) => p.id === snap.current.sel.p);
      if (idx < 0) {
        toast('No project selected.');
        return;
      }
      addSession(idx);
      return;
    }
    if (cmd === '/help') {
      appendMessage({ type: 'system', text: 'Commands: /build /supervised /plan /research /debug — switch modes. /export — download session. /clear — new session. /help — this list.' });
      return;
    }
    toast('Unknown command "' + cmd + '". Try /help.');
  }, [setMode, exportCurrentSession, addSession, appendMessage, toast]);
  const sendResolved = useCallback((text: string) => {
    const proj = snap.current.projects.find((x) => x.id === snap.current.sel.p);
    if (!proj || !client.connected) {
      engineSend(text);
      return;
    }
    const rels = extractMentions(text);
    if (!rels.length) {
      engineSend(text);
      return;
    }
    void (async () => {
      const failed: string[] = [];
      for (const rel of rels.slice(0, 5)) {
        try {
          const r = (await client.rpc('fs-read', { root: proj.path, rel }, 15000)) as { content?: string };
          if (typeof r?.content === 'string') attachFile(rel, r.content);
          else failed.push(rel);
        } catch {
          failed.push(rel);
        }
      }
      if (failed.length) toast('Could not attach: ' + failed.join(', '));
      // Let React flush the attach state so the engine sees it.
      await new Promise((r) => setTimeout(r, 0));
      engineSend(text);
    })();
  }, [client, attachFile, engineSend, toast]);
  const send = useCallback((text: string) => {
    const t = text.trim();
    if (!t) return;
    stopSpeech();
    if (t.startsWith('/')) {
      handleSlash(t);
      return;
    }
    if (liveCount() >= MAX_RUNS) {
      if (queueRef.current.length >= 3) {
        toast('Queue is full (3).');
        return;
      }
      setQueue((q) => [...q, text]);
      toast('Queued — sends when the run finishes.');
      return;
    }
    sendResolved(text);
  }, [sendResolved, liveCount, handleSlash, toast]);
  const compactSession = useCallback(() => {
    const { projects: ps, sel: s } = snap.current;
    const pIdx = ps.findIndex((x) => x.id === s.p);
    const p = pIdx >= 0 ? ps[pIdx] : null;
    const sess = p?.sessions.find((x) => x.id === s.s);
    if (!p || !sess) { toast('No session selected.'); return; }
    const turns = sess.messages.filter((m) => m.type === 'user' || m.type === 'muse');
    if (turns.length < 4) { toast('Session is still short — nothing to compact.'); return; }
    if (!client.connected) { toast('Bridge not connected.'); return; }
    const text = turns.map((m) => (m.type === 'muse' ? 'Muse: ' : 'User: ') + m.text).join('\n\n').slice(0, 80000);
    toast('Compacting session…');
    client.rpc('summarize', { text }, 300000).then(
      (r) => {
        const summary = String((r as { summary?: string } | null)?.summary || '');
        if (!summary) { toast('Compaction produced no summary.'); return; }
        addSession(pIdx);
        setTimeout(() => {
          appendMessage({ type: 'system', text: 'Compacted from "' + sess.name + '". Prior context:\n\n' + summary });
          toast('Session compacted — continuing fresh.');
        }, 50);
      },
      (e) => toast('Compaction failed: ' + (e instanceof Error ? e.message : String(e))),
    );
  }, [client, toast, appendMessage, addSession]);
  const clearQueue = useCallback(() => setQueue([]), []);
  useEffect(() => {
    if (liveCount() < MAX_RUNS && queue.length) {
      const next = queue[0];
      setQueue((q) => q.slice(1));
      sendResolved(next);
    }
  }, [runs, queue, sendResolved, liveCount]);
  const openModal = useCallback((m: ModalState) => setModal(m), []);
  const closeModal = useCallback(() => setModal({ kind: null }), []);

  const value: AppValue = {
    client, status, bridgeOutdated, projects, sel, settings, attached, run, runs, toasts, modal, usage, refreshUsage,
    runsDone, lastTokens, inspectorTab, setInspectorTab, draft, setDraft, queue, clearQueue, importSession, exportCurrentSession, project, session, currentMessages, reconnect, toast, openModal, closeModal,
    appendMessage, selectProject, toggleProject, addProject, updateProject, deleteProject,
    addSession, selectSession, deleteSession, updateSettings, setMode, attachFile,
    removeAttach, send, stop, stopRun, liveCount, bridgePaused, stopBridge, startBridge, quitBridge, compactSession,
  };
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}
