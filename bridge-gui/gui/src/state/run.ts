import { useCallback, useRef, useState } from 'react';
import type { IBridge, ExecEvent } from '../lib/bridge';
import type { AttachedFile, ChatMsg, Project, Settings } from '../lib/types';
import { buildContext, buildExec, buildHistory } from '../lib/protocol';
import { SUGGEST_SUFFIX, fallbackSuggestions, parseSuggestions, stripSuggestions } from '../lib/suggestions';
import { stopSpeech } from '../lib/speech';

export interface ToolState { taskId: string; name: string; event: string; raw: unknown; t0: number }
export interface RunState { id: string; text: string; tools: ToolState[]; log: string[]; usage: unknown; t0: number; stopped: boolean; started: boolean }
export interface RunSnap { projects: Project[]; sel: { p: number | null; s: number | null }; settings: Settings; attached: AttachedFile[] }
interface Deps {
  client: IBridge;
  getSnap: () => RunSnap;
  appendMessage: (m: ChatMsg) => void;
  toast: (t: string) => void;
  bumpRuns: () => void;
  addSessionTokens: (n: number) => void;
  setLastTokens: (t: { inp: number; out: number }) => void;
  clearAttached: () => void;
}
interface LiveRun { id: string; t0: number; stopped: boolean; cpId: string | null; started: boolean; deltas: number; tools: number; toolsSnap: ToolState[]; watch: ReturnType<typeof setTimeout> | null }

export const MAX_RUNS = 3;

let runSeq = 0;

export function useRunEngine(deps: Deps) {
  const [runs, setRuns] = useState<RunState[]>([]);
  const liveRef = useRef(new Map<string, LiveRun>());
  const depsRef = useRef(deps);
  depsRef.current = deps;

  const clearWatch = useCallback((live: LiveRun) => {
    if (live.watch) {
      clearTimeout(live.watch);
      live.watch = null;
    }
  }, []);

  const patchRun = useCallback((id: string, patch: (r: RunState) => RunState) => {
    setRuns((prev) => prev.map((r) => (r.id === id ? patch(r) : r)));
  }, []);

  const finish = useCallback(async (id: string, m: ExecEvent) => {
    const live = liveRef.current.get(id);
    if (!live) return;
    liveRef.current.delete(id);
    clearWatch(live);
    setRuns((prev) => prev.filter((r) => r.id !== id));
    const d = depsRef.current;
    const failed = m.terminal === 'failed' || (typeof m.exitCode === 'number' && m.exitCode !== 0 && !m.text);
    const raw = String(m.text || '(no output)');
    const parsed = parseSuggestions(raw);
    let text = stripSuggestions(raw);
    if (live.stopped) text += '\n\n[Stopped by user]';
    const mode = d.getSnap().settings.mode;
    d.appendMessage({ type: 'muse', text, suggestions: parsed.length ? parsed : fallbackSuggestions(mode) });
    for (const t of live.toolsSnap) {
      d.appendMessage({ type: 'tool', text: t.name, tool: { name: t.name, event: t.event, t0: t.t0, durMs: Date.now() - t.t0, raw: t.raw } });
    }
    const stats = (m.stats as { deltas?: number; tools?: number } | undefined) ?? {};
    d.appendMessage({ type: 'thought', text: 'Thought ' + ((Date.now() - live.t0) / 1000).toFixed(1) + 's · ' + (stats.tools ?? live.tools) + ' tool events · ' + (stats.deltas ?? live.deltas) + ' deltas' });
    if (failed && m.reason) d.appendMessage({ type: 'system', text: 'Run failed: ' + String(m.reason) });
    const snap = d.getSnap();
    const proj = snap.projects.find((p) => p.id === snap.sel.p);
    if (proj) {
      try {
        const gg = (await d.client.rpc('git-status', { cwd: proj.path }, 20000)) as { repo?: boolean; lines?: string[] };
        if (gg && gg.repo) {
          const lines = gg.lines ?? [];
          d.appendMessage({ type: 'checkpoint', text: lines.length ? lines.length + ' file' + (lines.length === 1 ? '' : 's') + ' changed' : 'no file changes', data: lines, checkpointId: live.cpId || undefined });
        }
      } catch {
        /* git optional */
      }
    }
    d.bumpRuns();
  }, [clearWatch]);

  const fail = useCallback((id: string, err: string) => {
    const live = liveRef.current.get(id);
    if (!live) return;
    liveRef.current.delete(id);
    clearWatch(live);
    setRuns((prev) => prev.filter((r) => r.id !== id));
    depsRef.current.appendMessage({ type: 'muse', text: 'Error: ' + err });
  }, [clearWatch]);

  const handleEvent = useCallback((id: string, m: ExecEvent) => {
    const live = liveRef.current.get(id);
    if (!live) return;
    if (m.type === 'exec-start') {
      live.started = true;
      if (typeof m.checkpoint === 'string') live.cpId = m.checkpoint;
      clearWatch(live);
      setRuns((prev) => prev.map((r) => (r.id === id ? { ...r, started: true } : r)));
    } else if (m.type === 'exec-delta' && typeof m.text === 'string') {
      const t = m.text;
      live.deltas += 1;
      setRuns((prev) => prev.map((r) => (r.id === id ? { ...r, text: r.text + t } : r)));
    } else if (m.type === 'exec-tool') {
      const taskId = String(m.taskId ?? 't' + Date.now());
      const name = String(m.name ?? 'task');
      const event = String(m.event ?? 'running');
      live.tools += 1;
      const ti = live.toolsSnap.findIndex((t) => t.taskId === taskId);
      if (ti >= 0) live.toolsSnap[ti] = { ...live.toolsSnap[ti], name, event, raw: m.raw };
      else live.toolsSnap.push({ taskId, name, event, raw: m.raw, t0: Date.now() });
      setRuns((prev) => prev.map((r) => {
        if (r.id !== id) return r;
        const ix = r.tools.findIndex((t) => t.taskId === taskId);
        const tools = ix >= 0
          ? r.tools.map((t, i) => (i === ix ? { ...t, name, event, raw: m.raw } : t))
          : [...r.tools, { taskId, name, event, raw: m.raw, t0: Date.now() }];
        return { ...r, tools };
      }));
    } else if (m.type === 'exec-log' && typeof m.text === 'string') {
      const t = m.text;
      setRuns((prev) => prev.map((r) => (r.id === id ? { ...r, log: [...r.log.slice(-199), t] } : r)));
    } else if (m.type === 'exec-usage') {
      try {
        const mods = ((m.usage as { models?: Array<{ input_tokens?: number; output_tokens?: number }> }).models) ?? [];
        let inp = 0; let out = 0;
        mods.forEach((x) => { inp += x.input_tokens ?? 0; out += x.output_tokens ?? 0; });
        depsRef.current.setLastTokens({ inp, out });
        depsRef.current.addSessionTokens(inp + out);
      } catch {
        /* usage optional */
      }
      setRuns((prev) => prev.map((r) => (r.id === id ? { ...r, usage: m.usage } : r)));
    } else if (m.type === 'exec-diagnostics') {
      const issues = Array.isArray(m.issues) ? m.issues as Array<{ file?: string; line?: number; message?: string; tool?: string }> : [];
      if (issues.length) {
        const lines = issues.slice(0, 50).map((x) => String(x.file || '?') + (x.line ? ':' + x.line : '') + ' — ' + String(x.message || 'issue') + ' [' + String(x.tool || '?') + ']');
        depsRef.current.appendMessage({ type: 'diagnostics', text: issues.length + ' issue' + (issues.length === 1 ? '' : 's') + ' found after run', data: lines });
      }
    } else if (m.type === 'exec-done') {
      void finish(id, m);
    } else if (m.type === 'result' && m.ok === false) {
      fail(id, String(m.error || 'Run failed'));
    }
  }, [clearWatch, fail, finish]);

  const send = useCallback((text: string) => {
    const t = text.trim();
    if (!t || liveRef.current.size >= MAX_RUNS) return;
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
          suggestions: fallbackSuggestions(snap.settings.mode),
        });
      }, 900);
      return;
    }
    const id = 'e' + ++runSeq + '-' + Date.now();
    const proj = snap.projects.find((p) => p.id === snap.sel.p);
    const sess = proj?.sessions.find((s) => s.id === snap.sel.s);
    const live: LiveRun = { id, t0: Date.now(), stopped: false, cpId: null, started: false, deltas: 0, tools: 0, toolsSnap: [], watch: null };
    liveRef.current.set(id, live);
    setRuns((prev) => [...prev, { id, text: '', tools: [], log: [], usage: null, t0: Date.now(), stopped: false, started: false }]);
    d.client.onExec(id, (m) => handleEvent(id, m));
    try {
      d.client.sendExec(id, buildExec({
        id, command: t + SUGGEST_SUFFIX, cwd: proj?.path, mode: snap.settings.mode, model: snap.settings.model,
        effort: snap.settings.effort, contributor: snap.settings.contributor, sessionId: sess?.sid,
        flags: snap.settings.flags as unknown as Record<string, unknown>,
        history: buildHistory(sess?.messages ?? []), context: buildContext(snap.attached) || undefined,
      }));
    } catch (e) {
      d.client.offExec(id);
      liveRef.current.delete(id);
      setRuns((prev) => prev.filter((r) => r.id !== id));
      d.appendMessage({ type: 'muse', text: 'Error: ' + (e instanceof Error ? e.message : String(e)) });
      return;
    }
    live.watch = setTimeout(() => {
      const l = liveRef.current.get(id);
      if (l && !l.started) d.toast('Bridge is taking a while to start this run — check the bridge window.');
    }, 45000);
  }, [handleEvent, clearWatch]);

  const stopOne = useCallback((id: string) => {
    const live = liveRef.current.get(id);
    if (!live) return;
    stopSpeech();
    live.stopped = true;
    const d = depsRef.current;
    setRuns((prev) => prev.map((r) => (r.id === id ? { ...r, stopped: true } : r)));
    d.client.rpc('stop', { runId: id }, 10000).then(
      () => d.toast('Stop requested — waiting for the run to end.'),
      (e: unknown) => {
        const l = liveRef.current.get(id);
        if (l) l.stopped = false;
        setRuns((prev) => prev.map((r) => (r.id === id ? { ...r, stopped: false } : r)));
        d.toast('Stop failed: ' + (e instanceof Error ? e.message : String(e)));
      },
    );
  }, []);

  const stop = useCallback(() => {
    const ids = [...liveRef.current.keys()];
    if (!ids.length) return;
    for (const id of ids) stopOne(id);
  }, [stopOne]);

  const isLive = useCallback(() => liveRef.current.size > 0, []);
  const liveCount = useCallback(() => liveRef.current.size, []);
  const run = runs.length ? runs[0] : null;
  return { run, runs, send, stop, stopRun: stopOne, isLive, liveCount };
}
