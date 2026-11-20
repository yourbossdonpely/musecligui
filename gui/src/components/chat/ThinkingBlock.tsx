import { useEffect, useState } from 'react';
import { useApp } from '../../state/store';

export function ThinkingBlock() {
  const { run } = useApp();
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!run) return;
    const t0 = run.t0;
    setElapsed(0);
    const iv = setInterval(() => setElapsed(Math.floor((Date.now() - t0) / 1000)), 500);
    return () => clearInterval(iv);
  }, [run?.id]);
  if (!run) return null;
  const last = run.tools.length ? run.tools[run.tools.length - 1] : null;
  const label = !run.started ? 'Muse is thinking' : last ? last.name + ' — ' + last.event : 'Working';
  return (
    <div data-testid="thinking-block" className="relative flex max-w-xl items-center gap-3 overflow-hidden rounded-xl border border-edge bg-base1 px-4 py-2.5">
      <span className="orb-spin size-[22px] shrink-0 rounded-full bg-[conic-gradient(from_0deg,#e8a33d,#f87171,#7dd3fc,#e8a33d)] shadow-[0_0_14px_rgba(232,163,61,0.5)]" />
      <span className="min-w-0 flex-1 truncate text-[13px] text-dim">{label}...</span>
      <span className="shrink-0 font-mono text-[11px] text-faint">{elapsed}s</span>
    </div>
  );
}