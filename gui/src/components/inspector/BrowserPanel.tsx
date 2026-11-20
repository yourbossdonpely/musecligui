import { useState } from 'react';
import { useApp } from '../../state/store';
import { MODES } from '../../lib/modes';

export function BrowserPanel() {
  const { setMode, settings, setDraft, toast } = useApp();
  const [url, setUrl] = useState('');
  const [src, setSrc] = useState('');
  function normalize(u: string): string {
    const t = u.trim();
    if (!t) return '';
    return /^[a-z]+:\/\//i.test(t) ? t : 'https://' + t;
  }
  function go() {
    const u = normalize(url);
    if (u) {
      setUrl(u);
      setSrc(u);
    }
  }
  function research() {
    const u = normalize(url);
    if (!u) {
      toast('Enter a URL first.');
      return;
    }
    const prev = settings.mode;
    setMode('research');
    setDraft('Research this page thoroughly and summarize the key facts with cited sources: ' + u);
    toast('Research mode on (was ' + (MODES[prev]?.label ?? prev) + '). Review the prompt, then Send.');
  }
  return (
    <div>
      <div className="mb-2 flex gap-1.5">
        <input data-testid="browser-url" value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') go(); }} placeholder="example.com or https://..." aria-label="Browser URL" className="min-w-0 flex-1 rounded-lg border border-edge bg-base2 px-2.5 py-2 text-[12px] outline-none placeholder:text-faint focus:border-flare" />
        <button onClick={go} className="rounded-lg border border-edge px-3 text-[11px] font-bold text-dim hover:border-flare hover:text-flare">Go</button>
      </div>
      <div className="mb-2 flex gap-1.5">
        <button onClick={() => { const u = normalize(url); if (u) window.open(u, '_blank'); }} className="rounded-lg border border-edge px-3 py-1.5 text-[11px] font-bold text-dim hover:border-flare hover:text-flare">Open externally</button>
        <button onClick={research} className="rounded-lg border border-edge px-3 py-1.5 text-[11px] font-bold text-dim hover:border-flare hover:text-flare">Research this page</button>
      </div>
      <iframe data-testid="browser-frame" src={src || undefined} title="Browser preview" className="h-[380px] min-h-[300px] w-full rounded-xl border border-edge bg-white" />
      <p className="mt-2 text-[10.5px] leading-relaxed text-faint">Some sites block embedding — use Open externally for those. Research this page sends the URL to the agent for a cited summary.</p>
    </div>
  );
}