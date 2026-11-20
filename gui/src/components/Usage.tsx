import { useApp } from '../state/store';
import { usageParts } from '../lib/protocol';

export function Usage() {
  const { usage, refreshUsage, status } = useApp();
  const w = usageParts(usage?.window);
  const k = usageParts(usage?.weekly);
  return (
    <div className="rounded-xl border border-edge bg-base1 p-3 text-[11px] text-dim">
      <div data-testid="usage-tier" className="mb-2.5 text-[12px] font-bold text-ink">{status !== 'open' ? '—' : usage?.tier || '—'}</div>
      <div className="mb-2.5">
        <div className="mb-1 flex justify-between text-[10.5px]"><span>Window</span><b data-testid="usage-window-text" className="text-ink">{w.pct != null ? w.pct + '% used' : '—'}</b></div>
        <div className="h-1.5 overflow-hidden rounded-full bg-base2"><div data-testid="usage-window-bar" className="h-full rounded-full bg-gradient-to-r from-flare to-amber-300 transition-all" style={{ width: (w.pct ?? 0) + '%' }} /></div>
        <div className="mt-0.5 text-[10px] text-faint">{w.reset ? 'resets in ' + w.reset : ''}</div>
      </div>
      <div>
        <div className="mb-1 flex justify-between text-[10.5px]"><span>Weekly</span><b data-testid="usage-weekly-text" className="text-ink">{k.pct != null ? k.pct + '% used' : '—'}</b></div>
        <div className="h-1.5 overflow-hidden rounded-full bg-base2"><div data-testid="usage-weekly-bar" className="h-full rounded-full bg-gradient-to-r from-mint to-skye transition-all" style={{ width: (k.pct ?? 0) + '%' }} /></div>
        <div className="mt-0.5 text-[10px] text-faint">{k.reset ? 'resets in ' + k.reset : ''}</div>
      </div>
      <button onClick={() => void refreshUsage()} className="mt-2 w-full rounded-lg border border-edge px-2 py-1 text-[10.5px] font-bold text-dim hover:border-flare hover:text-flare">Refresh</button>
    </div>
  );
}