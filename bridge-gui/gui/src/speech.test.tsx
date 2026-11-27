import { fireEvent, render, screen, waitFor, act } from '@testing-library/react';
import App from './app';
import { MockBridge } from './test/mock-bridge';
import { seedProject } from './test/seed';
import { stopSpeech } from './lib/speech';

class FakeUtt {
  text = '';
  voice: unknown = null;
  rate = 1;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
}

function mockSpeech(spoken: string[], cancelled: string[]) {
  const voices = [
    { name: 'Microsoft David', lang: 'en-US', voiceURI: 'david' },
    { name: 'Microsoft Zira', lang: 'en-US', voiceURI: 'zira' },
  ];
  Object.defineProperty(window, 'speechSynthesis', {
    value: {
      speak: (u: FakeUtt) => { spoken.push(u.text); },
      cancel: () => { cancelled.push('x'); },
      getVoices: () => voices,
      addEventListener: () => {},
      removeEventListener: () => {},
    },
    configurable: true,
  });
  Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: FakeUtt, configurable: true });
}

function unmockSpeech() {
  const w = window as unknown as Record<string, unknown>;
  delete w.speechSynthesis;
  delete w.SpeechSynthesisUtterance;
}

function setup() {
  seedProject();
  try { stopSpeech(); } catch { /* noop */ }
  const mock = new MockBridge();
  mock.rpcImpl['git-status'] = () => ({ repo: false });
  render(<App client={mock} />);
  act(() => { mock.open(); });
  return mock;
}

test('speak button reads cleaned reply text', async () => {
  const spoken: string[] = [];
  const cancelled: string[] = [];
  mockSpeech(spoken, cancelled);
  try {
    const mock = setup();
    mock.execImpl = (id) => {
      mock.emitExec(id, { type: 'exec-start' });
      mock.emitExec(id, { type: 'exec-done', text: '**Done**\n```js\nA\nB\n```', exitCode: 0, terminal: 'completed' });
    };
    fireEvent.change(screen.getByTestId('composer-input'), { target: { value: 'hi' } });
    fireEvent.click(screen.getByTestId('send-btn'));
    await waitFor(() => expect(screen.getByTestId('speak-btn')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('speak-btn'));
    await waitFor(() => expect(spoken).toHaveLength(1));
    expect(spoken[0]).toContain('Code block, 2 lines, js.');
    expect(spoken[0]).not.toContain('**');
    fireEvent.click(screen.getByTestId('speak-btn'));
    expect(cancelled.length).toBeGreaterThan(0);
  } finally {
    unmockSpeech();
  }
});

test('voice section lists voices and persists choice', async () => {
  const spoken: string[] = [];
  const cancelled: string[] = [];
  mockSpeech(spoken, cancelled);
  try {
    setup();
    fireEvent.click(screen.getByText('More'));
    await waitFor(() => expect(screen.getByTestId('voice-select')).toBeInTheDocument());
    expect(screen.getByTestId('voice-select')).toHaveTextContent('Zira');
    fireEvent.change(screen.getByTestId('voice-select'), { target: { value: 'zira' } });
    const saved = JSON.parse(localStorage.getItem('muse_settings')!);
    expect(saved.voice.uri).toBe('zira');
    fireEvent.click(screen.getByTestId('voice-test'));
    await waitFor(() => expect(spoken).toHaveLength(1));
  } finally {
    unmockSpeech();
  }
});
