import { useApp } from '../../state/store';
import { Tabs } from '../ui/overlay';
import { FilesPanel } from './FilesPanel';
import { BrowserPanel } from './BrowserPanel';
import { MorePanel } from './MorePanel';

export function Inspector({ onCollapse }: { onCollapse: () => void }) {
  const { inspectorTab, setInspectorTab } = useApp();
  return (
    <aside data-testid="inspector" className="z-10 flex w-[330px] shrink-0 flex-col border-l border-edge bg-base1">
      <div className="flex shrink-0 items-center gap-1 p-2.5 pb-0">
        <div className="flex-1">
          <Tabs tabs={[{ id: 'files', label: 'Files' }, { id: 'browser', label: 'Browser' }, { id: 'more', label: 'More' }]} value={inspectorTab} onChange={setInspectorTab} />
        </div>
        <button data-testid="collapse-right" onClick={onCollapse} aria-label="Collapse panel" className="rounded-lg px-2 py-1 text-[14px] text-faint hover:bg-base2 hover:text-ink">›</button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {inspectorTab === 'files' ? <FilesPanel /> : null}
        {inspectorTab === 'browser' ? <BrowserPanel /> : null}
        {inspectorTab === 'more' ? <MorePanel /> : null}
      </div>
    </aside>
  );
}