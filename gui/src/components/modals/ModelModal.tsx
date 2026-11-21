import { useEffect, useState } from 'react';
import { useApp } from '../../state/store';
import { Dialog } from '../ui/overlay';

const EFFORTS = ['', 'none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra'];
const FALLBACK = ['muse-spark-1.3', 'muse-spark-1.2', 'muse-wonder-1.0', 'muse-ember-1.0'];

export function ModelModal() {
  const { client, status, settings, updateSettings, closeModal } = useApp();
  const [models, setModels] = useState<string[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    if (status !== 'open') {
      setModels(FALLBACK);
      return;
    }
    client.rpc('models-list', {}, 90000).then(
      (d) => {
        if (!alive) return;
        const list = (d as { models?: string[] }).models ?? [];
        setModels(list.length ? list : FALLBACK);
      },
      () => { if (alive) { setError('Could not load models — showing known list.'); setModels(FALLBACK); } },
    );
    return () => { alive = false; };
  }, [client, status]);
  return (
    <Dialog title="Select Model" desc="Model and reasoning settings for the next runs. Loaded live from the CLI." onClose={closeModal}>
      <div className="mb-4">
        <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-dim">Model</div>
        <div data-testid="model-list" className="flex flex-col gap-2">
          {error ? <p className="text-[11px] text-flare">{error}</p> : null}
          <div data-model="" onClick={() => { updateSettings({ model: '' }); closeModal(); }} className={'flex cursor-pointer items-center justify-between rounded-xl border px-3.5 py-2.5 ' + (!settings.model ? 'border-flare bg-flare/10' : 'border-edge bg-base0 hover:border-flare')}>
            <span className="font-mono text-[13px] font-semibold">auto (CLI default)</span>
            {!settings.model ? <span className="text-[11px] font-bold text-flare">Active</span> : null}
          </div>
          {models.map((m) => (
            <div key={m} data-model={m} onClick={() => { updateSettings({ model: m }); closeModal(); }} className={'flex cursor-pointer items-center justify-between rounded-xl border px-3.5 py-2.5 ' + (settings.model === m ? 'border-flare bg-flare/10' : 'border-edge bg-base0 hover:border-flare')}>
              <span className="font-mono text-[13px] font-semibold">{m}</span>
              {settings.model === m ? <span className="text-[11px] font-bold text-flare">Active</span> : null}
            </div>
          ))}
        </div>
      </div>
      <div className="mb-4">
        <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-dim" htmlFor="effort-sel">Reasoning effort</label>
        <select id="effort-sel" data-testid="effort-select" value={settings.effort} onChange={(e) => updateSettings({ effort: e.target.value })} className="w-full rounded-lg border border-edge bg-base0 px-3 py-2.5 text-[13px] outline-none focus:border-flare">
          {EFFORTS.map((e) => <option key={e} value={e}>{e || 'default'}</option>)}
        </select>
      </div>
      <div>
        <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-dim" htmlFor="contrib-sel">Contributor mode</label>
        <select id="contrib-sel" data-testid="contrib-select" value={settings.contributor || 'off'} onChange={(e) => updateSettings({ contributor: e.target.value })} className="w-full rounded-lg border border-edge bg-base0 px-3 py-2.5 text-[13px] outline-none focus:border-flare">
          <option value="off">off — content not used for training</option>
          <option value="on">on — content may be used for training</option>
        </select>
      </div>
      <div className="mb-1 mt-4">
        <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-dim" htmlFor="ctx-input">Context window (tokens) — {settings.model || 'default'}</label>
        <input id="ctx-input" data-testid="context-input" type="number" min="0" step="1000" value={settings.contextWindows?.[settings.model] ?? ''} onChange={(e) => { const n = Math.max(0, parseInt(e.target.value || '0', 10) || 0); updateSettings({ contextWindows: { ...(settings.contextWindows ?? {}), [settings.model]: n } }); }} placeholder="e.g. 200000" className="w-full rounded-lg border border-edge bg-base0 px-3 py-2.5 font-mono text-[13px] outline-none placeholder:text-faint focus:border-flare" />
        <p className="mt-1 text-[11px] text-faint">Used for the context meter in the composer. Find your model's window in its docs.</p>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <button onClick={closeModal} className="rounded-lg px-5 py-2 text-[13px] font-bold text-dim hover:bg-base2 hover:text-ink">Close</button>
      </div>
    </Dialog>
  );
}