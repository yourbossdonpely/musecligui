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

test('follow-up chips render from reply and click sends', async () => {
  const mock = setup();
  mock.execImpl = (id) => {
    mock.emitExec(id, { type: 'exec-start' });
    mock.emitExec(id, { type: 'exec-done', text: 'Fixed it.\n[SUGGEST]\nRun the tests\nReview the diff\nShip it\n[/SUGGEST]', exitCode: 0, terminal: 'completed' });
  };
  send(mock, 'fix footer');
  await waitFor(() => expect(screen.getByTestId('suggest-chips')).toBeInTheDocument());
  expect(screen.getByTestId('message-list')).not.toHaveTextContent('[SUGGEST]');
  expect(screen.getAllByTestId('suggest-chip')).toHaveLength(3);
  fireEvent.click(screen.getAllByTestId('suggest-chip')[0]);
  await waitFor(() => expect(screen.getByTestId('message-list')).toHaveTextContent('Run the tests'));
});

test('fallback chips appear when reply has no block', async () => {
  const mock = setup();
  mock.execImpl = (id) => {
    mock.emitExec(id, { type: 'exec-start' });
    mock.emitExec(id, { type: 'exec-done', text: 'plain reply', exitCode: 0, terminal: 'completed' });
  };
  send(mock, 'hi');
  await waitFor(() => expect(screen.getByTestId('suggest-chips')).toBeInTheDocument());
});

test('checkpoint undo restores via bridge', async () => {
  const mock = setup();
  let undone: unknown = null;
  mock.rpcImpl['git-status'] = () => ({ repo: true, lines: [' M a.txt'] });
  mock.rpcImpl['checkpoint-undo'] = (p) => { undone = p; return { cwd: 'C:\\p', restored: 1 }; };
  mock.execImpl = (id) => {
    mock.emitExec(id, { type: 'exec-start', checkpoint: 'cp-abc' });
    mock.emitExec(id, { type: 'exec-done', text: 'ok', exitCode: 0, terminal: 'completed' });
  };
  send(mock, 'hi');
  await waitFor(() => expect(screen.getByTestId('checkpoint-undo')).toBeInTheDocument());
  fireEvent.click(screen.getByTestId('checkpoint-undo'));
  expect(screen.getByTestId('checkpoint-undo')).toHaveTextContent('Sure?');
  fireEvent.click(screen.getByTestId('checkpoint-undo'));
  await waitFor(() => expect(undone).toEqual({ checkpointId: 'cp-abc' }));
  await waitFor(() => expect(screen.getByTestId('toast-stack')).toHaveTextContent('Undone'));
});

test('compact summarizes into a fresh session', async () => {
  const mock = setup();
  mock.rpcImpl['summarize'] = () => ({ summary: 'prior work summary' });
  mock.execImpl = (id) => {
    mock.emitExec(id, { type: 'exec-start' });
    mock.emitExec(id, { type: 'exec-done', text: 'ok', exitCode: 0, terminal: 'completed' });
  };
  send(mock, 'one');
  await waitFor(() => expect(screen.getByTestId('thought-summary')).toBeInTheDocument());
  send(mock, 'two');
  await waitFor(() => expect(screen.getByTestId('compact-btn')).toBeInTheDocument());
  fireEvent.click(screen.getByTestId('compact-btn'));
  await waitFor(() => expect(screen.getByTestId('toast-stack')).toHaveTextContent('compacted'));
  await waitFor(() => expect(screen.getByTestId('message-list')).toHaveTextContent('prior work summary'));
});

test('diagnostics event renders issue list', async () => {
  const mock = setup();
  mock.execImpl = (id) => {
    mock.emitExec(id, { type: 'exec-start' });
    mock.emitExec(id, { type: 'exec-diagnostics', issues: [{ file: 'a.js', line: 3, message: 'Unexpected token', tool: 'node' }], checked: 1 });
    mock.emitExec(id, { type: 'exec-done', text: 'ok', exitCode: 0, terminal: 'completed' });
  };
  send(mock, 'hi');
  await waitFor(() => expect(screen.getByTestId('diagnostics')).toBeInTheDocument());
  expect(screen.getByTestId('diagnostics')).toHaveTextContent('a.js:3');
});