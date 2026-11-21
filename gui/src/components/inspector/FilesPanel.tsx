import { useEffect, useState } from 'react';
import { useApp } from '../../state/store';
import type { FsEntry } from '../../lib/types';
import { fmtSize } from '../../lib/protocol';

const EXTCOLORS: Array<[RegExp, string]> = [
  [/\.(php|js|ts|py|rb|go|rs|java|c|cpp|cs)$/, '#7dd3fc'],
  [/\.(html?|vue|jsx|tsx)$/, '#f472b6'],
  [/\.blade\.php$/, '#f472b6'],
  [/\.(css|scss|less)$/, '#a78bfa'],
  [/\.(json|ya?ml|xml|toml|ini)$/, '#a2bcff'],
  [/\.(md|mdx|txt|rst)$/, '#a8a29a'],
  [/\.(png|jpe?g|gif|svg|webp|ico)$/, '#4ade80'],
];
function extColor(name: string): string {
  if (name === '.env') return '#f87171';
  for (const [re, c] of EXTCOLORS) if (re.test(name)) return c;
  return '#4a4a55';
}
function joinRel(base: string, name: string): string {
  return base ? base + '\\' + name : name;
}

function DirNode({ root, rel, depth }: { root: string; rel: string; depth: number }) {
  const { client, openModal } = useApp();
  const [entries, setEntries] = useState<FsEntry[] | null>(null);
  const [error, setError] = useState('');
  const [openMap, setOpenMap] = useState<Record<string, boolean>>({});
  useEffect(() => {
    let alive = true;
    setError('');
    client.rpc('fs-list', { root, rel }, 30000).then(
      (d) => { if (alive) setEntries(((d as { entries: FsEntry[] }).entries) ?? []); },
      (e: unknown) => { if (alive) setError(e instanceof Error ? e.message : String(e)); },
    );
    return () => { alive = false; };
  }, [client, root, rel]);
  if (error) return <div className="px-2 py-1 text-[11px] text-rose">{error}</div>;
  if (!entries) return <div className="px-2 py-1 text-[11px] text-faint">Loading...</div>;
  if (!entries.length && depth > 0) return <div className="px-2 py-1 text-[11px] text-faint">(empty)</div>;
  return (
    <>
      {entries.map((e) => {
        if (e.type === 'dir') {
          const open = !!openMap[e.name];
          return (
            <div key={e.name}>
              <div onClick={() => setOpenMap((m) => ({ ...m, [e.name]: !m[e.name] }))} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-[12.5px] font-semibold hover:bg-base2">
                <span>{open ? '📂' : '📁'}</span><span className="truncate">{e.name}</span>
              </div>
              {open ? <div className="mb-0.5 ml-3 mt-0.5 border-l border-edge pl-3"><DirNode root={root} rel={joinRel(rel, e.name)} depth={depth + 1} /></div> : null}
            </div>
          );
        }
        if (e.type !== 'file') return null;
        return (
          <div key={e.name} onClick={() => openModal({ kind: 'file', previewRel: joinRel(rel, e.name) })} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-[12.5px] text-dim hover:bg-base2">
            <span className="size-[7px] shrink-0 rounded-full" style={{ background: extColor(e.name) }} />
            <span className="truncate">{e.name}</span>
            {e.size != null ? <span className="ml-auto shrink-0 font-mono text-[10px] text-faint">{fmtSize(e.size)}</span> : null}
          </div>
        );
      })}
    </>
  );
}

export function FilesPanel() {
  const { project, status } = useApp();
  const [reloadKey, setReloadKey] = useState(0);
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-widest text-faint">Project files</span>
        <button onClick={() => setReloadKey((k) => k + 1)} className="rounded-md border border-edge px-2 py-0.5 text-[10.5px] font-semibold text-dim hover:border-flare hover:text-flare">Reload</button>
      </div>
      <div className="mb-2 mt-1.5 truncate rounded-lg border border-edge bg-base2 px-3 py-2 font-mono text-[11px] text-dim">
        {project ? project.path : 'No project selected'}
      </div>
      <div data-testid="file-tree">
        {!project ? (
          <div className="px-2 py-5 text-center text-[12px] text-faint">Select a project to browse real files</div>
        ) : status !== 'open' ? (
          <div className="px-2 py-5 text-center text-[12px] text-faint">Bridge offline — files unavailable</div>
        ) : (
          <DirNode key={project.path + reloadKey} root={project.path} rel="" depth={0} />
        )}
      </div>
    </div>
  );
}