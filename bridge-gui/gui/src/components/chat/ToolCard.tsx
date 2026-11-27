import { useState } from 'react';
import { toolMeta, extractDetail } from '../../lib/protocol';

const CLS: Record<string, string> = {
  't-read': 'border-l-skye', 't-write': 'border-l-flare', 't-term': 'border-l-purple-400',
  't-search': 'border-l-mint', 't-web': 'border-l-cyan-300', 't-model': 'border-l-flare', 't-misc': 'border-l-faint',
};

export function ToolCard({ name, event, raw, t0, durMs }: { name: string; event: string; raw: unknown; t0: number; durMs?: number }) {
  const [open, setOpen] = useState(false);
  const meta = toolMeta(name);
  const ev = event.toLowerCase();
  const done = ev === 'completed' || ev === 'complete';
  const failed = ev === 'failed' || ev === 'error' || ev === 'cancelled';
  const detail = extractDetail(raw);
  const elapsed = (durMs != null ? durMs : Date.now() - t0) / 1000;
  return (
    <div data-testid="tool-card" data-tool={meta.cls} className={'overflow-hidden rounded-xl border border-edge border-l-[3px] bg-base1 ' + (CLS[meta.cls] ?? 'border-l-faint') + (done ? ' opacity-85' : '')}>
      <div onClick={() => setOpen(!open)} className="flex cursor-pointer items-center gap-2.5 px-3.5 py-2">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-lg border border-edge bg-base2 text-[12px] font-bold">{meta.ico}</span>
        <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-dim">{name}</span>
        <span className="shrink-0 font-mono text-[10.5px] text-faint">{elapsed.toFixed(1)}s</span>
        <span className={'flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide ' + (done ? 'bg-mint/10 text-mint' : failed ? 'bg-rose/10 text-rose' : 'bg-flare/10 text-flare')}>
          <span className={'size-1.5 rounded-full bg-current ' + (done || failed ? '' : 'pulse-dot animate-pulse')} />
          {done ? 'done' : ev}
        </span>
      </div>
      {detail && !done ? <div className="truncate px-3.5 pb-2 pl-12 font-mono text-[11px] text-faint">{detail}</div> : null}
      {open ? <pre className="max-h-56 overflow-auto border-t border-edge p-3 font-mono text-[11px] text-faint">{JSON.stringify(raw ?? name, null, 1).slice(0, 3000)}</pre> : null}
    </div>
  );
}