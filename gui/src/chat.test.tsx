import { fireEvent, render, screen, waitFor, act } from '@testing-library/react';
import App from './app';
import { MockBridge } from './test/mock-bridge';
import { seedProject } from './test/seed';

function setup() {
  seedProject();
  const mock = new MockBridge();
  mock.rpcImpl['git-status'] = () => ({ repo: false });
  render(<App client={mock} />);
  act(() => { mock.open(); });
  return mock;
}

function send(mock: MockBridge, text: string) {
  fireEvent.change(screen.getByTestId('composer-input'), { target: { value: text } });
  fireEvent.click(screen.getByTestId('send-btn'));
}

test('sends and streams markdown reply', async () => {
  const mock = setup();
  mock.execImpl = (id) => {
    mock.emitExec(id, { type: 'exec-start' });
    mock.emitExec(id, { type: 'exec-delta', text: '# Hi\n\n`code`\n\n```js\n1\n```' });
    mock.emitExec(id, { type: 'exec-done', text: '# Hi\n\n`code`\n\n```js\n1\n```', exitCode: 0, terminal: 'completed', stats: { deltas: 1, tools: 0 } });
  };
  send(mock, 'hi');
  await waitFor(() => expect(screen.getByTestId('message-list')).toHaveTextContent('hi'));
  await waitFor(() => expect(screen.getByTestId('thought-summary')).toBeInTheDocument());
  expect(screen.getByTestId('message-list').querySelector('.md-code')).not.toBeNull();
  expect(screen.queryByTestId('thinking-block')).not.toBeInTheDocument();
});

test('tool cards render typed with status', async () => {
  const mock = setup();
  mock.execImpl = (id) => {
    mock.emitExec(id, { type: 'exec-start' });
    mock.emitExec(id, { type: 'exec-tool', taskId: 't1', name: 'read_file', event: 'started' });
    mock.emitExec(id, { type: 'exec-tool', taskId: 't1', name: 'read_file', event: 'completed' });
    mock.emitExec(id, { type: 'exec-done', text: 'done', exitCode: 0, terminal: 'completed', stats: { deltas: 0, tools: 2 } });
  };
  send(mock, 'go');
  await waitFor(() => expect(screen.getByTestId('tool-card')).toBeInTheDocument());
  expect(screen.getByTestId('tool-card').getAttribute('data-tool')).toBe('t-read');
  await waitFor(() => expect(screen.getByTestId('thought-summary')).toBeInTheDocument());
  expect(screen.getByTestId('tool-card')).toHaveTextContent('done');
});

test('stop button shows while running and stop works', async () => {
  const mock = setup();
  let stopped = false;
  mock.rpcImpl['stop'] = () => { stopped = true; return { stopped: true }; };
  mock.execImpl = (id) => {
    mock.emitExec(id, { type: 'exec-start' });
  };
  send(mock, 'slow');
  await waitFor(() => expect(screen.getByTestId('stop-btn')).toBeInTheDocument());
  fireEvent.click(screen.getByTestId('stop-btn'));
  await waitFor(() => expect(stopped).toBe(true));
  const id = (mock.sent[0] as Record<string, unknown>)['id'] as string;
  mock.emitExec(id, { type: 'exec-done', text: 'partial', exitCode: 0, terminal: 'completed' });
  await waitFor(() => expect(screen.getByTestId('message-list')).toHaveTextContent('Stopped by user'));
});

test('mode pills switch settings', async () => {
  setup();
  fireEvent.click(screen.getByTestId('mode-tabs').querySelector('[data-mode="debug"]')!);
  expect(screen.getByTestId('mode-value')).toHaveTextContent('Debug');
});

test('tokens update from usage events', async () => {
  const mock = setup();
  mock.execImpl = (id) => {
    mock.emitExec(id, { type: 'exec-start' });
    mock.emitExec(id, { type: 'exec-usage', usage: { models: [{ input_tokens: 10, output_tokens: 5 }] } });
    mock.emitExec(id, { type: 'exec-done', text: 'ok', exitCode: 0, terminal: 'completed' });
  };
  send(mock, 'hi');
  await waitFor(() => expect(screen.getByTestId('tokens-value')).toHaveTextContent('10 in / 5 out'));
});

test('copy button copies code block', async () => {
  const mock = setup();
  const written: string[] = [];
  Object.defineProperty(navigator, 'clipboard', { value: { writeText: (t: string) => { written.push(t); return Promise.resolve(); } }, configurable: true });
  mock.execImpl = (id) => {
    mock.emitExec(id, { type: 'exec-start' });
    mock.emitExec(id, { type: 'exec-done', text: '```js\nHELLO\n```', exitCode: 0, terminal: 'completed' });
  };
  send(mock, 'hi');
  await waitFor(() => expect(screen.getByTestId('message-list').querySelector('[data-md-copy]')).not.toBeNull());
  (screen.getByTestId('message-list').querySelector('[data-md-copy]') as HTMLElement).click();
  await waitFor(() => expect(written).toEqual(['HELLO']));
});