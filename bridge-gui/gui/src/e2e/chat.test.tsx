import { fireEvent, render, screen, waitFor, act } from '@testing-library/react';
import Ws from 'ws';
import App from '../app';
import { BridgeClient, type SocketLike } from '../lib/bridge';

function setup() {
  localStorage.clear();
  const client = new BridgeClient((url) => new Ws(url) as unknown as SocketLike);
  render(<App client={client} />);
  return client;
}

test('e2e streams from real bridge', async () => {
  setup();
  await waitFor(() => expect(screen.getByTestId('conn-text')).toHaveTextContent('Connected'), { timeout: 15000 });
  fireEvent.click(screen.getByText('+ New Project'));
  fireEvent.change(screen.getByTestId('proj-name'), { target: { value: 'E2E' } });
  fireEvent.change(screen.getByTestId('proj-path'), { target: { value: process.env.TEST_PROJ! } });
  fireEvent.click(screen.getByText('Save Project'));
  await waitFor(() => expect(screen.getByTestId('project-item')).toBeInTheDocument());
  fireEvent.change(screen.getByTestId('composer-input'), { target: { value: 'hi' } });
  fireEvent.click(screen.getByTestId('send-btn'));
  await waitFor(() => expect(screen.getByTestId('message-list')).toHaveTextContent('Hello from stub!'), { timeout: 20000 });
  expect(screen.getByTestId('tool-card')).toBeInTheDocument();
  expect(screen.getByTestId('tokens-value')).toHaveTextContent('10 in / 5 out');
}, 30000);

test('e2e stop interrupts slow run', async () => {
  setup();
  await waitFor(() => expect(screen.getByTestId('conn-text')).toHaveTextContent('Connected'), { timeout: 15000 });
  fireEvent.click(screen.getByText('+ New Project'));
  fireEvent.change(screen.getByTestId('proj-name'), { target: { value: 'E2E' } });
  fireEvent.change(screen.getByTestId('proj-path'), { target: { value: process.env.TEST_PROJ! } });
  fireEvent.click(screen.getByText('Save Project'));
  await waitFor(() => expect(screen.getByTestId('project-item')).toBeInTheDocument());
  fireEvent.change(screen.getByTestId('composer-input'), { target: { value: '[SLOW] wait' } });
  fireEvent.click(screen.getByTestId('send-btn'));
  await waitFor(() => expect(screen.getByTestId('stop-btn')).toBeInTheDocument(), { timeout: 10000 });
  fireEvent.click(screen.getByTestId('stop-btn'));
  await waitFor(() => expect(screen.getByTestId('message-list')).toHaveTextContent('Stopped by user'), { timeout: 20000 });
}, 40000);