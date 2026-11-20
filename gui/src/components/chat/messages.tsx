import { renderMarkdown, mdStore } from '../../lib/markdown';
import { ToolCard } from './ToolCard';
import type { ChatMsg } from '../../lib/types';

function onCopyClick(e: React.MouseEvent) {
  const el = (e.target as HTMLElement).closest?.('[data-md-copy]') as HTMLElement | null;
  if (!el) return;
  const id = el.getAttribute('data-md-copy');
  const code = (id && mdStore[id]) || '';
  try {
    navigator.clipboard?.writeText(code).then(() => {
      el.textContent = 'Copied';
      setTimeout(() => { el.textContent = 'Copy'; }, 1500);
    }).catch(() => {});
  } catch {
    /* clipboard unavailable */
  }
}

export function UserMessage({ text }: { text: string }) {
  return (
    <div className="flex gap-3">
      <div className="ml-auto max-w-[75%] whitespace-pre-wrap rounded-xl border border-flare/30 bg-flare/10 px-4 py-2.5 text-[13.5px] leading-relaxed">{text}</div>
    </div>
  );
}

export function AssistantMessage({ text, live }: { text: string; live?: boolean }) {
  return (
    <div className="flex gap-3">
      <div className="orb-spin flex size-[30px] shrink-0 items-center justify-center rounded-lg bg-[conic-gradient(from_200deg,#e8a33d,#f87171,#7dd3fc,#e8a33d)] text-[12px] font-extrabold text-black">M</div>
      <div onClick={onCopyClick} className={'min-w-0 flex-1 text-[13.5px] leading-[1.65] [&_h1]:mb-2 [&_h1]:mt-3 [&_h1]:text-[19px] [&_h1]:font-bold [&_h2]:mb-2 [&_h2]:mt-3 [&_h2]:text-[17px] [&_h2]:font-bold [&_h3]:mb-1 [&_h3]:mt-2 [&_h3]:text-[15px] [&_h3]:font-bold [&_li]:mb-1 [&_p]:mb-2 [&_strong]:text-white [&_ul]:mb-2 [&_ul]:ml-5 [&_ul]:list-disc ' + (live ? 'md-live' : '')} dangerouslySetInnerHTML={{ __html: renderMarkdown(text) + (live ? '<span class="md-cursor"></span>' : '') }} />
    </div>
  );
}

export function SystemMessage({ text }: { text: string }) {
  return (
    <div className="flex gap-3">
      <div className="whitespace-pre-wrap rounded-full border border-edge px-3.5 py-1.5 text-[11.5px] text-faint">{text}</div>
    </div>
  );
}

export function ThoughtMessage({ text }: { text: string }) {
  return <div data-testid="thought-summary" className="pl-11 font-mono text-[11px] text-faint">{text}</div>;
}

export function CheckpointMessage({ text, data, time }: { text: string; data?: string[]; time?: string }) {
  let stamp = '';
  try {
    stamp = time ? new Date(time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  } catch {
    stamp = '';
  }
  return (
    <details data-testid="checkpoint" className="rounded-xl border border-edge">
      <summary className="flex cursor-pointer items-center gap-2 px-3.5 py-1.5 font-mono text-[11px] text-faint">
        <span className="size-[7px] rounded-full bg-mint shadow-[0_0_8px_rgba(74,222,128,0.6)]" />
        checkpoint {stamp} · {text}
      </summary>
      {data && data.length ? <pre className="px-3.5 pb-2.5 pl-8 font-mono text-[11px] leading-relaxed text-dim">{data.join('\n')}</pre> : null}
    </details>
  );
}

export function MessageRow({ m }: { m: ChatMsg }) {
  if (m.type === 'user') return <UserMessage text={m.text} />;
  if (m.type === 'muse') return <AssistantMessage text={m.text} />;
  if (m.type === 'thought') return <ThoughtMessage text={m.text} />;
  if (m.type === 'tool' && m.tool) return <ToolCard name={m.tool.name} event={m.tool.event} raw={m.tool.raw} t0={m.tool.t0} durMs={m.tool.durMs} />;
  if (m.type === 'checkpoint') return <CheckpointMessage text={m.text} data={m.data} time={m.time} />;
  return <SystemMessage text={m.text} />;
}