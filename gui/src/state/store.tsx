import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { BridgeClient, type IBridge } from '../lib/bridge';
import type { AttachedFile, ChatMsg, Project, Session, Settings } from '../lib/types';
import { loadProjects, saveProjects, loadSettings, saveSettings, loadSelection, saveSelection, type Selection } from '../lib/storage';
import { MODES, defaultSettings } from '../lib/modes';
import { cmpVersions, uuid } from '../lib/protocol';
import { useRunEngine, type RunState } from './run';

export const BRIDGE_URL = 'ws://localhost:8765';
export const MIN_BRIDGE = '2.1.0';
export type ConnStatus = 'connecting' | 'open' | 'closed';
export interface ToastMsg { id: number; text: string }
export type ModalKind = 'project' | 'picker' | 'model' | 'perms' | 'file' | null;
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
  toasts: ToastMsg[];
  modal: ModalState;
  runsDone: number;
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
  attachFile: (rel: string, content: string) => void;
  removeAttach: (i: number) => void;
  send: (text: string) => void;
  stop: () => void;
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
  const [projects, setProjects] = useState<Project[]>(() => loadProjects());
  const [sel, setSel] = useState<Selection>(() => loadSelection() ?? { p: null, s: null });
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [attached, setAttached] = useState<AttachedFile[]>([]);
  const [ephemeral, setEphemeral] = useState<ChatMsg[]>([]);
  const [toasts, setToasts] = useState<ToastMsg[]>([]);
  const [modal, setModal] = useState<ModalState>({ kind: null });
  const [runsDone, setRunsDone] = useState(0);

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
  const clearAttached = useCallback(() => setAttached([]), []);
  const getSnap = useCallback(() => snap.current, []);
  const { run, send, stop } = useRunEngine({ client, getSnap, appendMessage, toast, bumpRuns, clearAttached });

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
          const cur = String((info as { version?: string } | null)?.version ?? '0');
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
      sessions: [{ id: Date.now(), sid: '', name: 'Session 1', time: now.toLocaleDateString() + ' ' + now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), messages: [] }],
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
      const s: Session = { id: Date.now() + Math.random(), sid, name: 'Session ' + (p.sessions.length + 1), time: now.toLocaleDateString() + ' ' + now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), messages: [] };
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
  const attachFile = useCallback((rel: string, content: string) => {
    setAttached((prev) => {
      if (prev.length >= 5) {
        toast('Attach limit reached (5 files).');
        return prev;
      }
      if (prev.some((a) => a.rel === rel)) {
        toast('Already attached: ' + rel);
        return prev;
      }
      return [...prev, { rel, content: content.slice(0, 15000) }];
    });
  }, [toast]);
  const removeAttach = useCallback((i: number) => {
    setAttached((prev) => prev.filter((_, ix) => ix !== i));
  }, []);
  const openModal = useCallback((m: ModalState) => setModal(m), []);
  const closeModal = useCallback(() => setModal({ kind: null }), []);

  const value: AppValue = {
    client, status, bridgeOutdated, projects, sel, settings, attached, run, toasts, modal,
    runsDone, project, session, currentMessages, reconnect, toast, openModal, closeModal,
    appendMessage, selectProject, toggleProject, addProject, updateProject, deleteProject,
    addSession, selectSession, deleteSession, updateSettings, setMode, attachFile,
    removeAttach, send, stop,
  };
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}