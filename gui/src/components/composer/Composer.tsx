import { useEffect, useRef, useState } from 'react';
import { useApp } from '../../state/store';
import { MODES, permsSummary } from '../../lib/modes';
import { fmtTokens, usageParts } from '../../lib/protocol';
import { applyMention, findMentionToken, splitMentionQuery } from '../../lib/mentions';
import { ToggleGroup } from '../ui/overlay';

interface MentionItem { rel: string; dir: boolean }
interface MentionState { token: { start: number; query: string }; items: MentionItem[]; active: number }

export function Composer() {
  const { settings, setMode, send, stop, run, attached, removeAttach, openModal, draft, setDraft, queue, clearQueue, session, lastTokens, usage, client, project, status, compactSession } = useApp();
  const taRef = useRef<HTMLTextAreaElement>(null);
  const value = draft;
  const setValue = setDraft;
  const [caret, setCaret] = useState(0);
  const [mention, setMention] = useState<MentionState | null>(null);
  const seqRef = useRef(0);

  useEffect(() => {
    const token = findMentionToken(value, caret);
    if (!token || !project || status !== 'open') {
      setMention(null);
      return;
    }
    const seq = ++seqRef.current;
    const t = setTimeout(() => {
      const { dir, file } = splitMentionQuery(token.query);
      client.rpc('fs-list', { root: project.path, rel: dir }, 15000).then(
        (r) => {
          if (seqRef.current !== seq) return;
          const ents = ((r as { entries?: Array<{ name?: string; type?: string }> }).entries) ?? [];
          const q = file.toLowerCase();
          const items: MentionItem[] = [];
          for (const e of ents) {
            const name = String(e.name ?? '');
            if (!name || !name.toLowerCase().includes(q)) continue;
            const isDir = e.type === 'dir';
            items.push({ rel: (dir ? dir + '/' : '') + name + (isDir ? '/' : ''), dir: isDir });
            if (items.length >= 8) break;
          }
          setMention(items.length ? { token, items, active: 0 } : null);
        },
        () => { if (seqRef.current === seq) setMention(null); },
      );
    }, 150);
    return () => clearTimeout(t);
  }, [value, caret, project, status, client]);

  function trackCaret() {
    const el = taRef.current;
    if (el) setCaret(el.selectionStart ?? value.length);
  }

  function pickMention(item: MentionItem) {
    if (!mention) return;
    const r = applyMention(value, caret, mention.token.start, item.rel);
    const dirValue = r.value.slice(0, r.caret - 1) + r.value.slice(r.caret);
    setValue(item.dir ? dirValue : r.value);
    const nc = item.dir ? r.caret - 1 : r.caret;
    setCaret(nc);
    if (!item.dir) {
      setMention(null);
    }
    requestAnimationFrame(() => {
      const el = taRef.current;
      if (el) {
        el.focus();
        try { el.setSelectionRange(nc, nc); } catch { /* noop */ }
      }
      autosize();
    });
  }

  function autosize() {
    const el = taRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 150) + 'px';
  }
  function submit() {
    if (!value.trim()) return;
    send(value);
    setValue('');
    requestAnimationFrame(() => {
      if (taRef.current) taRef.current.style.height = 'auto';
    });
  }

  const used = session?.tokensUsed ?? 0;
  const win = settings.contextWindows?.[settings.model] ?? 0;
  const pct = win > 0 ? Math.min(100, Math.round((used / win) * 100)) : null;

  return (
    <div className="mx-auto w-full max-w-[880px] shrink-0 px-6 pb-3 md:px-10">
      <div className="overflow-hidden rounded-2xl border border-edge bg-base1 shadow-2xl focus-within:border-flare">
        <div className="flex items-center gap-1.5 border-b border-edge px-3.5 py-2" data-testid="mode-tabs">
          <ToggleGroup label="Mode" options={Object.keys(MODES).map((k) => ({ id: k, label: MODES[k].label }))} value={settings.mode} onChange={setMode} />
          {settings.mode === 'custom' ? <span className="rounded-lg border border-flare/40 px-2.5 py-1 text-[10.5px] font-bold text-flare">Custom</span> : null}
          <button onClick={() => openModal({ kind: 'perms' })} className="ml-auto rounded-lg border border-edge px-3 py-1 text-[11.5px] font-bold text-dim hover:border-flare hover:text-flare">
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
        {queue.length ? <button data-testid="queued-chip" onClick={clearQueue} title="Click to clear queue" className="mx-3.5 mb-1 mt-2 rounded-lg border border-flare/40 bg-flare/10 px-3 py-1 text-left text-[11.5px] font-semibold text-flare">{queue.length} queued — click to clear</button> : null}
        <div className="relative flex items-end gap-2.5 p-3.5">
          {mention && mention.items.length ? (
            <div data-testid="mention-list" className="absolute bottom-full left-3.5 z-30 mb-1 w-72 overflow-hidden rounded-xl border border-edge bg-base1 shadow-2xl">
              {mention.items.map((it, i) => (
                <button key={it.rel} data-testid="mention-item" onMouseDown={(e) => { e.preventDefault(); pickMention(it); }} onMouseEnter={() => setMention((m) => (m ? { ...m, active: i } : m))} className={'flex w-full items-center gap-2 px-3 py-1.5 text-left font-mono text-[12px] ' + (i === mention.active ? 'bg-flare/20 text-flare' : 'text-dim')}>
                  <span>{it.dir ? '📁' : '📄'}</span><span className="truncate">{it.rel}</span>
                </button>
              ))}
            </div>
          ) : null}
          <textarea ref={taRef} data-testid="composer-input" rows={1} value={value} placeholder="Ask Muse to plan, build, edit, or research... (type @ to mention files)" aria-label="Message Muse"
            onChange={(e) => { setValue(e.target.value); setCaret(e.target.selectionStart ?? e.target.value.length); autosize(); }}
            onSelect={trackCaret} onClick={trackCaret} onKeyUp={trackCaret}
            onKeyDown={(e) => {
              if (mention && mention.items.length) {
                if (e.key === 'ArrowDown') { e.preventDefault(); setMention((m) => (m ? { ...m, active: (m.active + 1) % m.items.length } : m)); return; }
                if (e.key === 'ArrowUp') { e.preventDefault(); setMention((m) => (m ? { ...m, active: (m.active + m.items.length - 1) % m.items.length } : m)); return; }
                if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pickMention(mention.items[mention.active]); return; }
                if (e.key === 'Escape') { e.preventDefault(); setMention(null); return; }
              }
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
            }}
            className="max-h-[150px] min-h-[26px] flex-1 resize-none bg-transparent px-1 py-1 text-[13.5px] leading-relaxed outline-none placeholder:text-faint" />
          {run ? (
            <button data-testid="stop-btn" onClick={() => stop()} title="Stop all runs" aria-label="Stop all runs" className="flex size-[38px] shrink-0 items-center justify-center rounded-xl bg-rose text-[13px] font-bold text-white">■</button>
          ) : null}
          <button data-testid="send-btn" onClick={submit} disabled={!value.trim()} title="Send" aria-label="Send message" className="flex size-[38px] shrink-0 items-center justify-center rounded-xl bg-accent text-[16px] font-bold text-white transition-shadow hover:shadow-[0_0_20px_rgba(59,92,246,0.45)] disabled:opacity-40">↑</button>
        </div>
        <div className="flex items-center gap-3 border-t border-edge bg-black/20 px-3.5 py-1.5 text-[11px]">
          <button data-testid="model-chip" onClick={() => openModal({ kind: 'model' })} title="Select model" className="truncate rounded-md px-1.5 py-0.5 font-mono font-bold text-dim hover:bg-base2 hover:text-flare">
            <span data-testid="model-value">{settings.model || 'auto'}{settings.effort ? ' · ' + settings.effort : ''}</span>
          </button>
          <button data-testid="mode-value" onClick={() => openModal({ kind: 'perms' })} title="Permissions" className="rounded-md px-1.5 py-0.5 font-bold text-dim hover:bg-base2 hover:text-flare">
            {settings.mode === 'custom' ? permsSummary(settings.mode, settings.flags) : (MODES[settings.mode]?.label ?? settings.mode)}
          </button>
          <span className="font-mono text-faint">Sub <span data-testid="usage-value" className="font-bold text-dim">{usageParts(usage?.window).pct != null ? usageParts(usage?.window).pct + '%' : '—'}</span></span>
          <span className="ml-auto font-mono text-faint">Tokens <span data-testid="tokens-value" className="font-bold text-dim">{lastTokens ? lastTokens.inp + ' in / ' + lastTokens.out + ' out' : '—'}</span></span>
          {session && session.messages.filter((m) => m.type === 'user' || m.type === 'muse').length >= 4 ? (
            <button data-testid="compact-btn" onClick={compactSession} title="Summarize this session and continue in a fresh one" className="rounded-md border border-edge px-1.5 py-0.5 text-[10.5px] font-bold text-dim hover:border-flare hover:text-flare">Compact</button>
          ) : null}
          <button data-testid="context-status" onClick={() => { if (!win) openModal({ kind: 'model' }); }} title={win ? 'Session context used' : 'Set the context window for this model'} className="flex items-center gap-1.5 rounded-md px-1.5 py-0.5 font-mono text-faint hover:bg-base2">
            {win ? (
              <><span className="h-1.5 w-16 overflow-hidden rounded-full bg-base2"><span className="block h-full rounded-full bg-flare" style={{ width: pct + '%' }} /></span><b className="text-dim">{fmtTokens(used)} / {fmtTokens(win)} ({pct}%)</b></>
            ) : (
              <span>{used > 0 ? fmtTokens(used) + ' tokens (set window)' : 'context —'}</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}