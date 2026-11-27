import { useEffect, useRef, type ReactNode } from 'react';

export function Dialog({ title, desc, wide, onClose, children }: { title: string; desc?: string; wide?: boolean; onClose: () => void; children: ReactNode }) {
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const t = setTimeout(() => {
      const el = panelRef.current?.querySelector<HTMLElement>('[data-autofocus]') ?? panelRef.current;
      el?.focus();
    }, 30);
    return () => {
      window.removeEventListener('keydown', onKey);
      clearTimeout(t);
    };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={panelRef} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} className={'max-h-[88vh] w-full overflow-y-auto rounded-2xl border border-edge bg-base1 p-6 shadow-2xl outline-none ' + (wide ? 'max-w-2xl' : 'max-w-lg')}>
        <h2 className="text-[16px] font-bold tracking-tight">{title}</h2>
        {desc ? <p className="mb-4 mt-1 text-[13px] leading-relaxed text-dim">{desc}</p> : <div className="mb-4" />}
        {children}
      </div>
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: Array<{ id: T; label: string }>; value: T; onChange: (v: T) => void }) {
  return (
    <div role="tablist" aria-label="Panel tabs" className="flex gap-1">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} data-rtab={t.id} onClick={() => onChange(t.id)} className={'flex-1 rounded-lg px-2 py-2 text-[12px] font-bold transition-colors ' + (value === t.id ? 'bg-base2 text-ink' : 'text-faint hover:bg-base1 hover:text-ink')}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function ToggleGroup<T extends string>({ options, value, onChange, label }: { options: Array<{ id: T; label: string }>; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1">
      {options.map((o) => (
        <button key={o.id} role="radio" aria-checked={value === o.id} data-mode={o.id} onClick={() => onChange(o.id)} className={'rounded-lg border px-3 py-1.5 text-[11.5px] font-bold transition-colors ' + (value === o.id ? 'border-flare/40 bg-flare/10 text-flare' : 'border-transparent text-faint hover:bg-base2 hover:text-ink')}>
          {o.label}
        </button>
      ))}
    </div>
  );
}