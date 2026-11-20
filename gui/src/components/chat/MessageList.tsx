import { useEffect, useRef } from 'react';
import { useApp } from '../../state/store';
import { MessageRow, AssistantMessage } from './messages';
import { ThinkingBlock } from './ThinkingBlock';
import { ToolCard } from './ToolCard';
import { RunLog } from './RunLog';
import { WelcomeHero } from './Hero';

export function MessageList() {
  const { currentMessages, run } = useApp();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [currentMessages.length, run?.text.length, run?.tools.length]);
  const empty = !currentMessages.length && !run;
  return (
    <div ref={ref} data-testid="message-list" className="mx-auto flex w-full max-w-[880px] flex-1 flex-col gap-4 overflow-y-auto px-6 py-6 md:px-10">
      {empty ? <WelcomeHero /> : null}
      {currentMessages.map((m, i) => <MessageRow key={i} m={m} />)}
      {run ? <ThinkingBlock /> : null}
      {run && run.text ? <AssistantMessage text={run.text} live /> : null}
      {run ? run.tools.map((t) => <ToolCard key={t.taskId} name={t.name} event={t.event} raw={t.raw} t0={t.t0} />) : null}
      {run ? <RunLog lines={run.log} /> : null}
    </div>
  );
}