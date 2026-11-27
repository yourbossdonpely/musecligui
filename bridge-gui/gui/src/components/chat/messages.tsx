import { useEffect, useReducer, useState } from 'react';
import { renderMarkdown, mdStore } from '../../lib/markdown';
import { speakText, speechState, stopSpeech, subscribeSpeech } from '../../lib/speech';
import type { ChatMsg } from '../../lib/types';
import { ToolCard } from './ToolCard';
import { useApp } from '../../state/store';

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

export function AssistantMessage({ text, live, suggestions, msgKey }: { text: string; live?: boolean; suggestions?: string[]; msgKey?: string }) {
  const { send, settings, toast } = useApp();
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => subscribeSpeech(force), []);
  const st = speechState();
  const talking = st.speaking && st.key === (msgKey ?? null);
  function toggleSpeak() {
    if (talking) {
      stopSpeech();
      return;
    }
    const ok = speakText(text, settings.voice?.uri || undefined, settings.voice?.rate ?? 0.95, msgKey);
    if (!ok) toast('Speech unavailable in this browser.');
  }
  return (
    <div className="flex gap-3">
      <div className="flex size-[30px] shrink-0 items-center justify-center rounded-lg bg-[conic-gradient(from_200deg,#3b5cf6,#f87171,#7dd3fc,#3b5cf6)] text-[12px] font-extrabold text-white">M</div>
      <div className="min-w-0 flex-1">
        <div onClick={onCopyClick} className={'min-w-0 flex-1 text-[13.5px] leading-[1.65] [&_h1]:mb-2 [&_h1]:mt-3 [&_h1]:text-[19px] [&_h1]:font-bold [&_h2]:mb-2 [&_h2]:mt-3 [&_h2]:text-[17px] [&_h2]:font-bold [&_h3]:mb-1 [&_h3]:mt-2 [&_h3]:text-[15px] [&_h3]:font-bold [&_li]:mb-1 [&_p]:mb-2 [&_strong]:text-white [&_ul]:mb-2 [&_ul]:ml-5 [&_ul]:list-disc ' + (live ? 'md-live' : '')} dangerouslySetInnerHTML={{ __html: renderMarkdown(text) + (live ? '<span class="md-cursor"></span>' : '') }} />
        {!live ? (
          <div className="mt-1.5 flex items-center gap-2">
            <button data-testid="speak-btn" onClick={toggleSpeak} title={talking ? 'Stop reading' : 'Read aloud'} aria-label={talking ? 'Stop reading' : 'Read aloud'} className={'rounded-md border px-2 py-0.5 text-[12px] ' + (talking ? 'border-flare text-flare' : 'border-edge text-faint hover:border-flare hover:text-flare')}>{talking ? '⏹' : '🔊'}</button>
          </div>
        ) : null}
        {!live && suggestions && suggestions.length ? (
          <div data-testid="suggest-chips" className="mt-2 flex flex-wrap gap-2">
            {suggestions.map((s, i) => (
              <button key={i} data-testid="suggest-chip" onClick={() => send(s)} title="Send this follow-up" className="max-w-full truncate rounded-full border border-flare/40 bg-flare/10 px-3 py-1 text-left text-[11.5px] font-semibold text-flare hover:bg-flare/20">{s}</button>
            ))}
          </div>
        ) : null}
      </div>
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

export function CheckpointMessage({ text, data, time, checkpointId }: { text: string; data?: string[]; time?: string; checkpointId?: string }) {
  const { client, project, toast } = useApp();
  const [diff, setDiff] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [armed, setArmed] = useState(false);
  const [undone, setUndone] = useState(false);
  let stamp = '';
  try {
    stamp = time ? new Date(time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  } catch {
    stamp = '';
  }
  async function toggleDiff() {
    if (diff != null) {
      setDiff(null);
      return;
    }
    if (!project) return;
    setLoading(true);
    try {
      const r = (await client.rpc('git-diff', { cwd: project.path }, 20000)) as { repo?: boolean; diff?: string };
      setDiff(r.repo ? r.diff || '(no changes)' : 'Not a git repo.');
    } catch (e) {
      setDiff('Error: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setLoading(false);
    }
  }
  async function undo() {
    if (!checkpointId || undone) return;
    if (!armed) {
      setArmed(true);
      setTimeout(() => setArmed(false), 4000);
      return;
    }
    setArmed(false);
    setLoading(true);
    try {
      await client.rpc('checkpoint-undo', { checkpointId }, 60000);
      setUndone(true);
      toast('Undone — files restored to before the run.');
    } catch (e) {
      toast('Undo failed: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setLoading(false);
    }
  }
  return (
    <div data-testid="checkpoint" className="rounded-xl border border-edge">
      <div className="flex items-center gap-2 px-3.5 py-1.5 font-mono text-[11px] text-faint">
        <span className={'size-[7px] rounded-full ' + (undone ? 'bg-faint' : 'bg-mint shadow-[0_0_8px_rgba(74,222,128,0.6)]')} />
        <span className="flex-1">checkpoint {stamp} · {undone ? 'undone' : text}</span>
        <button onClick={() => void toggleDiff()} className="rounded-md border border-edge px-2 py-0.5 text-[10px] font-bold text-dim hover:border-flare hover:text-flare">{loading ? '...' : diff != null ? 'Hide' : 'Diff'}</button>
        {checkpointId && !undone ? <button data-testid="checkpoint-undo" onClick={() => void undo()} title="Restore files to before this run" className={'rounded-md border px-2 py-0.5 text-[10px] font-bold ' + (armed ? 'border-rose text-rose' : 'border-edge text-dim hover:border-rose hover:text-rose')}>{armed ? 'Sure?' : 'Undo'}</button> : null}
      </div>
      {data && data.length ? <div className="px-3.5 pb-1.5 pl-8 font-mono text-[11px] leading-relaxed text-dim">{data.join(', ')}</div> : null}
      {diff != null ? <pre className="m-2 mt-0 max-h-56 overflow-auto whitespace-pre-wrap rounded-lg bg-black/40 p-3 font-mono text-[11px] leading-relaxed text-dim">{diff}</pre> : null}
    </div>
  );
}

export function DiagnosticsMessage({ text, data }: { text: string; data?: string[] }) {
  return (
    <div data-testid="diagnostics" className="rounded-xl border border-rose/40 bg-rose/5">
      <details open={false}>
        <summary className="cursor-pointer px-3.5 py-1.5 font-mono text-[11px] font-bold text-rose">⚠ {text} (click to expand)</summary>
        <div className="px-3.5 pb-2 pl-8 font-mono text-[11px] leading-relaxed text-dim">
          {(data ?? []).map((l, i) => <div key={i}>{l}</div>)}
        </div>
      </details>
    </div>
  );
}

export function MessageRow({ m, idx }: { m: ChatMsg; idx: number }) {
  if (m.type === 'user') return <UserMessage text={m.text} />;
  if (m.type === 'muse') return <AssistantMessage text={m.text} suggestions={m.suggestions} msgKey={'msg-' + idx} />;
  if (m.type === 'thought') return <ThoughtMessage text={m.text} />;
  if (m.type === 'checkpoint') return <CheckpointMessage text={m.text} data={m.data} time={m.time} checkpointId={m.checkpointId} />;
  if (m.type === 'diagnostics') return <DiagnosticsMessage text={m.text} data={m.data} />;
  if (m.type === 'tool' && m.tool) return <ToolCard name={m.tool.name} event={m.tool.event} raw={m.tool.raw} t0={m.tool.t0} durMs={m.tool.durMs} />;
  return <SystemMessage text={m.text} />;
}