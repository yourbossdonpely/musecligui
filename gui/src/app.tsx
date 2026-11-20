import type { IBridge } from './lib/bridge';
import { AppProvider, useApp } from './state/store';
import { Sidebar } from './components/sidebar';
import { MessageList } from './components/chat/MessageList';
import { Composer } from './components/composer/Composer';
import { Footer } from './components/footer';
import { ToastStack } from './components/toasts';
import { ProjectModal } from './components/modals/project';

function OutdatedBanner() {
  const { bridgeOutdated } = useApp();
  if (!bridgeOutdated) return null;
  return (
    <div data-testid="bridge-warn" className="mx-10 mt-3 rounded-xl border border-rose/40 bg-rose/10 px-4 py-2.5 text-[12px]">
      <b>Bridge v{bridgeOutdated} is outdated.</b> Close the black bridge window and double-click MuseCLIGUI.exe, then reload this page.
    </div>
  );
}

function Shell() {
  const { modal } = useApp();
  return (
    <div data-testid="app-root" className="flex h-screen w-screen overflow-hidden bg-base0 text-ink">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <OutdatedBanner />
        <div data-testid="main-view" className="flex min-h-0 flex-1 flex-col">
          <MessageList />
          <Composer />
        </div>
        <Footer />
      </div>
      {modal.kind === 'project' ? <ProjectModal /> : null}
      <ToastStack />
    </div>
  );
}

export default function App({ client }: { client?: IBridge }) {
  return (
    <AppProvider client={client}>
      <Shell />
    </AppProvider>
  );
}