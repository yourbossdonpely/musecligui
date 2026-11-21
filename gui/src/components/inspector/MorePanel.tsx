import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../../state/store';

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
  const { client, status, project, runsDone, exportCurrentSession, openModal } = useApp();
  const [mcp, setMcp] = useState<Row[]>([]);
  const [sess, setSess] = useState<Row[]>([]);
  const [git, setGit] = useState<Row[]>([]);
  const [bridge, setBridge] = useState<Row[]>([]);

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
      const info = (await client.rpc('ping', {}, 15000)) as { version?: string; muse?: string };
      setBridge([{ h: 'bridge', t: 'v' + (info.version ?? '?') }, { h: 'muse', t: info.muse ?? '?' }]);
    } catch {
      /* ignore */
    }
  }, [client, status, project, runsDone]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div data-testid="more-pane">
      <Section title="MCP servers" onReload={() => void refresh()}>
        <KvList rows={mcp} />
        <button onClick={() => openModal({ kind: 'mcp' })} className="mt-1.5 w-full rounded-lg border border-edge px-2 py-1.5 text-[11px] font-bold text-dim hover:border-flare hover:text-flare">Manage MCP</button>
      </Section>
      <Section title="Running sessions"><KvList rows={sess} /></Section>
      <Section title="Git changes"><KvList rows={git} /></Section>
      <Section title="Bridge"><KvList rows={bridge} /></Section>
      <button onClick={exportCurrentSession} className="w-full rounded-lg border border-dashed border-edge px-3 py-2 text-[12px] font-semibold text-dim hover:border-flare hover:text-flare">
        Export current session (.md)
      </button>
    </div>
  );
}