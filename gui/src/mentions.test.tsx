import { fireEvent, render, screen, waitFor, act } from '@testing-library/react';
import App from './app';
import { MockBridge } from './test/mock-bridge';
import { seedProject } from './test/seed';

function setup() {
  seedProject();
  const mock = new MockBridge();
  mock.rpcImpl['git-status'] = () => ({ repo: false });
  mock.rpcImpl['fs-list'] = () => ({ path: 'C:\\p', entries: [{ name: 'a.txt', type: 'file', size: 8 }, { name: 'sub', type: 'dir', size: null }] });
  mock.rpcImpl['fs-read'] = () => ({ path: 'C:\\p\\a.txt', size: 8, content: 'hello-mention' });
  render(<App client={mock} />);
  act(() => { mock.open(); });
  return mock;
}

function typeMention(text: string) {
  const input = screen.getByTestId('composer-input') as HTMLTextAreaElement;
  fireEvent.change(input, { target: { value: text } });
  input.selectionStart = text.length;
  input.selectionEnd = text.length;
  fireEvent.keyUp(input);
  return input;
}

test('typing @ shows file dropdown and pick inserts', async () => {
  setup();
  typeMention('see @a');
  await waitFor(() => expect(screen.getByTestId('mention-list')).toBeInTheDocument());
  expect(screen.getAllByTestId('mention-item')[0]).toHaveTextContent('a.txt');
  fireEvent.mouseDown(screen.getAllByTestId('mention-item')[0]);
  expect((screen.getByTestId('composer-input') as HTMLTextAreaElement).value).toBe('see @a.txt ');
});

test('sending @mention auto-attaches the file', async () => {
  const mock = setup();
  mock.execImpl = (id) => {
    mock.emitExec(id, { type: 'exec-start' });
    mock.emitExec(id, { type: 'exec-done', text: 'ok', exitCode: 0, terminal: 'completed' });
  };
  typeMention('check @a.txt');
  fireEvent.click(screen.getByTestId('send-btn'));
  await waitFor(() => expect(mock.sent.length).toBe(1));
  await waitFor(() => expect(screen.getByTestId('message-list')).toHaveTextContent('[+1 attached file(s)]'));
  expect(String((mock.sent[0] as Record<string, unknown>)['context'])).toContain('hello-mention');
});

test('no dropdown without project match', async () => {
  const mock = setup();
  mock.rpcImpl['fs-list'] = () => ({ path: 'C:\\p', entries: [] });
  typeMention('@zzz');
  await waitFor(() => expect(screen.queryByTestId('mention-list')).not.toBeInTheDocument());
});
