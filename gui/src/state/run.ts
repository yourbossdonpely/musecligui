import { useCallback, useRef, useState } from 'react';
import type { IBridge, ExecEvent } from '../lib/bridge';
import type { AttachedFile, ChatMsg, Project, Settings } from '../lib/types';
import { buildContext, buildExec, buildHistory } from '../lib/protocol';

export interface ToolState { taskId: string; name: string; event: string; raw: unknown; t0: number }
export interface RunState { id: string; text: string; tools: ToolState[]; log: string[]; usage: unknown; t0: number; stopped: boolean; started: boolean }
export interface RunSnap { projects: Project[]; sel: { p: number | null; s: number | null }; settings: Settings; attached: AttachedFile[] }
interface Deps {
  client: IBridge;
  getSnap: () => RunSnap;
  appendMessage: (m: ChatMsg) => void;
  toast: (t: string) => void;
  bumpRuns: () => void;
  clearAttached: () => void;
}

let runSeq = 0;

export function useRunEngine(deps: Deps) {
  const [run, setRun] = useState<RunState | null>(null);
  const liveRef = useRef<{ id: string; t0: number; stopped: boolean } | null>(null);
  const startedRef = useRef(false);
  const toolsRef = useRef(0);
  const deltasRef = useRef(0);
  const depsRef = useRef(deps);
  depsRef.current = deps;
  const watchRef = useRef<{ id: string; timer: ReturnType<typeof setTimeout> } | null>(null);

  const clearWatch = useCallback(() => {
    if (watchRef.current) {
      clearTimeout(watchRef.current.timer);
      watchRef.current = null;
    }
  }, []);

  const finish = useCallback(async (id: string, m: ExecEvent) => {
    const live = liveRef.current;
    if (!live || live.id !== id) return;
    liveRef.current = null;
    clearWatch();
    setRun(null);
    const d = depsRef.current;
    const failed = m.terminal === 'failed' || (typeof m.exitCode === 'number' && m.exitCode !== 0 && !m.text);
    let text = String(m.text || '(no output)');
    if (live.stopped) text += '\n\n[Stopped by user]';
    d.appendMessage({ type: 'muse', text });
    const stats = (m.stats as { deltas?: number; tools?: number } | undefined) ?? {};
    d.appendMessage({ type: 'thought', text: 'Thought ' + ((Date.now() - live.t0) / 1000).toFixed(1) + 's · ' + (stats.tools ?? toolsRef.current) + ' tool events · ' + (stats.deltas ?? deltasRef.current) + ' deltas' });
    if (failed && m.reason) d.appendMessage({ type: 'system', text: 'Run failed: ' + String(m.reason) });
    const snap = d.getSnap();
    const proj = snap.projects.find((p) => p.id === snap.sel.p);
    if (proj) {
      try {
        const gg = (await d.client.rpc('git-status', { cwd: proj.path }, 20000)) as { repo?: boolean; lines?: string[] };
        if (gg && gg.repo) {
          const lines = gg.lines ?? [];
          d.appendMessage({ type: 'checkpoint', text: lines.length ? lines.length + ' file' + (lines.length === 1 ? '' : 's') + ' changed' : 'no file changes', data: lines });
        }
      } catch {
        /* git optional */
      }
    }
    d.bumpRuns();
  }, [clearWatch]);

  const fail = useCallback((id: string, err: string) => {
    const live = liveRef.current;
    if (!live || live.id !== id) return;
    liveRef.current = null;
    clearWatch();
    setRun(null);
    depsRef.current.appendMessage({ type: 'muse', text: 'Error: ' + err });
  }, [clearWatch]);

  const handleEvent = useCallback((id: string, m: ExecEvent) => {
    if (m.type === 'exec-start') {
      startedRef.current = true;
      clearWatch();
      setRun((prev) => (prev && prev.id === id ? { ...prev, started: true } : prev));
    } else if (m.type === 'exec-delta' && typeof m.text === 'string') {
      const t = m.text;
      deltasRef.current += 1;
      setRun((prev) => (prev && prev.id === id ? { ...prev, text: prev.text + t } : prev));
    } else if (m.type === 'exec-tool') {
      const taskId = String(m.taskId ?? 't' + Date.now());
      const name = String(m.name ?? 'task');
      const event = String(m.event ?? 'running');
      toolsRef.current += 1;
      setRun((prev) => {
        if (!prev || prev.id !== id) return prev;
        const ix = prev.tools.findIndex((t) => t.taskId === taskId);
        const tools = ix >= 0
          ? prev.tools.map((t, i) => (i === ix ? { ...t, name, event, raw: m.raw } : t))
          : [...prev.tools, { taskId, name, event, raw: m.raw, t0: Date.now() }];
        return { ...prev, tools };
      });
    } else if (m.type === 'exec-log' && typeof m.text === 'string') {
      const t = m.text;
      setRun((prev) => (prev && prev.id === id ? { ...prev, log: [...prev.log.slice(-199), t] } : prev));
    } else if (m.type === 'exec-usage') {
      setRun((prev) => (prev && prev.id === id ? { ...prev, usage: m.usage } : prev));
    } else if (m.type === 'exec-done') {
      void finish(id, m);
    } else if (m.type === 'result' && m.ok === false) {
      fail(id, String(m.error || 'Run failed'));
    }
  }, [clearWatch, fail, finish]);

  const send = useCallback((text: string) => {
    const t = text.trim();
    if (!t || liveRef.current) return;
    const d = depsRef.current;
    const snap = d.getSnap();
    d.appendMessage({ type: 'user', text: t + (snap.attached.length ? '\n[+' + snap.attached.length + ' attached file(s)]' : '') });
    d.clearAttached();
    if (!d.client.connected) {
      setTimeout(() => {
        const l = t.toLowerCase();
        d.appendMessage({
          type: 'muse',
          text: l.includes('hello') || l === 'hi' || l.startsWith('hi ')
            ? "Hello! I'm Muse CLI GUI (Demo Mode). Connect the bridge to control the real CLI."
            : 'Demo: "' + t + '". Start the bridge and click the status bar to connect the real Muse CLI.',
        });
      }, 900);
      return;
    }
    const id = 'e' + ++runSeq + '-' + Date.now();
    const proj = snap.projects.find((p) => p.id === snap.sel.p);
    const sess = proj?.sessions.find((s) => s.id === snap.sel.s);
    liveRef.current = { id, t0: Date.now(), stopped: false };
    startedRef.current = false;
    toolsRef.current = 0;
    deltasRef.current = 0;
    setRun({ id, text: '', tools: [], log: [], usage: null, t0: Date.now(), stopped: false, started: false });
    d.client.onExec(id, (m) => handleEvent(id, m));
    try {
      d.client.sendExec(id, buildExec({
        id, command: t, cwd: proj?.path, mode: snap.settings.mode, model: snap.settings.model,
        effort: snap.settings.effort, contributor: snap.settings.contributor, sessionId: sess?.sid,
        flags: snap.settings.flags as unknown as Record<string, unknown>,
        history: buildHistory(sess?.messages ?? []), context: buildContext(snap.attached) || undefined,
      }));
    } catch (e) {
      d.client.offExec(id);
      liveRef.current = null;
      setRun(null);
      d.appendMessage({ type: 'muse', text: 'Error: ' + (e instanceof Error ? e.message : String(e)) });
      return;
    }
    watchRef.current = {
      id,
      timer: setTimeout(() => {
        const live = liveRef.current;
        if (live && live.id === id && !startedRef.current) d.toast('Bridge is taking a while to start this run — check the bridge window.');
      }, 45000),
    };
  }, [handleEvent, clearWatch]);

  const stop = useCallback(() => {
    const live = liveRef.current;
    if (!live) return;
    live.stopped = true;
    const d = depsRef.current;
    setRun((prev) => (prev ? { ...prev, stopped: true } : prev));
    d.client.rpc('stop', {}, 10000).then(
      () => d.toast('Stop requested — waiting for the run to end.'),
      (e: unknown) => {
        if (liveRef.current) liveRef.current.stopped = false;
        setRun((prev) => (prev ? { ...prev, stopped: false } : prev));
        d.toast('Stop failed: ' + (e instanceof Error ? e.message : String(e)));
      },
    );
  }, []);

  return { run, send, stop };
}