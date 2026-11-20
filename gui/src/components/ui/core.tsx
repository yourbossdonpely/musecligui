import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';

type BtnVariant = 'primary' | 'ghost' | 'danger' | 'subtle';
export function Button({ variant = 'primary', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant }) {
  const base = 'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-[13px] font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ';
  const v = variant === 'primary'
    ? 'bg-flare text-black hover:brightness-110'
    : variant === 'danger'
      ? 'bg-rose/15 text-rose hover:bg-rose/25'
      : variant === 'ghost'
        ? 'text-dim hover:text-ink hover:bg-base2'
        : 'bg-base2 text-dim border border-edge hover:text-ink';
  return <button className={base + v + ' ' + className} {...props} />;
}

export function IconButton({ label, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return <button aria-label={label} title={label} className={'inline-flex size-8 items-center justify-center rounded-lg text-dim transition-colors hover:bg-base2 hover:text-ink ' + className} {...props} />;
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-dim">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-[11px] text-faint">{hint}</span> : null}
    </label>
  );
}

export function Input({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={'w-full rounded-lg border border-edge bg-base1 px-3 py-2 text-[13px] text-ink outline-none placeholder:text-faint focus:border-flare ' + className} {...props} />;
}

export function Select({ className = '', children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={'rounded-lg border border-edge bg-base1 px-3 py-2 text-[12px] text-ink outline-none focus:border-flare ' + className} {...props}>{children}</select>;
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)} className={'relative h-5 w-9 shrink-0 rounded-full transition-colors ' + (checked ? 'bg-flare' : 'bg-base2 border border-edge')}>
      <span className={'absolute top-0.5 size-4 rounded-full bg-white transition-all ' + (checked ? 'left-[18px]' : 'left-0.5 bg-dim')} />
    </button>
  );
}

export function Badge({ tone = 'default', children }: { tone?: 'default' | 'ok' | 'warn' | 'err' | 'info'; children: ReactNode }) {
  const c = tone === 'ok' ? 'bg-mint/10 text-mint' : tone === 'warn' ? 'bg-flare/10 text-flare' : tone === 'err' ? 'bg-rose/10 text-rose' : tone === 'info' ? 'bg-skye/10 text-skye' : 'bg-base2 text-dim border border-edge';
  return <span className={'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ' + c}>{children}</span>;
}

export function Separator({ className = '' }: { className?: string }) {
  return <div role="separator" className={'h-px bg-edge ' + className} />;
}

export function Progress({ pct, tone = 'flare' }: { pct: number; tone?: 'flare' | 'mint' }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-base2" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div className={'h-full rounded-full transition-all ' + (tone === 'mint' ? 'bg-gradient-to-r from-mint to-skye' : 'bg-gradient-to-r from-flare to-amber-300')} style={{ width: Math.max(0, Math.min(100, pct)) + '%' }} />
    </div>
  );
}

export function Spinner({ className = '' }: { className?: string }) {
  return <span aria-label="Loading" className={'inline-block size-4 animate-spin rounded-full border-2 border-edge border-t-flare ' + className} />;
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden className={'animate-pulse rounded-lg bg-base2 ' + className} />;
}

export function Empty({ icon, title, desc, action }: { icon: string; title: string; desc: string; action?: ReactNode }) {
  return (
    <div role="status" className="px-4 py-8 text-center">
      <div className="text-2xl">{icon}</div>
      <h3 className="mt-2 text-[13px] font-semibold text-ink">{title}</h3>
      <p className="mt-1 text-[11.5px] leading-relaxed text-dim">{desc}</p>
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}