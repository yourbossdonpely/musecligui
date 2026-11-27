import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from './app';
import { MockBridge, stdFs } from './test/mock-bridge';

beforeEach(() => {
  localStorage.clear();
});

function setup(online: boolean, badRoot?: string) {
  const mock = new MockBridge();
  stdFs(mock.rpcImpl, badRoot);
  render(<App client={mock} />);
  if (online) mock.open();
  return mock;
}

test('add project flow persists', async () => {
  setup(true);
  fireEvent.click(screen.getByText('+ New Project'));
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  fireEvent.change(screen.getByTestId('proj-name'), { target: { value: 'Demo' } });
  fireEvent.change(screen.getByTestId('proj-path'), { target: { value: 'C:\\demo' } });
  fireEvent.click(screen.getByText('Save Project'));
  await waitFor(() => expect(screen.getByTestId('project-item')).toHaveTextContent('Demo'));
  await waitFor(() => expect(JSON.parse(localStorage.getItem('muse_projects') || '[]').length).toBe(1));
  const saved = JSON.parse(localStorage.getItem('muse_projects')!);
  expect(saved[0].name).toBe('Demo');
  expect(saved[0].sessions[0].sid).toMatch(/^[0-9a-f-]{36}$/);
});

test('add project blocked when folder unreadable', async () => {
  setup(true, 'C:\\nope');
  fireEvent.click(screen.getByText('+ New Project'));
  fireEvent.change(screen.getByTestId('proj-name'), { target: { value: 'Bad' } });
  fireEvent.change(screen.getByTestId('proj-path'), { target: { value: 'C:\\nope' } });
  fireEvent.click(screen.getByText('Save Project'));
  await waitFor(() => expect(screen.getByTestId('toast-stack')).toHaveTextContent('not found'));
  expect(screen.getByRole('dialog')).toBeInTheDocument();
});

test('sessions: add, select, delete', async () => {
  setup(false);
  fireEvent.click(screen.getByText('+ New Project'));
  fireEvent.change(screen.getByTestId('proj-name'), { target: { value: 'P' } });
  fireEvent.change(screen.getByTestId('proj-path'), { target: { value: 'C:\\p' } });
  fireEvent.click(screen.getByText('Save Project'));
  await waitFor(() => expect(screen.getByTestId('project-item')).toHaveTextContent('P'));
  fireEvent.click(screen.getByText('+ New Session'));
  expect(screen.getAllByTestId('session-item').length).toBe(2);
  fireEvent.click(screen.getAllByTestId('session-item')[1]);
  expect(screen.getAllByTestId('session-item')[1].className).toContain('active');
  fireEvent.click(screen.getAllByTestId('session-del')[0]);
  expect(screen.getAllByTestId('session-item').length).toBe(1);
});

test('edit and delete project', async () => {
  setup(false);
  fireEvent.click(screen.getByText('+ New Project'));
  fireEvent.change(screen.getByTestId('proj-name'), { target: { value: 'Old' } });
  fireEvent.change(screen.getByTestId('proj-path'), { target: { value: 'C:\\p' } });
  fireEvent.click(screen.getByText('Save Project'));
  await waitFor(() => expect(screen.getByTestId('project-item')).toHaveTextContent('Old'));
  fireEvent.click(screen.getByTitle('Edit project'));
  expect(screen.getByTestId('proj-name')).toHaveValue('Old');
  fireEvent.change(screen.getByTestId('proj-name'), { target: { value: 'New' } });
  fireEvent.click(screen.getByText('Save Project'));
  await waitFor(() => expect(screen.getByTestId('project-item')).toHaveTextContent('New'));
  fireEvent.click(screen.getByTitle('Delete project'));
  expect(screen.queryByTestId('project-item')).not.toBeInTheDocument();
});

test('picker fills path from drives', async () => {
  setup(true);
  fireEvent.click(screen.getByText('+ New Project'));
  fireEvent.click(screen.getByText('Browse...'));
  await waitFor(() => expect(screen.getByText('Drive C')).toBeInTheDocument());
  fireEvent.click(screen.getByText('Drive C'));
  await waitFor(() => expect(screen.getByText('sub')).toBeInTheDocument());
  fireEvent.click(screen.getByText('sub'));
  await waitFor(() => expect(screen.getByTestId('picker-path')).toHaveTextContent('C:\\sub'));
  fireEvent.click(screen.getByText('Select'));
  expect(screen.getByTestId('proj-path')).toHaveValue('C:\\sub');
});
test('browse uses native picker first', async () => {
  localStorage.clear();
  const mock = new MockBridge();
  mock.rpcImpl['pick-folder'] = () => ({ path: 'C:\\native' });
  const { default: App2 } = await import('./app');
  const { render: render2, screen: screen2, fireEvent: fe2, waitFor: wf2, act: act2 } = await import('@testing-library/react');
  render2(<App2 client={mock} />);
  act2(() => { mock.open(); });
  fe2.click(screen2.getByText('+ New Project'));
  fe2.click(screen2.getByText('Browse...'));
  await wf2(() => expect(screen2.getByTestId('proj-path')).toHaveValue('C:\\native'));
  expect(screen2.queryByTestId('picker-path')).not.toBeInTheDocument();
});