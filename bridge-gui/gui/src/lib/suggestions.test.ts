import { describe, expect, test } from 'vitest';
import { SUGGEST_SUFFIX, fallbackSuggestions, parseSuggestions, stripSuggestions } from './suggestions';

describe('suggestions', () => {
  test('parses a well-formed block', () => {
    const t = 'Done.\n[SUGGEST]\nReview the diff\nRun the tests\nExplain why\n[/SUGGEST]';
    expect(parseSuggestions(t)).toEqual(['Review the diff', 'Run the tests', 'Explain why']);
  });
  test('strips bullets, numbers and caps at three', () => {
    const t = '[SUGGEST]\n- one\n2. two\n* three\n4) four\n[/SUGGEST]';
    expect(parseSuggestions(t)).toEqual(['one', 'two', 'three']);
  });
  test('returns empty without a block', () => {
    expect(parseSuggestions('plain reply')).toEqual([]);
  });
  test('strip removes the block and collapses gaps', () => {
    const t = 'Done.\n\n[SUGGEST]\na\n[/SUGGEST]\n\nThanks.';
    expect(stripSuggestions(t)).toBe('Done.\n\nThanks.');
  });
  test('strip leaves plain text alone', () => {
    expect(stripSuggestions('hello')).toBe('hello');
  });
  test('fallbacks exist per mode and default to build', () => {
    expect(fallbackSuggestions('plan')).toHaveLength(3);
    expect(fallbackSuggestions('nope')).toEqual(fallbackSuggestions('build'));
  });
  test('suffix instructs the model', () => {
    expect(SUGGEST_SUFFIX).toContain('[SUGGEST]');
  });
});
