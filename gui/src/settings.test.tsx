import { fireEvent, render, screen, waitFor, act } from '@testing-library/react';
import App from './app';
import { MockBridge } from './test/mock-bridge';
import { seedProject } from './test/seed';

function setup() {
  seedProject();
  const mock = new MockBridge();
  mock.rpcImpl['skills-list'] = () => ({ skills: [
    { id: 'a', name: 'A-skill', scope: 'user', activation: 'on', desc: 'da', warnings: 0 },
    { id: 'b', name: 'B-skill', scope: 'project', activation: 'off', desc: 'db', warnings: 1 },
  ], count: 2 });
  mock.rpcImpl['skills-set'] = () => ({ ok: true });
  mock.rpcImpl['usage'] = () => ({ tier: 'Stub Plan', window: '12% used, resets in 1h', weekly: '3% used, resets in 2d' });
  mock.rpcImpl['models-list'] = () => ({ models: ['muse-spark-1.3', 'muse-ember-1.0'], cached: false });
  render(<App client={mock} />);
  act(() => { mock.open(); });
  return mock;
}

test('skills render, toggle, filter', async () => {
  setup();
  await waitFor(() => expect(screen.getByTestId('skills-list')).toHaveTextContent('A-skill'));
  expect(screen.getByTestId('skills-list')).toHaveTextContent('B-skill');
  const rows = screen.getByTestId('skills-list').querySelectorAll('[data-testid="skill-row"]');
  fireEvent.click(rows[0]);
  await waitFor(() => expect(screen.getByTestId('skills-list')).toHaveTextContent('OFF'));
  fireEvent.change(screen.getByTestId('skill-filter'), { target: { value: 'zzz' } });
  expect(screen.getByTestId('skills-list').querySelectorAll('[data-testid="skill-row"]').length).toBe(0);
  fireEvent.change(screen.getByTestId('skill-filter'), { target: { value: '' } });
  expect(screen.getByTestId('skills-list').querySelectorAll('[data-testid="skill-row"]').length).toBe(2);
});

test('usage bars render both windows', async () => {
  setup();
  await waitFor(() => expect(screen.getByTestId('usage-tier')).toHaveTextContent('Stub Plan'));
  expect(screen.getByTestId('usage-window-bar').style.width).toBe('12%');
  expect(screen.getByTestId('usage-weekly-bar').style.width).toBe('3%');
  expect(screen.getByTestId('usage-value')).toHaveTextContent('12%');
});

test('model modal selects model, effort, contributor', async () => {
  setup();
  fireEvent.click(screen.getByTestId('model-value'));
  await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
  const rows = screen.getByTestId('model-list').querySelectorAll('[data-model]');
  let pick: Element | null = null;
  rows.forEach((r) => { if (r.getAttribute('data-model') === 'muse-spark-1.3') pick = r; });
  fireEvent.click(pick!);
  await waitFor(() => expect(screen.getByTestId('model-value')).toHaveTextContent('muse-spark-1.3'));
  fireEvent.click(screen.getByTestId('model-value'));
  await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
  fireEvent.change(screen.getByTestId('effort-select'), { target: { value: 'low' } });
  fireEvent.change(screen.getByTestId('contrib-select'), { target: { value: 'on' } });
  expect((screen.getByTestId('effort-select') as HTMLSelectElement).value).toBe('low');
  expect((screen.getByTestId('contrib-select') as HTMLSelectElement).value).toBe('on');
});

test('perms modal switches mode and customizes flags', async () => {
  setup();
  fireEvent.click(screen.getByTestId('mode-value'));
  await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
  const cards = screen.getByTestId('perms-modes').querySelectorAll('.mode-card');
  expect(cards.length).toBe(5);
  let plan: Element | null = null;
  cards.forEach((c) => { if (c.textContent!.includes('Read-only exploration')) plan = c; });
  fireEvent.click(plan!);
  expect(screen.getByTestId('perms-preview')).toHaveTextContent('--disable-write');
  expect(screen.getByTestId('mode-value')).toHaveTextContent('Plan');
  const boxes = screen.getByRole('dialog').querySelectorAll('input[type="checkbox"]');
  fireEvent.click(boxes[0]);
  expect(screen.getByTestId('mode-value')).toHaveTextContent('Custom');
});