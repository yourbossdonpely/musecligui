import { useEffect, useState } from 'react';
import { useApp } from '../../state/store';
import type { FsEntry } from '../../lib/types';

function parentDir(p: string): string {
  const t = p.replace(/[\\/]+$/, '');
  if (/^[A-Za-z]:$/.test(t)) return '';
  const i = Math.max(t.lastIndexOf('\\'), t.lastIndexOf('/'));
  if (i < 0) return '';
  return t.slice(0, i + 1);
}

export function PickerBody({ onPick }: { onPick: (p: string) => void }) {
  const { client } = useApp();
  const [path, setPath] = useState('');
  const [entries, setEntries] = useState<FsEntry[]>([]);
  const [drives, setDrives] = useState<Array<{ path: string; label: string }>>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    setError('');
    if (!path) {
      client.rpc('fs-drives', {}, 15000).then(
        (d) => { if (alive) setDrives((d as { drives: Array<{ path: string; label: string }> }).drives ?? []); },
        (e: unknown) => { if (alive) setError(e instanceof Error ? e.message : String(e)); },
      );
    } else {
      client.rpc('fs-list', { root: path, rel: '' }, 20000).then(
        (d) => { if (alive) setEntries(((d as { entries: FsEntry[] }).entries ?? []).filter((e) => e.type === 'dir')); },
        (e: unknown) => { if (alive) setError(e instanceof Error ? e.message : String(e)); },
      );
    }
    return () => { alive = false; };
  }, [client, path]);
  return (
    <div>
      <div data-testid="picker-path" className="mb-2 truncate rounded-lg bg-flare/10 px-3 py-1.5 font-mono text-[11.5px] text-flare">{path || 'Drives'}</div>
      <div data-testid="picker-list" className="max-h-64 overflow-y-auto rounded-xl border border-edge bg-base0 p-2">
        {error ? <p className="p-3 text-[12px] text-rose">{error}</p> : null}
        {!path ? drives.map((d) => (
          <div key={d.path} onClick={() => setPath(d.path)} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-[12.5px] hover:bg-base2">
            <span>🖴</span><span className="font-semibold">{d.label}</span><span className="ml-auto font-mono text-[10px] text-faint">{d.path}</span>
          </div>
        )) : (
          <>
            <div onClick={() => setPath(parentDir(path))} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-[12.5px] font-semibold hover:bg-base2">
              <span>▴</span><span>.. (up)</span>
            </div>
            {entries.map((e) => (
              <div key={e.name} onClick={() => setPath(path.replace(/[\\/]+$/, '') + '\\' + e.name)} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-[12.5px] hover:bg-base2">
                <span>▸</span><span>{e.name}</span>
              </div>
            ))}
            {!entries.length && !error ? <p className="p-3 text-center text-[11.5px] text-faint">No subfolders — press Select to use this folder.</p> : null}
          </>
        )}
      </div>
      <div className="mt-3 flex justify-end">
        <button onClick={() => { if (path) onPick(path); }} disabled={!path} className="rounded-lg bg-flare px-5 py-2 text-[13px] font-bold text-black disabled:opacity-40">Select</button>
      </div>
    </div>
  );
}