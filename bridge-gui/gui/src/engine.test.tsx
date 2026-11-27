import { fireEvent, render, screen, waitFor, act } from '@testing-library/react';
import { AppProvider, useApp } from './state/store';
import { MockBridge } from './test/mock-bridge';

function Harness() {
  const { send, stop, run, currentMessages } = useApp();
  return (
    <div>
      <button onClick={() => send('hi')}>go</button>
      <button onClick={() => stop()}>halt</button>
      <div data-testid="run-text">{run ? run.text : 'none'}</div>
      <div data-testid="run-tools">{run ? run.tools.length : 0}</div>
      <div data-testid="last-msg">{[...currentMessages].reverse().find((m) => m.type === 'user' || m.type === 'muse')?.text ?? 'empty'}</div>
      <div data-testid="has-thought">{currentMessages.some((m) => m.type === 'thought') ? 'yes' : 'no'}</div>
    </div>
  );
}

function seed() {
  localStorage.clear();
  localStorage.setItem('muse_projects', JSON.stringify([{ id: 1, name: 'P', path: 'C:\\p', sessions: [{ id: 2, sid: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', name: 'S1', time: 't', messages: [] }] }]));
  localStorage.setItem('muse_selected', JSON.stringify({ p: 1, s: 2 }));
}

beforeEach(() => {
  seed();
});

test('exec streams deltas and tools then finalizes', async () => {
  const mock = new MockBridge();
  render(<AppProvider client={mock}><Harness /></AppProvider>);
  act(() => { mock.open(); });
  mock.execImpl = (id) => {
    mock.emitExec(id, { type: 'exec-start' });
    mock.emitExec(id, { type: 'exec-delta', text: 'Hello ' });
    mock.emitExec(id, { type: 'exec-tool', taskId: 't1', name: 'read_file', event: 'started' });
    mock.emitExec(id, { type: 'exec-delta', text: 'world' });
    mock.emitExec(id, { type: 'exec-tool', taskId: 't1', name: 'read_file', event: 'completed' });
    mock.emitExec(id, { type: 'exec-done', text: 'Hello world', exitCode: 0, terminal: 'completed', stats: { deltas: 2, tools: 2 } });
  };
  fireEvent.click(screen.getByText('go'));
  await waitFor(() => expect(screen.getByTestId('last-msg')).toHaveTextContent('Hello world'));
  expect(screen.getByTestId('has-thought')).toHaveTextContent('yes');
  expect(screen.getByTestId('run-text')).toHaveTextContent('none');
  const sent = mock.sent[0] as Record<string, unknown>;
  expect(sent['action']).toBe('exec');
  expect(String(sent['command']).startsWith('hi')).toBe(true);
  expect(String(sent['command'])).toContain('[SUGGEST]');
  expect(sent['cwd']).toBe('C:\\p');
});

test('exec failure surfaces and clears run', async () => {
  const mock = new MockBridge();
  render(<AppProvider client={mock}><Harness /></AppProvider>);
  act(() => { mock.open(); });
  mock.execImpl = (id) => {
    mock.emitExec(id, { type: 'result', action: 'exec', ok: false, error: 'nope' });
  };
  fireEvent.click(screen.getByText('go'));
  await waitFor(() => expect(screen.getByTestId('last-msg')).toHaveTextContent('nope'));
  expect(screen.getByTestId('run-text')).toHaveTextContent('none');
});

test('stop requests and marks stopped run', async () => {
  const mock = new MockBridge();
  let stopped = false;
  mock.rpcImpl['stop'] = () => { stopped = true; return { stopped: true }; };
  render(<AppProvider client={mock}><Harness /></AppProvider>);
  act(() => { mock.open(); });
  mock.execImpl = (id) => {
    mock.emitExec(id, { type: 'exec-start' });
  };
  fireEvent.click(screen.getByText('go'));
  await waitFor(() => expect(screen.getByTestId('run-text')).toHaveTextContent(/^$/));
  fireEvent.click(screen.getByText('halt'));
  await waitFor(() => expect(stopped).toBe(true));
  const id = (mock.sent[0] as Record<string, unknown>)['id'] as string;
  mock.emitExec(id, { type: 'exec-done', text: 'partial', exitCode: 0, terminal: 'completed' });
  await waitFor(() => expect(screen.getByTestId('last-msg')).toHaveTextContent('Stopped by user'));
});

test('demo reply when offline', async () => {
  vi.useFakeTimers();
  try {
    const mock = new MockBridge();
    render(<AppProvider client={mock}><Harness /></AppProvider>);
    fireEvent.click(screen.getByText('go'));
    act(() => { vi.advanceTimersByTime(1500); });
    vi.useRealTimers();
    await waitFor(() => expect(screen.getByTestId('last-msg')).toHaveTextContent('Demo'));
  } finally {
    vi.useRealTimers();
  }
});