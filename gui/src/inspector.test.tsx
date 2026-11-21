import { fireEvent, render, screen, waitFor, act } from '@testing-library/react';
import App from './app';
import { MockBridge } from './test/mock-bridge';
import { seedProject } from './test/seed';

function setup() {
  seedProject();
  const mock = new MockBridge();
  mock.rpcImpl['fs-list'] = (p) => {
    const rel = String(p['rel'] ?? '');
    if (!rel) return { path: 'C:\\p', entries: [{ name: 'sub', type: 'dir', size: null }, { name: 'a.txt', type: 'file', size: 8 }] };
    if (rel === 'sub') return { path: 'C:\\p\\sub', entries: [{ name: 'b.txt', type: 'file', size: 3 }] };
    return { path: '', entries: [] };
  };
  mock.rpcImpl['fs-read'] = () => ({ path: 'C:\\p\\a.txt', size: 8, content: 'hello-fs' });
  mock.rpcImpl['mcp-list'] = () => ({ servers: [{ name: 'demo', url: 'http://x' }] });
  mock.rpcImpl['sessions-list'] = () => ({ sessions: [] });
  mock.rpcImpl['git-status'] = () => ({ repo: false });
  mock.rpcImpl['api-info'] = () => ({ enabled: true, url: 'http://127.0.0.1:8766/v1', key: 'mk-test' });
  render(<App client={mock} />);
  act(() => { mock.open(); });
  return mock;
}

test('files tree renders and expands', async () => {
  setup();
  await waitFor(() => expect(screen.getByTestId('file-tree')).toHaveTextContent('a.txt'));
  expect(screen.getByTestId('file-tree')).toHaveTextContent('sub');
  fireEvent.click(screen.getByText('sub'));
  await waitFor(() => expect(screen.getByTestId('file-tree')).toHaveTextContent('b.txt'));
});

test('file preview shows content and attaches', async () => {
  setup();
  await waitFor(() => expect(screen.getByTestId('file-tree')).toHaveTextContent('a.txt'));
  fireEvent.click(screen.getByText('a.txt'));
  await waitFor(() => expect(screen.getByRole('dialog')).toHaveTextContent('hello-fs'));
  fireEvent.click(screen.getByText('Attach to prompt'));
  await waitFor(() => expect(screen.getByTestId('toast-stack')).toHaveTextContent('Attached'));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('browser go and research work', async () => {
  setup();
  fireEvent.click(screen.getByText('Browser'));
  fireEvent.change(screen.getByTestId('browser-url'), { target: { value: 'example.com' } });
  fireEvent.click(screen.getByText('Go'));
  expect((screen.getByTestId('browser-frame') as HTMLIFrameElement).src).toContain('example.com');
  fireEvent.click(screen.getByText('Research this page'));
  expect(screen.getByTestId('mode-value')).toHaveTextContent('Research');
  expect((screen.getByTestId('composer-input') as HTMLTextAreaElement).value).toContain('example.com');
});

test('more tab lists integrations', async () => {
  setup();
  fireEvent.click(screen.getByText('More'));
  await waitFor(() => expect(screen.getByTestId('more-pane')).toHaveTextContent('demo'));
  expect(screen.getByTestId('more-pane')).toHaveTextContent('Not a git repo');
  fireEvent.click(screen.getByText('Export current session (.md)'));
  await waitFor(() => expect(screen.getByTestId('toast-stack')).toHaveTextContent('Session exported.'));
});

test('sidebars collapse and reopen', async () => {
  setup();
  expect(screen.getByTestId('sidebar')).toBeInTheDocument();
  fireEvent.click(screen.getByTestId('collapse-left'));
  expect(screen.queryByTestId('sidebar')).not.toBeInTheDocument();
  fireEvent.click(screen.getByTestId('expand-left'));
  expect(screen.getByTestId('sidebar')).toBeInTheDocument();
  expect(screen.getByTestId('inspector')).toBeInTheDocument();
  fireEvent.click(screen.getByTestId('collapse-right'));
  expect(screen.queryByTestId('inspector')).not.toBeInTheDocument();
  fireEvent.click(screen.getByTestId('expand-right'));
  expect(screen.getByTestId('inspector')).toBeInTheDocument();
});
test('export falls back without object URLs', async () => {
  setup();
  fireEvent.click(screen.getByText('More'));
  const U = URL as unknown as Record<string, unknown>;
  const orig = U['createObjectURL'];
  U['createObjectURL'] = undefined;
  try {
    fireEvent.click(screen.getByText('Export current session (.md)'));
    await waitFor(() => expect(screen.getByTestId('toast-stack')).toHaveTextContent('not supported'));
  } finally {
    U['createObjectURL'] = orig;
  }
});
test('api section shows endpoint and copies key', async () => {
  setup();
  const written: string[] = [];
  Object.defineProperty(navigator, 'clipboard', { value: { writeText: (t: string) => { written.push(t); return Promise.resolve(); } }, configurable: true });
  fireEvent.click(screen.getByText('More'));
  await waitFor(() => expect(screen.getByTestId('api-url')).toHaveTextContent('8766'));
  expect(screen.getByTestId('api-key')).toHaveTextContent('mk-test');
  fireEvent.click(screen.getByTestId('api-copy'));
  await waitFor(() => expect(written).toEqual(['mk-test']));
});
test('opencode section shows plugin status and wires project', async () => {
  const mock = setup();
  mock.rpcImpl['opencode-status'] = () => ({ pluginInstalled: true, pluginCurrent: true, pluginPath: 'C:\\plug' });
  mock.rpcImpl['opencode-wire'] = () => ({ path: 'C:\\p\\opencode.json', status: 'wrote' });
  fireEvent.click(screen.getByText('More'));
  await waitFor(() => expect(screen.getByTestId('opencode-section')).toHaveTextContent('installed, current'));
  fireEvent.click(screen.getByTestId('opencode-wire-btn'));
  await waitFor(() => expect(screen.getByTestId('toast-stack')).toHaveTextContent('Wrote OpenCode wiring'));
});
