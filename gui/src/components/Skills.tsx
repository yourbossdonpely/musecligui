import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../state/store';
import type { Skill } from '../lib/types';

export function Skills() {
  const { client, status, toast } = useApp();
  const [skills, setSkills] = useState<Skill[]>([]);
  const [filter, setFilter] = useState('');
  const [state, setState] = useState<'idle' | 'loading' | 'error' | 'offline'>('idle');
  const [count, setCount] = useState(0);

  const load = useCallback(() => {
    if (status !== 'open') {
      setState('offline');
      return;
    }
    setState('loading');
    client.rpc('skills-list', {}, 120000).then(
      (d) => {
        const v = d as { skills?: Skill[]; count?: number };
        setSkills(v.skills ?? []);
        setCount(v.count ?? (v.skills ?? []).length);
        setState('idle');
      },
      () => setState('error'),
    );
  }, [client, status]);
  useEffect(() => {
    load();
  }, [load]);

  async function toggle(s: Skill) {
    const to = s.activation === 'off';
    try {
      await client.rpc('skills-set', { skillId: s.id, enabled: to, scope: s.scope || 'user' }, 60000);
      setSkills((prev) => prev.map((x) => (x.id === s.id ? { ...x, activation: to ? 'on' : 'off' } : x)));
      toast('Skill ' + s.id + ' is now ' + (to ? 'ON' : 'OFF'));
    } catch (e) {
      toast('Skill toggle failed: ' + (e instanceof Error ? e.message : String(e)));
    }
  }

  const f = filter.toLowerCase().trim();
  const shown = skills.filter((s) => !f || (s.name || s.id || '').toLowerCase().includes(f));
  return (
    <div>
      <input data-testid="skill-filter" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter skills..." aria-label="Filter skills" className="mb-2 w-full rounded-lg border border-edge bg-base1 px-3 py-1.5 text-[12px] outline-none placeholder:text-faint focus:border-flare" />
      <div data-testid="skills-list" className="flex max-h-60 flex-col gap-1 overflow-y-auto">
        {state === 'loading' ? <p className="px-2 py-4 text-center text-[11px] text-faint">Loading skills...</p> : null}
        {state === 'offline' ? <p className="px-2 py-4 text-center text-[11px] text-faint">Bridge offline — skills unavailable</p> : null}
        {state === 'error' ? <p className="px-2 py-4 text-center text-[11px] text-rose">Skills failed to load.</p> : null}
        {shown.map((s) => {
          const on = s.activation !== 'off';
          return (
            <div key={s.id} data-testid="skill-row" title={s.desc || s.id} onClick={() => void toggle(s)} className={'flex cursor-pointer items-center gap-2 rounded-lg border border-edge bg-base1 px-2.5 py-1.5 text-[12px] hover:bg-base2 ' + (on ? 'border-l-2 border-l-mint' : 'border-l-2 border-l-faint opacity-65')}>
              <span className="min-w-0 flex-1 truncate font-medium">{s.name || s.id}</span>
              {s.warnings ? <span className="text-[9px] font-bold text-flare">!{s.warnings}</span> : null}
              <span className="rounded border border-edge px-1 text-[9px] text-faint">{s.scope || ''}</span>
              <span className={'text-[10px] font-bold ' + (on ? 'text-mint' : 'text-faint')}>{on ? 'ON' : 'OFF'}</span>
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex items-center justify-between text-[10px] text-faint">
        <span>{state === 'idle' ? count + ' skills (click to toggle)' : ''}</span>
        <button onClick={load} className="rounded-md border border-edge px-2 py-0.5 text-[10px] font-bold text-dim hover:border-flare hover:text-flare">Reload</button>
      </div>
    </div>
  );
}