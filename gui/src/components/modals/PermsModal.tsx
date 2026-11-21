import { useApp } from '../../state/store';
import { MODES, FLAG_DEFS, permsPreview } from '../../lib/modes';
import { Dialog } from '../ui/overlay';

export function PermsModal() {
  const { settings, setMode, updateSettings, closeModal } = useApp();
  function setFlag(key: string, value: string | boolean) {
    updateSettings({ mode: 'custom', flags: { ...settings.flags, [key]: value } });
  }
  return (
    <Dialog title="Permissions" desc="Pick a mode or tune individual flags. These map directly onto real Muse CLI flags (preview below) and apply to every run until changed." wide onClose={closeModal}>
      <div data-testid="perms-modes" className="mb-4 grid grid-cols-2 gap-2.5">
        {Object.keys(MODES).map((key) => (
          <div key={key} onClick={() => setMode(key)} className={'cursor-pointer rounded-xl border p-3 transition-colors ' + (settings.mode === key ? 'border-flare bg-flare/10' : 'border-edge bg-base0 hover:border-flare') + ' mode-card'}>
            <h4 className="mb-1 text-[13px] font-bold">{MODES[key].label}</h4>
            <p className="text-[11px] leading-relaxed text-dim">{MODES[key].desc}</p>
          </div>
        ))}
      </div>
      <div>
        {FLAG_DEFS.map((d) => (
          <div key={d.key} className="flex items-start gap-2.5 border-b border-edge py-2.5 last:border-none">
            {d.type === 'bool' ? (
              <input type="checkbox" aria-label={d.label} checked={!!settings.flags[d.key]} onChange={(e) => setFlag(d.key, e.target.checked)} className="mt-1 size-[15px] shrink-0 cursor-pointer accent-[#3b5cf6]" />
            ) : null}
            <div className="min-w-0 flex-1">
              <b className="block text-[12.5px]">{d.label}</b>
              <span className="block text-[11px] leading-snug text-faint">{d.desc}</span>
              <span className="mt-0.5 block font-mono text-[10.5px] text-faint"><code className="rounded bg-base2 px-1">{d.code}</code></span>
            </div>
            {d.type === 'select' ? (
              <select aria-label={d.label} value={String(settings.flags[d.key])} onChange={(e) => setFlag(d.key, e.target.value)} className="ml-auto shrink-0 rounded-lg border border-edge bg-base0 px-2 py-1.5 text-[12px] outline-none focus:border-flare">
                {(d.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : null}
          </div>
        ))}
      </div>
      <div data-testid="perms-preview" className="mt-3.5 whitespace-pre-wrap break-words rounded-lg border border-edge bg-black/40 p-3 font-mono text-[11.5px] text-mint">{permsPreview(settings)}</div>
      <div className="mt-5 flex justify-end gap-2">
        <button onClick={closeModal} className="rounded-lg px-5 py-2 text-[13px] font-bold text-dim hover:bg-base2 hover:text-ink">Close</button>
      </div>
    </Dialog>
  );
}