import { useApp } from '../../state/store';

export function WelcomeHero() {
  const { openModal, setInspectorTab } = useApp();
  return (
    <div data-testid="welcome-hero" className="px-5 py-14 text-center">
      <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-[conic-gradient(from_200deg,#e8a33d,#f87171,#7dd3fc,#e8a33d)] text-[26px] font-extrabold text-black">M</div>
      <h1 className="text-[24px] font-extrabold tracking-tight">Welcome to <span className="text-flare">Muse CLI GUI</span></h1>
      <p className="mx-auto mb-6 mt-2 max-w-md text-[13.5px] text-dim">Your subscription-powered coding agent. Add a project to begin.</p>
      <div className="flex flex-wrap justify-center gap-2.5">
        <button onClick={() => openModal({ kind: 'project', editProject: null })} className="w-48 rounded-xl border border-edge bg-base1 p-4 text-left transition-all hover:-translate-y-0.5 hover:border-flare">
          <div className="mb-1.5 text-[20px]">📁</div><b className="block text-[13px]">New project</b><span className="text-[11px] leading-snug text-faint">Point the agent at a folder and start chatting</span>
        </button>
        <button onClick={() => openModal({ kind: 'perms' })} className="w-48 rounded-xl border border-edge bg-base1 p-4 text-left transition-all hover:-translate-y-0.5 hover:border-flare">
          <div className="mb-1.5 text-[20px]">🛡️</div><b className="block text-[13px]">Permissions</b><span className="text-[11px] leading-snug text-faint">Build, Supervised, Plan, Research, Debug</span>
        </button>
        <button onClick={() => setInspectorTab('browser')} className="w-48 rounded-xl border border-edge bg-base1 p-4 text-left transition-all hover:-translate-y-0.5 hover:border-flare">
          <div className="mb-1.5 text-[20px]">🌐</div><b className="block text-[13px]">Research</b><span className="text-[11px] leading-snug text-faint">Browse and deep-research the web</span>
        </button>
      </div>
    </div>
  );
}