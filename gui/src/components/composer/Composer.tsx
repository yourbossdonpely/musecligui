import { useRef, useState } from 'react';
import { useApp } from '../../state/store';
import { MODES } from '../../lib/modes';
import { ToggleGroup } from '../ui/overlay';

export function Composer() {
  const { settings, setMode, send, stop, run, attached, removeAttach, openModal } = useApp();
  const [value, setValue] = useState('');
  const taRef = useRef<HTMLTextAreaElement>(null);

  function autosize() {
    const el = taRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 150) + 'px';
  }
  function submit() {
    if (!value.trim() || run) return;
    send(value);
    setValue('');
    requestAnimationFrame(() => {
      if (taRef.current) taRef.current.style.height = 'auto';
    });
  }

  return (
    <div className="mx-auto w-full max-w-[880px] shrink-0 px-6 pb-3 md:px-10">
      <div className="overflow-hidden rounded-2xl border border-edge bg-base1 shadow-2xl focus-within:border-flare">
        <div className="flex items-center gap-1.5 border-b border-edge px-3.5 py-2" data-testid="mode-tabs">
          <ToggleGroup label="Mode" options={Object.keys(MODES).map((k) => ({ id: k, label: MODES[k].label }))} value={settings.mode} onChange={setMode} />
          {settings.mode === 'custom' ? <span className="rounded-lg border border-flare/40 px-2.5 py-1 text-[10.5px] font-bold text-flare">Custom</span> : null}
          <button data-testid="model-chip" onClick={() => openModal({ kind: 'model' })} title="Select model" className="ml-auto truncate rounded-lg border border-edge px-2.5 py-1 font-mono text-[11px] text-dim hover:border-flare hover:text-flare">
            {settings.model || 'auto'}{settings.effort ? ' · ' + settings.effort : ''}
          </button>
          <button onClick={() => openModal({ kind: 'perms' })} className="rounded-lg border border-edge px-3 py-1 text-[11.5px] font-bold text-dim hover:border-flare hover:text-flare">
            Permissions
          </button>
        </div>
        {attached.length ? (
          <div data-testid="attach-chips" className="flex flex-wrap gap-2 px-4 pt-2.5">
            {attached.map((a, i) => (
              <span key={i} className="flex items-center gap-1.5 rounded-full border border-flare/40 bg-flare/10 py-1 pl-3 pr-1.5 font-mono text-[11px]">
                {a.rel}
                <button aria-label={'Remove ' + a.rel} onClick={() => removeAttach(i)} className="rounded-full px-1.5 text-[12px] text-flare hover:bg-flare/20">×</button>
              </span>
            ))}
          </div>
        ) : null}
        <div className="flex items-end gap-2.5 p-3.5">
          <textarea ref={taRef} data-testid="composer-input" rows={1} value={value} placeholder="Ask Muse to plan, build, edit, or research..." aria-label="Message Muse"
            onChange={(e) => { setValue(e.target.value); autosize(); }}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
            className="max-h-[150px] min-h-[26px] flex-1 resize-none bg-transparent px-1 py-1 text-[13.5px] leading-relaxed outline-none placeholder:text-faint" />
          {run ? (
            <button data-testid="stop-btn" onClick={() => stop()} title="Stop" aria-label="Stop run" className="flex size-[38px] shrink-0 items-center justify-center rounded-xl bg-rose text-[13px] font-bold text-white">■</button>
          ) : (
            <button data-testid="send-btn" onClick={submit} disabled={!value.trim()} title="Send" aria-label="Send message" className="flex size-[38px] shrink-0 items-center justify-center rounded-xl bg-flare text-[16px] font-bold text-black transition-shadow hover:shadow-[0_0_20px_rgba(232,163,61,0.4)] disabled:opacity-40">↑</button>
          )}
        </div>
      </div>
    </div>
  );
}