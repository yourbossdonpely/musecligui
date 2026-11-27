import { useEffect, useRef } from 'react';
import { useApp } from '../../state/store';
import { MessageRow, AssistantMessage } from './messages';
import { ThinkingBlock } from './ThinkingBlock';
import { ToolCard } from './ToolCard';
import { RunLog } from './RunLog';
import { WelcomeHero } from './Hero';
import { stripSuggestions } from '../../lib/suggestions';

export function MessageList() {
  const { currentMessages, runs, stopRun } = useApp();
  const ref = useRef<HTMLDivElement>(null);
  const liveLen = runs.reduce((n, r) => n + r.text.length + r.tools.length, 0);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [currentMessages.length, liveLen]);
  const empty = !currentMessages.length && !runs.length;
  return (
    <div ref={ref} data-testid="message-list" className="mx-auto flex w-full max-w-[880px] flex-1 flex-col gap-4 overflow-y-auto px-6 py-6 md:px-10">
      {empty ? <WelcomeHero /> : null}
      {currentMessages.map((m, i) => <MessageRow key={i} m={m} idx={i} />)}
      {runs.length ? <ThinkingBlock /> : null}
      {runs.map((r) => (
        <div key={r.id} data-testid="live-run" className="flex flex-col gap-4 rounded-2xl border border-edge/60 p-3">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10.5px] text-faint">run {r.id.slice(0, 8)}…{r.stopped ? ' · stopping' : ''}</span>
            <button data-testid="run-stop" onClick={() => stopRun(r.id)} title="Stop this run" aria-label="Stop this run" className="ml-auto rounded-md border border-edge px-2 py-0.5 text-[10.5px] font-bold text-dim hover:border-rose hover:text-rose">■ Stop</button>
          </div>
          {r.text ? <AssistantMessage text={stripSuggestions(r.text)} live /> : null}
          {r.tools.map((t) => <ToolCard key={t.taskId} name={t.name} event={t.event} raw={t.raw} t0={t.t0} />)}
          <RunLog lines={r.log} />
        </div>
      ))}
    </div>
  );
}
