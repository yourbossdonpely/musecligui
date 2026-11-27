import { fireEvent, render, screen, waitFor, act, within } from '@testing-library/react';
import App from './app';
import { MockBridge } from './test/mock-bridge';
import { seedProject } from './test/seed';

function setup() {
  seedProject();
  const mock = new MockBridge();
  const servers = [{ name: 'demo', url: 'http://x' }];
  mock.rpcImpl['git-status'] = () => ({ repo: false });
  mock.rpcImpl['mcp-list'] = () => ({ servers: servers.map((s) => ({ ...s })) });
  mock.rpcImpl['mcp-add'] = (p) => { servers.push({ name: String(p['name']), url: String(p['url'] ?? '') }); return { name: p['name'] }; };
  mock.rpcImpl['mcp-remove'] = (p) => {
    const i = servers.findIndex((s) => s.name === String(p['name']));
    if (i >= 0) servers.splice(i, 1);
    return { ok: true };
  };
  mock.rpcImpl['mcp-get'] = (p) => ({ name: String(p['name']), url: 'http://x', scope: 'user' });
  mock.rpcImpl['git-diff'] = () => ({ repo: true, diff: '+hello-world' });
  render(<App client={mock} />);
  act(() => { mock.open(); });
  return mock;
}

function send(text: string) {
  fireEvent.change(screen.getByTestId('composer-input'), { target: { value: text } });
  fireEvent.click(screen.getByTestId('send-btn'));
}

test('slash mode switches without sending', async () => {
  const mock = setup();
  send('/plan');
  await waitFor(() => expect(screen.getByTestId('mode-value')).toHaveTextContent('Plan'));
  expect(mock.sent.length).toBe(0);
});

test('slash unknown and help', async () => {
  const mock = setup();
  send('/nope');
  await waitFor(() => expect(screen.getByTestId('toast-stack')).toHaveTextContent('Unknown command'));
  expect(mock.sent.length).toBe(0);
  send('/help');
  await waitFor(() => expect(screen.getByTestId('message-list')).toHaveTextContent('/export'));
});

test('slash clear adds session', async () => {
  setup();
  fireEvent.click(within(screen.getByTestId('project-item')).getByText('P'));
  send('/clear');
  await waitFor(() => expect(screen.getAllByTestId('session-item').length).toBe(2));
});

test('queue sends after run finishes', async () => {
  const mock = setup();
  let n = 0;
  mock.execImpl = (id) => {
    n += 1;
    mock.emitExec(id, { type: 'exec-start' });
    if (n > 3) mock.emitExec(id, { type: 'exec-done', text: 'D-done', exitCode: 0, terminal: 'completed' });
  };
  send('A');
  send('B');
  send('C');
  await waitFor(() => expect(screen.getAllByTestId('live-run')).toHaveLength(3));
  send('D');
  await waitFor(() => expect(screen.getByTestId('queued-chip')).toBeInTheDocument());
  const idA = (mock.sent[0] as Record<string, unknown>)['id'] as string;
  mock.emitExec(idA, { type: 'exec-done', text: 'A-done', exitCode: 0, terminal: 'completed' });
  await waitFor(() => expect(mock.sent.length).toBe(4));
  expect(String((mock.sent[3] as Record<string, unknown>)['command']).startsWith('D')).toBe(true);
  await waitFor(() => expect(screen.getByTestId('message-list')).toHaveTextContent('D-done'));
  expect(screen.queryByTestId('queued-chip')).not.toBeInTheDocument();
});

test('parallel runs each stop independently', async () => {
  const mock = setup();
  const stops: unknown[] = [];
  mock.rpcImpl['stop'] = (p) => { stops.push(p); return { stopped: true }; };
  mock.execImpl = (id) => {
    mock.emitExec(id, { type: 'exec-start' });
  };
  send('A');
  send('B');
  await waitFor(() => expect(screen.getAllByTestId('live-run')).toHaveLength(2));
  const idA = (mock.sent[0] as Record<string, unknown>)['id'] as string;
  fireEvent.click(screen.getAllByTestId('run-stop')[0]);
  await waitFor(() => expect(stops).toEqual([{ runId: idA }]));
  expect(screen.getAllByTestId('live-run')).toHaveLength(2);
});

test('import markdown creates session', async () => {
  setup();
  fireEvent.click(within(screen.getByTestId('project-item')).getByText('P'));
  const file = new File(['## You\nhello\n\n## Muse\nhi\n'], 'chat.md', { type: 'text/markdown' });
  fireEvent.change(screen.getByTestId('import-file'), { target: { files: [file] } });
  await waitFor(() => expect(screen.getAllByTestId('session-item').length).toBe(2));
  await waitFor(() => expect(screen.getByTestId('message-list')).toHaveTextContent('hi'));
});

test('mcp dialog adds and removes server', async () => {
  setup();
  fireEvent.click(screen.getByText('More'));
  fireEvent.click(screen.getByText('Manage MCP'));
  await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
  fireEvent.change(screen.getByTestId('mcp-name'), { target: { value: 'srv2' } });
  fireEvent.change(screen.getByTestId('mcp-url'), { target: { value: 'https://y.test' } });
  fireEvent.click(screen.getByText('Add server'));
  await waitFor(() => expect(screen.getByRole('dialog')).toHaveTextContent('srv2'));
  const rows = screen.getByRole('dialog').querySelectorAll('[data-testid="mcp-row"]');
  const rm = Array.from(rows[0].querySelectorAll('button')).find((b) => b.textContent === 'Remove')!;
  fireEvent.click(rm);
  fireEvent.click(screen.getByText('Confirm remove'));
  await waitFor(() => expect(screen.getByRole('dialog')).not.toHaveTextContent('demo'));
});

test('mcp row expands details', async () => {
  setup();
  fireEvent.click(screen.getByText('More'));
  fireEvent.click(screen.getByText('Manage MCP'));
  await waitFor(() => expect(screen.getByRole('dialog')).toHaveTextContent('demo'));
  fireEvent.click(within(screen.getByRole('dialog')).getByText('demo'));
  await waitFor(() => expect(screen.getByRole('dialog')).toHaveTextContent('http://x'));
});

test('checkpoint diff view shows diff', async () => {
  const mock = setup();
  mock.rpcImpl['git-status'] = () => ({ repo: true, lines: ['M a.txt'] });
  mock.execImpl = (id) => {
    mock.emitExec(id, { type: 'exec-start' });
    mock.emitExec(id, { type: 'exec-done', text: 'ok', exitCode: 0, terminal: 'completed' });
  };
  send('hi');
  await waitFor(() => expect(screen.getByTestId('checkpoint')).toBeInTheDocument());
  fireEvent.click(screen.getByText('Diff'));
  await waitFor(() => expect(screen.getByTestId('checkpoint')).toHaveTextContent('+hello-world'));
});