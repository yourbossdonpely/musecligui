import { fireEvent, render, screen, waitFor, act } from '@testing-library/react';
import App from './app';
import { MockBridge } from './test/mock-bridge';
import { seedProject } from './test/seed';

function setup(paused = false) {
  seedProject();
  const mock = new MockBridge();
  const calls: string[] = [];
  mock.rpcImpl['ping'] = () => ({ version: '2.6.0', muse: 'stub', paused });
  mock.rpcImpl['git-status'] = () => ({ repo: false });
  mock.rpcImpl['bridge-stop'] = () => { calls.push('bridge-stop'); return { paused: true }; };
  mock.rpcImpl['bridge-start'] = () => { calls.push('bridge-start'); return { paused: false }; };
  mock.rpcImpl['bridge-shutdown'] = () => { calls.push('bridge-shutdown'); return { shutdown: true }; };
  render(<App client={mock} />);
  act(() => { mock.open(); });
  return { mock, calls };
}

test('footer stop pauses bridge and start resumes', async () => {
  const { calls } = setup();
  await waitFor(() => expect(screen.getByTestId('conn-text')).toHaveTextContent('Bridge: Connected'));
  expect(screen.getByTestId('bridge-stop-btn')).toBeInTheDocument();
  expect(screen.getByTestId('bridge-quit-btn')).toBeInTheDocument();
  fireEvent.click(screen.getByTestId('bridge-stop-btn'));
  await waitFor(() => expect(screen.getByTestId('conn-text')).toHaveTextContent('Bridge: Stopped'));
  expect(calls).toEqual(['bridge-stop']);
  expect(screen.getByTestId('bridge-start-btn')).toBeInTheDocument();
  expect(screen.queryByTestId('bridge-stop-btn')).not.toBeInTheDocument();
  fireEvent.click(screen.getByTestId('bridge-start-btn'));
  await waitFor(() => expect(screen.getByTestId('conn-text')).toHaveTextContent('Bridge: Connected'));
  expect(calls).toEqual(['bridge-stop', 'bridge-start']);
});

test('footer quit shuts bridge down with restart hint', async () => {
  const { calls } = setup();
  await waitFor(() => expect(screen.getByTestId('bridge-quit-btn')).toBeInTheDocument());
  fireEvent.click(screen.getByTestId('bridge-quit-btn'));
  await waitFor(() => expect(screen.getByTestId('toast-stack')).toHaveTextContent('Bridge shutting down'));
  expect(calls).toEqual(['bridge-shutdown']);
});

test('footer reflects paused bridge from ping on connect', async () => {
  setup(true);
  await waitFor(() => expect(screen.getByTestId('conn-text')).toHaveTextContent('Bridge: Stopped'));
  expect(screen.getByTestId('bridge-start-btn')).toBeInTheDocument();
});

test('footer hides bridge buttons when disconnected', async () => {
  seedProject();
  const mock = new MockBridge();
  mock.rpcImpl['git-status'] = () => ({ repo: false });
  render(<App client={mock} />);
  expect(screen.getByTestId('conn-text')).toHaveTextContent('Bridge: Disconnected');
  expect(screen.queryByTestId('bridge-stop-btn')).not.toBeInTheDocument();
  expect(screen.queryByTestId('bridge-quit-btn')).not.toBeInTheDocument();
});
