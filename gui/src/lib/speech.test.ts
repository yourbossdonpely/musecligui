import { describe, expect, test } from 'vitest';
import { pickVoice, speechText } from './speech';

describe('speech', () => {
  test('collapses code blocks to spoken placeholders', () => {
    expect(speechText('See:\n```js\nconst a = 1;\nconst b = 2;\n```')).toContain('Code block, 2 lines, js.');
  });
  test('strips markdown formatting', () => {
    expect(speechText('# Hi\n\n**bold** and `code` and [link](https://x)')).toBe('Hi\n\nbold and code and link');
  });
  test('strips suggest blocks and quotes', () => {
    expect(speechText('> quoted\n[SUGGEST]\na\n[/SUGGEST]')).toBe('quoted');
  });
  test('picks preferred female english voice', () => {
    const voices = [
      { name: 'Microsoft David', lang: 'en-US', voiceURI: 'david' },
      { name: 'Microsoft Zira', lang: 'en-US', voiceURI: 'zira' },
      { name: 'Google Deutsch', lang: 'de-DE', voiceURI: 'de' },
    ];
    expect(pickVoice(voices)?.voiceURI).toBe('zira');
    expect(pickVoice(voices, 'david')?.voiceURI).toBe('david');
    expect(pickVoice([])).toBeNull();
  });
  test('prefers natural online voices on ties', () => {
    const voices = [
      { name: 'Microsoft Guy', lang: 'en-US', voiceURI: 'guy' },
      { name: 'Microsoft Aria Online (Natural)', lang: 'en-US', voiceURI: 'aria' },
    ];
    expect(pickVoice(voices)?.voiceURI).toBe('aria');
  });
});
