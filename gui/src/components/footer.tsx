import { useApp } from '../state/store';

export function Footer() {
  const { status, project, reconnect } = useApp();
  const connected = status === 'open';
  return (
    <footer data-testid="conn-bar" title="Click to reconnect" onClick={() => { if (!connected) reconnect(); }} className="flex min-h-8 shrink-0 cursor-pointer flex-wrap items-center gap-3 border-t border-edge bg-base1 px-6 py-1.5 text-[11px] text-dim">
      <span data-testid="conn-dot" className={'size-[7px] shrink-0 rounded-full ' + (connected ? 'bg-mint shadow-[0_0_9px_var(--color-mint)]' : 'bg-rose')} />
      <span data-testid="conn-text">{connected ? 'Bridge: Connected' : 'Bridge: Disconnected — click to retry'}</span>
      <span className="flex items-center gap-1.5">
        <span className="text-[10px] text-faint">Project</span><span data-testid="project-value" className="font-mono text-[11px] font-bold text-dim">{project ? project.name : 'None'}</span>
      </span>
    </footer>
  );
}