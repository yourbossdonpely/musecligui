import { useApp } from '../state/store';

export function Projects() {
  const { projects, sel, toggleProject, selectSession, addSession, deleteSession, deleteProject, openModal } = useApp();
  if (!projects.length) {
    return (
      <div data-testid="empty-projects" className="px-3 py-5 text-center">
        <h3 className="text-[13px] font-semibold">No projects yet</h3>
        <p className="mt-1 text-[11px] leading-relaxed text-dim">Add a project, pick its folder, then start chatting</p>
      </div>
    );
  }
  return (
    <div data-testid="projects-list" className="flex flex-col gap-1.5">
      {projects.map((p, pIdx) => (
        <div key={p.id} data-testid="project-item" className={'overflow-hidden rounded-xl border bg-base1 transition-shadow ' + (sel.p === p.id ? 'border-flare shadow-[0_0_0_1px_var(--color-flare)]' : 'border-edge')}>
          <div className="flex cursor-pointer items-center gap-1.5 px-3 py-2.5" onClick={() => toggleProject(pIdx)}>
            <span className={'text-[9px] text-faint transition-transform ' + (p.expanded ? 'rotate-90' : '')}>▸</span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-semibold">{p.name}</div>
              <div className="truncate font-mono text-[10px] text-faint">{p.path}</div>
            </div>
            <span title="Edit project" onClick={(e) => { e.stopPropagation(); openModal({ kind: 'project', editProject: pIdx }); }} className="cursor-pointer rounded px-1 text-[11px] text-faint hover:bg-base2 hover:text-flare">✎</span>
            <span title="Delete project" onClick={(e) => { e.stopPropagation(); deleteProject(pIdx); }} className="cursor-pointer rounded px-1 text-[11px] text-faint hover:bg-base2 hover:text-rose">✕</span>
          </div>
          {p.expanded ? (
            <div className="border-t border-edge px-2.5 py-1.5">
              {p.sessions.map((s, sIdx) => (
                <div key={s.id} data-testid="session-item" onClick={() => selectSession(pIdx, sIdx)} className={'my-0.5 flex cursor-pointer items-center gap-1.5 rounded-r-lg border-l-2 px-3 py-1.5 text-[12px] ' + (sel.s === s.id ? 'active border-flare bg-flare/10 font-semibold text-flare' : 'border-transparent text-dim hover:bg-base2')}>
                  <span className="truncate">{s.name}</span>
                  <span className="text-[10px] opacity-60">{s.time}</span>
                  <span data-testid="session-del" title="Delete session" onClick={(e) => { e.stopPropagation(); deleteSession(pIdx, sIdx); }} className="ml-auto cursor-pointer text-faint opacity-60 hover:text-rose hover:opacity-100">✕</span>
                </div>
              ))}
              <div onClick={(e) => { e.stopPropagation(); addSession(pIdx); }} className="my-0.5 cursor-pointer rounded-r-lg px-3 py-1.5 text-[12px] text-flare hover:bg-base2">
                + New Session
              </div>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}