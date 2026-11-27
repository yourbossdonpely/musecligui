import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import Ws from 'ws';
import App from '../app';
import { BridgeClient, type SocketLike } from '../lib/bridge';

function setup() {
  localStorage.clear();
  const client = new BridgeClient((url) => new Ws(url) as unknown as SocketLike);
  render(<App client={client} />);
  return client;
}

test('e2e real file tree and preview', async () => {
  setup();
  await waitFor(() => expect(screen.getByTestId('conn-text')).toHaveTextContent('Connected'), { timeout: 15000 });
  fireEvent.click(screen.getByText('+ New Project'));
  fireEvent.change(screen.getByTestId('proj-name'), { target: { value: 'E2E' } });
  fireEvent.change(screen.getByTestId('proj-path'), { target: { value: process.env.TEST_PROJ! } });
  fireEvent.click(screen.getByText('Save Project'));
  await waitFor(() => expect(screen.getByTestId('file-tree')).toHaveTextContent('a.txt'), { timeout: 15000 });
  fireEvent.click(screen.getByText('sub'));
  await waitFor(() => expect(screen.getByTestId('file-tree')).toHaveTextContent('b.txt'), { timeout: 15000 });
  fireEvent.click(screen.getByText('a.txt'));
  await waitFor(() => expect(screen.getByRole('dialog')).toHaveTextContent('hello-fs'), { timeout: 15000 });
}, 45000);