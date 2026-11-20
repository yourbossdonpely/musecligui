import { useApp } from '../state/store';
import { MODES, permsSummary } from '../lib/modes';
import { usageParts } from '../lib/protocol';

function usagePct(w?: string): string {
  const p = usageParts(w ?? null).pct;
  return p != null ? p + '%' : '—';
}

export function Footer() {
  const { status, settings, project, reconnect, openModal, lastTokens, usage } = useApp();
  const connected = status === 'open';
  return (
    <footer data-testid="conn-bar" title="Click to reconnect" onClick={() => { if (!connected) reconnect(); }} className="flex min-h-8 shrink-0 cursor-pointer flex-wrap items-center gap-3 border-t border-edge bg-base1 px-6 py-1.5 text-[11px] text-dim">
      <span data-testid="conn-dot" className={'size-[7px] shrink-0 rounded-full ' + (connected ? 'bg-mint shadow-[0_0_9px_var(--color-mint)]' : 'bg-rose')} />
      <span data-testid="conn-text">{connected ? 'Bridge: Connected' : 'Bridge: Disconnected — click to retry'}</span>
      <span className="flex items-center gap-1.5" data-testid="model-stat" onClick={(e) => { e.stopPropagation(); openModal({ kind: 'model' }); }}>
        <span className="text-[10px] text-faint">Model</span><span data-testid="model-value" className="max-w-50 overflow-hidden text-ellipsis font-mono text-[11px] font-bold text-dim">{settings.model || 'auto'}</span>
      </span>
      <span className="flex items-center gap-1.5" data-testid="mode-stat" onClick={(e) => { e.stopPropagation(); openModal({ kind: 'perms' }); }}>
        <span className="text-[10px] text-faint">Mode</span><span data-testid="mode-value" className="font-mono text-[11px] font-bold text-dim">{settings.mode === 'custom' ? permsSummary(settings.mode, settings.flags) : (MODES[settings.mode]?.label ?? settings.mode)}</span>
      </span>
      <span className="flex items-center gap-1.5">
        <span className="text-[10px] text-faint">Tokens</span><span data-testid="tokens-value" className="font-mono text-[11px] font-bold text-dim">{lastTokens ? lastTokens.inp + ' in / ' + lastTokens.out + ' out' : '—'}</span>
      </span>
      <span className="flex items-center gap-1.5">
        <span className="text-[10px] text-faint">Usage</span><span data-testid="usage-value" className="font-mono text-[11px] font-bold text-dim">{usagePct(usage?.window)}</span>
      </span>
      <span className="flex items-center gap-1.5">
        <span className="text-[10px] text-faint">Project</span><span data-testid="project-value" className="font-mono text-[11px] font-bold text-dim">{project ? project.name : 'None'}</span>
      </span>
    </footer>
  );
}