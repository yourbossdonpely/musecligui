import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../../state/store';
import { listVoices, speakText, stopSpeech, type VoiceLike } from '../../lib/speech';

interface Row { h: string; t: string }
function KvList({ rows }: { rows: Row[] }) {
  if (!rows.length) return <div className="rounded-lg border border-edge bg-base2 px-2.5 py-2 text-[11.5px] text-dim">None</div>;
  return (
    <div className="flex flex-col gap-1.5">
      {rows.map((r, i) => (
        <div key={i} className="whitespace-pre-wrap break-words rounded-lg border border-edge bg-base2 px-2.5 py-2 text-[11.5px] text-dim">
          {r.h ? <b className="text-ink">{r.h} </b> : null}{r.t}
        </div>
      ))}
    </div>
  );
}
function Section({ title, onReload, children }: { title: string; onReload?: () => void; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="mb-1.5 ml-1 flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-faint">
        <span>{title}</span>
        {onReload ? <button onClick={onReload} className="rounded-md border border-edge px-2 py-0.5 text-[10px] font-bold normal-case tracking-normal text-dim hover:border-flare hover:text-flare">Reload</button> : null}
      </div>
      {children}
    </div>
  );
}

export function MorePanel() {
  const { client, status, project, session, settings, updateSettings, runsDone, exportCurrentSession, openModal, toast } = useApp();
  const [voices, setVoices] = useState<VoiceLike[]>(() => listVoices());
  useEffect(() => {
    try {
      const synth = (window as unknown as { speechSynthesis?: { addEventListener?: (t: string, f: () => void) => void; removeEventListener?: (t: string, f: () => void) => void } }).speechSynthesis;
      if (!synth) return;
      const load = () => setVoices(listVoices());
      load();
      if (synth.addEventListener) {
        synth.addEventListener('voiceschanged', load);
        return () => { try { synth.removeEventListener?.('voiceschanged', load); } catch { /* noop */ } };
      }
    } catch { /* speech unavailable */ }
  }, []);
  const [mcp, setMcp] = useState<Row[]>([]);
  const [sess, setSess] = useState<Row[]>([]);
  const [git, setGit] = useState<Row[]>([]);
  const [diag, setDiag] = useState<Row[] | null>(null);
  const [bridge, setBridge] = useState<Row[]>([]);
  const [api, setApi] = useState<{ enabled: boolean; url?: string; key?: string } | null>(null);
  const [ocode, setOcode] = useState<{ pluginInstalled: boolean; pluginCurrent: boolean; pluginPath?: string } | null>(null);

  const refresh = useCallback(async () => {
    if (status !== 'open') return;
    try {
      const m = (await client.rpc('mcp-list', {}, 60000)) as { servers?: Array<{ name?: string; url?: string; command?: string }> };
      const servers = m.servers ?? [];
      setMcp(servers.length ? servers.map((s) => ({ h: s.name ?? '?', t: s.url ?? s.command ?? '' })) : [{ h: 'None', t: 'no MCP servers configured' }]);
    } catch (e) {
      setMcp([{ h: 'Error', t: e instanceof Error ? e.message : String(e) }]);
    }
    try {
      const s = (await client.rpc('sessions-list', {}, 60000)) as { sessions?: Array<{ name?: string; sessionId?: string; workspaceLabel?: string; binaryVersion?: string }> };
      const list = s.sessions ?? [];
      setSess(list.length ? list.map((x) => ({ h: x.name ?? x.sessionId ?? '?', t: ((x.workspaceLabel ?? '') + ' ' + (x.binaryVersion ?? '')).trim() })) : [{ h: 'None', t: 'no running sessions' }]);
    } catch (e) {
      setSess([{ h: 'Error', t: e instanceof Error ? e.message : String(e) }]);
    }
    if (project) {
      try {
        const gg = (await client.rpc('git-status', { cwd: project.path }, 20000)) as { repo?: boolean; lines?: string[] };
        if (!gg.repo) setGit([{ h: 'Not a git repo', t: project.path }]);
        else setGit(gg.lines?.length ? gg.lines.map((l) => ({ h: '', t: l })) : [{ h: 'Clean', t: 'no changes' }]);
      } catch (e) {
        setGit([{ h: 'Error', t: e instanceof Error ? e.message : String(e) }]);
      }
    } else {
      setGit([{ h: 'No project', t: 'select a project first' }]);
    }
    try {
      const a = (await client.rpc('api-info', {}, 15000)) as { enabled?: boolean; url?: string; key?: string };
      setApi({ enabled: !!a.enabled, url: a.url, key: a.key });
    } catch {
      setApi({ enabled: false });
    }
    try {
      const info = (await client.rpc('ping', {}, 15000)) as { version?: string; muse?: string; paused?: boolean };
      setBridge([
        { h: 'bridge', t: 'v' + (info.version ?? '?') },
        { h: 'muse', t: info.muse ?? '?' },
        { h: 'status', t: info.paused === true ? 'Stopped (paused) — Start it in the footer' : 'Running' },
      ]);
    } catch {
      /* ignore */
    }
    try {
      const o = (await client.rpc('opencode-status', {}, 15000)) as { pluginInstalled?: boolean; pluginCurrent?: boolean; pluginPath?: string };
      setOcode({ pluginInstalled: !!o.pluginInstalled, pluginCurrent: !!o.pluginCurrent, pluginPath: o.pluginPath });
    } catch {
      setOcode({ pluginInstalled: false, pluginCurrent: false });
    }
  }, [client, status, project, runsDone]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function copyKey() {
    try {
      const nav = navigator as unknown as { clipboard?: { writeText?: (t: string) => Promise<void> } };
      if (nav.clipboard && nav.clipboard.writeText && api && api.key) {
        nav.clipboard.writeText(api.key).then(okCopy, badCopy);
      } else toast('Clipboard unavailable.');
    } catch { toast('Copy unavailable.'); }
  }
  async function runDiagnose() {
    if (status !== 'open') { toast('Bridge not connected.'); return; }
    if (!project) { toast('Select a project first.'); return; }
    try {
      const r = (await client.rpc('diagnose', { cwd: project.path }, 120000)) as { repo?: boolean; checked?: number; issues?: Array<{ file?: string; line?: number; message?: string; tool?: string }> };
      if (!r.repo) { setDiag([{ h: 'Not a git repo', t: project.path }]); return; }
      const list = r.issues ?? [];
      setDiag(list.length
        ? list.slice(0, 30).map((x) => ({ h: (x.file || '?') + (x.line ? ':' + x.line : ''), t: (x.message || 'issue') + ' [' + (x.tool || '?') + ']' }))
        : [{ h: 'Clean', t: (r.checked ?? 0) + ' file(s) checked, no issues' }]);
    } catch (e) { toast('Diagnose failed: ' + (e instanceof Error ? e.message : String(e))); }
  }
  function okCopy() { toast('API key copied.'); }
  function badCopy() { toast('Copy failed.'); }
  async function shareSession() {
    if (!project || !session) { toast('No session selected.'); return; }
    const messages = session.messages
      .filter((m) => m.type === 'user' || m.type === 'muse')
      .slice(-500)
      .map((m) => ({ role: m.type, text: m.text.slice(0, 50000) }));
    if (!messages.length) { toast('Nothing shareable in this session.'); return; }
    try {
      const r = (await client.rpc('share-create', { title: session.name, project: project.name, messages }, 15000)) as { url?: string };
      const nav = navigator as unknown as { clipboard?: { writeText?: (t: string) => Promise<void> } };
      if (nav.clipboard && nav.clipboard.writeText && r.url) {
        await nav.clipboard.writeText(r.url);
        toast('Share link copied (localhost, expires on bridge restart).');
      } else toast('Share link: ' + (r.url ?? '(none)'));
    } catch (e) { toast('Share failed: ' + (e instanceof Error ? e.message : String(e))); }
  }
  async function wireProject() {
    if (!project) { toast('Select a project first.'); return; }
    try {
      const r = (await client.rpc('opencode-wire', { path: project.path }, 15000)) as { path?: string; status?: string };
      if (r.status === 'already-wired') toast('Already wired: ' + (r.path ?? project.path));
      else toast('Wrote OpenCode wiring: ' + (r.path ?? project.path) + ' — restart OpenCode to pick it up.');
    } catch (e) { toast('Wire failed: ' + (e instanceof Error ? e.message : String(e))); }
  }
  return (
    <div data-testid="more-pane">
      <Section title="MCP servers" onReload={() => void refresh()}>
        <KvList rows={mcp} />
        <button onClick={() => openModal({ kind: 'mcp' })} className="mt-1.5 w-full rounded-lg border border-edge px-2 py-1.5 text-[11px] font-bold text-dim hover:border-flare hover:text-flare">Manage MCP</button>
      </Section>
      <Section title="Running sessions"><KvList rows={sess} /></Section>
      <Section title="Git changes"><KvList rows={git} />
        <button data-testid="diagnose-btn" onClick={() => void runDiagnose()} className="mt-1.5 w-full rounded-lg border border-edge px-2 py-1.5 text-[11px] font-bold text-dim hover:border-flare hover:text-flare">Run diagnostics on changed files</button>
        {diag ? <div className="mt-1.5"><KvList rows={diag} /></div> : null}
      </Section>
      <Section title="Bridge"><KvList rows={bridge} /></Section>
      <Section title="OpenCode" onReload={() => void refresh()}>
        {!ocode ? <p className="text-[11px] text-faint">Loading...</p> : (
          <div data-testid="opencode-section">
            <KvList rows={[{ h: 'cwd plugin', t: ocode.pluginInstalled ? (ocode.pluginCurrent ? 'installed, current — every folder runs in its own directory' : 'installed but outdated — relaunch the exe') : 'missing — relaunch the exe to install it' }]} />
            <button data-testid="opencode-wire-btn" onClick={() => void wireProject()} className="mt-1.5 w-full rounded-lg border border-edge px-2 py-1.5 text-[11px] font-bold text-dim hover:border-flare hover:text-flare">Wire current project (opencode.json)</button>
            <p className="mt-1.5 text-[10.5px] leading-relaxed text-faint">The button drops a fallback opencode.json into the selected project folder. The plugin already covers every folder automatically.</p>
          </div>
        )}
      </Section>
      <Section title="API access">
        {!api ? <p className="text-[11px] text-faint">Loading...</p> : !api.enabled ? <p className="text-[11px] text-faint">API disabled on this bridge.</p> : (
          <div data-testid="api-section">
            <div className="mb-1.5 rounded-lg border border-edge bg-base2 px-2.5 py-2"><div className="text-[10px] text-faint">Endpoint</div><div data-testid="api-url" className="font-mono text-[11.5px] text-ink">{api.url}</div></div>
            <div className="flex items-center gap-1.5 rounded-lg border border-edge bg-base2 px-2.5 py-2"><div className="min-w-0 flex-1"><div className="text-[10px] text-faint">API key</div><div data-testid="api-key" className="truncate font-mono text-[11.5px] text-ink">{api.key}</div></div><button data-testid="api-copy" onClick={copyKey} className="shrink-0 rounded-md border border-edge px-2 py-1 text-[10.5px] font-bold text-dim hover:border-flare hover:text-flare">Copy</button></div>
            <p className="mt-1.5 text-[10.5px] leading-relaxed text-faint">OpenAI-compatible. Point OpenCode or FreeBuff at the endpoint with this key. Localhost only.</p>
          </div>
        )}
      </Section>
      <button onClick={exportCurrentSession} className="w-full rounded-lg border border-dashed border-edge px-3 py-2 text-[12px] font-semibold text-dim hover:border-flare hover:text-flare">
        Export current session (.md)
      </button>
      <button data-testid="share-btn" onClick={() => void shareSession()} title="Get a localhost replay link for this session" className="mt-1.5 w-full rounded-lg border border-dashed border-edge px-3 py-2 text-[12px] font-semibold text-dim hover:border-flare hover:text-flare">
        Share current session (link)
      </button>
      <Section title="Voice (read aloud)">
        {!voices.length ? <p className="text-[11px] text-faint">No speech voices in this browser.</p> : (
          <div data-testid="voice-section" className="flex flex-col gap-1.5">
            <select data-testid="voice-select" value={settings.voice?.uri || ''} onChange={(e) => updateSettings({ voice: { uri: e.target.value, rate: settings.voice?.rate ?? 0.95 } })} className="w-full rounded-lg border border-edge bg-base0 px-2.5 py-2 text-[12px] outline-none focus:border-flare">
              <option value="">Auto (prefer female English)</option>
              {voices.map((v) => (
                <option key={v.voiceURI} value={v.voiceURI}>{v.name} ({v.lang})</option>
              ))}
            </select>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-faint">Speed</span>
              <input data-testid="voice-rate" type="range" min="0.6" max="1.5" step="0.05" value={settings.voice?.rate ?? 0.95} onChange={(e) => updateSettings({ voice: { uri: settings.voice?.uri || '', rate: Number(e.target.value) } })} className="flex-1" />
              <button data-testid="voice-test" onClick={() => { stopSpeech(); speakText('Hello! I am Muse, your coding assistant.', settings.voice?.uri || undefined, settings.voice?.rate ?? 0.95, 'voice-test'); }} className="rounded-md border border-edge px-2 py-1 text-[10.5px] font-bold text-dim hover:border-flare hover:text-flare">Test</button>
            </div>
          </div>
        )}
      </Section>
    </div>
  );
}