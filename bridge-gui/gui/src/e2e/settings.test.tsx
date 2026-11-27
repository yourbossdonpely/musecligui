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

test('e2e skills toggle and usage', async () => {
  setup();
  await waitFor(() => expect(screen.getByTestId('conn-text')).toHaveTextContent('Connected'), { timeout: 15000 });
  await waitFor(() => expect(screen.getByTestId('skills-list')).toHaveTextContent('A'), { timeout: 15000 });
  await waitFor(() => expect(screen.getByTestId('usage-tier')).toHaveTextContent('Stub Plan'), { timeout: 15000 });
  const rows = screen.getByTestId('skills-list').querySelectorAll('[data-testid="skill-row"]');
  fireEvent.click(rows[0]);
  await waitFor(() => expect(screen.getByTestId('skills-list')).toHaveTextContent('OFF'), { timeout: 15000 });
}, 45000);

test('e2e models and perms from stub', async () => {
  setup();
  await waitFor(() => expect(screen.getByTestId('conn-text')).toHaveTextContent('Connected'), { timeout: 15000 });
  fireEvent.click(screen.getByTestId('model-value'));
  await waitFor(() => expect(screen.getByTestId('model-list')).toHaveTextContent('muse-spark-1.3'), { timeout: 15000 });
  fireEvent.click(screen.getByText('Close'));
  fireEvent.click(screen.getByTestId('mode-value'));
  await waitFor(() => expect(screen.getByTestId('perms-modes')).toBeInTheDocument(), { timeout: 15000 });
}, 45000);