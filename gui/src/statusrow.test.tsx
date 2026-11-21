import { fireEvent, render, screen, waitFor, act, within } from '@testing-library/react';
import App from './app';
import { MockBridge } from './test/mock-bridge';
import { seedProject } from './test/seed';

function setup(settings?: Record<string, unknown>) {
  seedProject();
  if (settings) localStorage.setItem('muse_settings', JSON.stringify(settings));
  const mock = new MockBridge();
  mock.rpcImpl['git-status'] = () => ({ repo: false });
  render(<App client={mock} />);
  act(() => { mock.open(); });
  return mock;
}

function send(text: string) {
  fireEvent.change(screen.getByTestId('composer-input'), { target: { value: text } });
  fireEvent.click(screen.getByTestId('send-btn'));
}

test('composer status shows model, mode, tokens, context', async () => {
  const mock = setup({ model: 'm', contextWindows: { m: 100 } });
  expect(screen.getByTestId('model-chip')).toHaveTextContent('m');
  mock.execImpl = (id) => {
    mock.emitExec(id, { type: 'exec-start' });
    mock.emitExec(id, { type: 'exec-usage', usage: { models: [{ input_tokens: 10, output_tokens: 5 }] } });
    mock.emitExec(id, { type: 'exec-done', text: 'ok', exitCode: 0, terminal: 'completed' });
  };
  send('hi');
  await waitFor(() => expect(screen.getByTestId('tokens-value')).toHaveTextContent('10 in / 5 out'));
  await waitFor(() => expect(screen.getByTestId('context-status')).toHaveTextContent('15%'));
  expect(screen.getByTestId('context-status')).toHaveTextContent('15 / 100');
});

test('context prompts to set window when unknown', async () => {
  const mock = setup();
  mock.execImpl = (id) => {
    mock.emitExec(id, { type: 'exec-start' });
    mock.emitExec(id, { type: 'exec-usage', usage: { models: [{ input_tokens: 7, output_tokens: 3 }] } });
    mock.emitExec(id, { type: 'exec-done', text: 'ok', exitCode: 0, terminal: 'completed' });
  };
  send('hi');
  await waitFor(() => expect(screen.getByTestId('context-status')).toHaveTextContent('10 tokens'));
});

test('model modal sets context window', async () => {
  setup();
  fireEvent.click(screen.getByTestId('model-chip'));
  await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
  fireEvent.change(screen.getByTestId('context-input'), { target: { value: '200000' } });
  const saved = JSON.parse(localStorage.getItem('muse_settings')!);
  expect(saved.contextWindows['']).toBe(200000);
});

test('footer stays slim with bridge and project', async () => {
  setup({ model: 'm' });
  expect(screen.getByTestId('conn-text')).toBeInTheDocument();
  expect(screen.getByTestId('project-value')).toHaveTextContent('P');
  expect(within(screen.getByTestId('conn-bar')).queryByTestId('tokens-value')).not.toBeInTheDocument();
});