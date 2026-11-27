import { useApp } from '../state/store';

export function Footer() {
  const { status, project, reconnect, bridgePaused, stopBridge, startBridge, quitBridge } = useApp();
  const connected = status === 'open';
  const dot = !connected ? 'bg-rose' : bridgePaused ? 'bg-skye' : 'bg-mint shadow-[0_0_9px_var(--color-mint)]';
  const label = !connected ? 'Bridge: Disconnected — click to retry' : bridgePaused ? 'Bridge: Stopped' : 'Bridge: Connected';
  return (
    <footer data-testid="conn-bar" title={connected ? 'Bridge controls' : 'Click to reconnect'} onClick={() => { if (!connected) reconnect(); }} className={'flex min-h-8 shrink-0 flex-wrap items-center gap-3 border-t border-edge bg-base1 px-6 py-1.5 text-[11px] text-dim' + (!connected ? ' cursor-pointer' : '')}>
      <span data-testid="conn-dot" className={'size-[7px] shrink-0 rounded-full ' + dot} />
      <span data-testid="conn-text">{label}</span>
      {connected && !bridgePaused ? (
        <button data-testid="bridge-stop-btn" title="Pause the bridge: stop the current run and refuse new ones (bridge stays up)" onClick={(e) => { e.stopPropagation(); stopBridge(); }} className="rounded-md border border-edge px-2 py-0.5 text-[10px] font-bold text-dim hover:border-flare hover:text-flare">Stop</button>
      ) : null}
      {connected && bridgePaused ? (
        <button data-testid="bridge-start-btn" title="Resume the bridge" onClick={(e) => { e.stopPropagation(); startBridge(); }} className="rounded-md border border-edge px-2 py-0.5 text-[10px] font-bold text-dim hover:border-flare hover:text-flare">Start</button>
      ) : null}
      {connected ? (
        <button data-testid="bridge-quit-btn" title="Quit the bridge process entirely (close its console window). Re-run MuseCLIGUI.exe to restart." onClick={(e) => { e.stopPropagation(); quitBridge(); }} className="rounded-md border border-edge px-2 py-0.5 text-[10px] font-bold text-dim hover:border-rose hover:text-rose">Quit</button>
      ) : null}
      <span className="flex items-center gap-1.5">
        <span className="text-[10px] text-faint">Project</span><span data-testid="project-value" className="font-mono text-[11px] font-bold text-dim">{project ? project.name : 'None'}</span>
      </span>
    </footer>
  );
}
