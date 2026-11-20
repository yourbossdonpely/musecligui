import { useApp } from '../state/store';
import { Projects } from './projects';
import { Skills } from './Skills';
import { Usage } from './Usage';

export function Sidebar({ onCollapse }: { onCollapse: () => void }) {
  const { openModal } = useApp();
  return (
    <aside data-testid="sidebar" className="z-10 flex w-[278px] shrink-0 flex-col border-r border-edge bg-base1">
      <div className="flex shrink-0 items-center gap-3 px-5 pb-3 pt-4">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-flare via-amber-500 to-rose text-[15px] font-extrabold text-black">M</div>
        <div>
          <h2 className="text-[14px] font-bold tracking-tight">Muse <span className="text-flare">CLI GUI</span></h2>
          <small className="text-[9px] font-semibold tracking-widest text-faint">AI CODING AGENT</small>
        </div>
        <button data-testid="collapse-left" onClick={onCollapse} aria-label="Collapse sidebar" className="ml-auto rounded-lg px-2 py-1 text-[16px] text-faint hover:bg-base2 hover:text-ink">‹</button>
      </div>
      <div className="flex-1 overflow-y-auto px-3.5 pb-6">
        <div className="mb-2 ml-1.5 mt-4 text-[10px] font-bold uppercase tracking-widest text-faint">Projects</div>
        <Projects />
        <button onClick={() => openModal({ kind: 'project', editProject: null })} className="mt-2 w-full rounded-lg border border-dashed border-edge px-3 py-2 text-[12px] font-semibold text-dim transition-colors hover:border-flare hover:text-flare">
          + New Project
        </button>
        <div className="mb-2 ml-1.5 mt-5 text-[10px] font-bold uppercase tracking-widest text-faint">Skills</div>
        <Skills />
        <div className="mb-2 ml-1.5 mt-5 text-[10px] font-bold uppercase tracking-widest text-faint">Subscription</div>
        <Usage />
      </div>
    </aside>
  );
}